import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Popover, Select, TimePicker, Upload } from 'antd'
import type { UploadFile } from 'antd'
import dayjs from 'dayjs'
import { FileTextOutlined, InboxOutlined, InfoCircleOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { blurLeavesRow } from '../../lib/form'
import { CLUB_ACTIVITIES, addDraft, nextActivityId, replaceActivity } from './mock'
import { TIME_RANGE_SEP } from './utils'
import { BUDGET_CATEGORIES, BUDGET_HINTS, fmtMoney, type Activity } from './types'
import './actform.css'

// '18:00–21:00'(容忍 -/—)→ [開始, 結束] TimePicker 值
function parseTimeRange(tr?: string): [dayjs.Dayjs | undefined, dayjs.Dayjs | undefined] {
  if (!tr) return [undefined, undefined]
  const [a, b] = tr.split(TIME_RANGE_SEP).map((t) => dayjs(t.trim(), 'HH:mm'))
  return [a?.isValid() ? a : undefined, b?.isValid() ? b : undefined]
}

interface BudgetRow {
  key: number
  category: string
  description: string
  selfFund: number | null
  requestedSubsidy: number | null
}

const emptyBudget = (key: number): BudgetRow => ({
  key,
  category: BUDGET_CATEGORIES[0],
  description: '',
  selfFund: null,
  requestedSubsidy: null,
})

// 科目仍為預設值且其餘皆空才視為空列,避免剛選好的科目被 blur 整理吃掉
const isBudgetEmpty = (r: BudgetRow) =>
  r.category === BUDGET_CATEGORIES[0] && !r.description.trim() && r.selfFund == null && r.requestedSubsidy == null

interface WorkRow {
  key: number
  task: string
  owner: string
}

const isWorkEmpty = (w: WorkRow) => w.task.trim() === '' && w.owner.trim() === ''

// 附件加總上限(接後端後改讀 system_settings 的管理員設定值)
const MAX_ATTACHMENT_TOTAL_MB = 50
const MAX_ATTACHMENT_TOTAL_BYTES = MAX_ATTACHMENT_TOTAL_MB * 1024 * 1024
const totalBytes = (fs: UploadFile[]) => fs.reduce((sum, f) => sum + (f.size ?? 0), 0)

export default function ActivityFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const activityType = Form.useWatch('type', form)
  const [files, setFiles] = useState<UploadFile[]>([])

  // 編輯模式:僅草稿與被退回件可編輯,整筆預填
  const editing = id ? CLUB_ACTIVITIES.find((a) => a.id === id && (a.status === 'draft' || a.status === 'rejected')) : undefined

  // 自動增列:保證尾端永遠有一列空白;清空的列自動移除
  const workKeyRef = useRef((editing?.works?.length ?? 0) + 2)
  const [works, setWorks] = useState<WorkRow[]>(() => {
    const base = (editing?.works ?? []).map((w, i) => ({ key: i + 1, ...w }))
    return [...base, { key: base.length + 1, task: '', owner: '' }]
  })
  const budgetKeyRef = useRef((editing?.budget.length ?? 0) + 2)
  const [budget, setBudget] = useState<BudgetRow[]>(() => {
    const base = (editing?.budget ?? []).map((b, i) => ({
      key: i + 1,
      category: b.category,
      description: b.description,
      selfFund: b.selfFund || null,
      requestedSubsidy: b.requestedSubsidy || null,
    }))
    return [...base, emptyBudget(base.length + 1)]
  })

  // 輸入時只增列;空列的移除延後到 blur(避免打字中列被吃掉)
  const setWork = (key: number, patch: Partial<Omit<WorkRow, 'key'>>) => {
    setWorks((ws) => {
      const next = ws.map((w) => (w.key === key ? { ...w, ...patch } : w))
      if (!isWorkEmpty(next[next.length - 1])) {
        workKeyRef.current += 1
        next.push({ key: workKeyRef.current, task: '', owner: '' })
      }
      return next
    })
  }
  const compactWorks = () =>
    setWorks((ws) => {
      workKeyRef.current += 1
      return [...ws.filter((w) => !isWorkEmpty(w)), { key: workKeyRef.current, task: '', owner: '' }]
    })

  // 輸入時只增列;空列的移除延後到 blur
  const updateBudget = (key: number, patch: Partial<BudgetRow>) => {
    setBudget((rows) => {
      const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
      if (!isBudgetEmpty(next[next.length - 1])) {
        budgetKeyRef.current += 1
        next.push(emptyBudget(budgetKeyRef.current))
      }
      return next
    })
  }
  const compactBudget = () =>
    setBudget((rows) => {
      const filled = rows.filter((r) => !isBudgetEmpty(r))
      budgetKeyRef.current += 1
      return [...filled, emptyBudget(budgetKeyRef.current)]
    })

  const filledBudget = budget.filter((r) => !isBudgetEmpty(r))
  const totals = filledBudget.reduce(
    (acc, r) => ({ self: acc.self + (r.selfFund ?? 0), requested: acc.requested + (r.requestedSubsidy ?? 0) }),
    { self: 0, requested: 0 },
  )

  const buildDraft = (status: Activity['status']): Activity => {
    const v = form.getFieldsValue()
    const filledWorks = works.filter((w) => !isWorkEmpty(w))
    return {
      id: editing?.id ?? nextActivityId(),
      name: (v.name as string)?.trim() || '(未命名活動)',
      club: user?.club ?? '',
      type: (v.type as Activity['type']) ?? '社課',
      date: v.date ? v.date.format('YYYY/MM/DD') : '—',
      endDate: v.endDate ? v.endDate.format('YYYY/MM/DD') : undefined,
      timeRange: v.startTime && v.endTime ? `${v.startTime.format('HH:mm')}–${v.endTime.format('HH:mm')}` : undefined,
      location: v.location,
      participantsIn: v.participantsIn ?? undefined,
      participantsOut: v.participantsOut ?? undefined,
      content: (v.content as string)?.trim() || undefined,
      works: filledWorks.length ? filledWorks.map((w) => ({ task: w.task.trim(), owner: w.owner.trim() })) : undefined,
      // 編輯重送保留原有附件(mock 不落地新選檔;真實上傳接後端時處理)
      attachments: editing?.attachments,
      isLarge: v.type === '活動' ? !!v.isLarge : undefined,
      status,
      budget: filledBudget.map((r, i) => ({
        id: i + 1,
        category: r.category,
        description: r.description,
        selfFund: r.selfFund ?? 0,
        requestedSubsidy: r.requestedSubsidy ?? 0,
      })),
    }
  }

  const persist = (a: Activity) => (editing ? replaceActivity(a) : addDraft(a))

  const saveDraft = () => {
    const doSave = () => {
      persist(buildDraft('draft'))
      message.success('已暫存草稿')
      navigate('/activities')
    }
    if (files.length > 0) {
      // 草稿不保存附件:避免未送出檔案殘留伺服器(孤兒檔案/個資殘留)
      modal.confirm({
        title: '附件不會隨草稿保存',
        content: `已選擇的 ${files.length} 個附件將被捨棄,送出申請時需重新上傳。確定要暫存草稿?`,
        okText: '捨棄附件並暫存',
        maskClosable: true,
        cancelText: '取消',
        onOk: doSave,
      })
      return
    }
    doSave()
  }

  const onFinish = () => {
    // 起訖為必填,通過 Form 驗證後必有值;僅需檢查先後順序
    const v = form.getFieldsValue()
    const start = dayjs(`${v.date.format('YYYY/MM/DD')} ${v.startTime.format('HH:mm')}`, 'YYYY/MM/DD HH:mm')
    const end = dayjs(`${v.endDate.format('YYYY/MM/DD')} ${v.endTime.format('HH:mm')}`, 'YYYY/MM/DD HH:mm')
    if (!end.isAfter(start)) {
      message.error('活動結束時間須晚於開始時間。')
      return
    }
    if (!works.some((w) => w.task.trim() !== '' && w.owner.trim() !== '')) {
      message.error('請填寫至少一筆工作分配。')
      return
    }
    persist(buildDraft('pending_advisor'))
    message.success('已送出申請')
    navigate('/activities')
  }

  if (id && !editing) return <Navigate to="/activities" replace />

  return (
    <div>
      <PageHeader title="活動申請" />

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark
        onValuesChange={(changed) => {
          // 單日活動居多:選開始日期時,結束日期未填就自動帶同一天
          if ('date' in changed && changed.date && !form.getFieldValue('endDate')) {
            form.setFieldValue('endDate', changed.date)
          }
        }}
        initialValues={
          editing
            ? {
                name: editing.name === '（未命名活動）' ? '' : editing.name,
                type: editing.type,
                isLarge: editing.isLarge,
                location: editing.location,
                date: editing.date !== '—' ? dayjs(editing.date, 'YYYY/MM/DD') : undefined,
                endDate: (() => {
                  const d = editing.endDate ?? (editing.date !== '—' ? editing.date : undefined)
                  return d ? dayjs(d, 'YYYY/MM/DD') : undefined
                })(),
                startTime: parseTimeRange(editing.timeRange)[0],
                endTime: parseTimeRange(editing.timeRange)[1],
                participantsIn: editing.participantsIn,
                participantsOut: editing.participantsOut,
                content: editing.content,
              }
            : { type: '社課' }
        }
      >
        <div className="actform-grid">
          {/* 左欄:基本資料 */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>基本資料</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Form.Item
                name="name"
                label="活動名稱"
                rules={[{ required: true, message: '請輸入活動名稱' }]}
                style={{ marginBottom: 0 }}
              >
                <Input />
              </Form.Item>
              <div className="form-grid-2">
                <Form.Item label="活動類型" required style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Form.Item name="type" noStyle rules={[{ required: true }]}>
                      <Select style={{ flex: 1 }} options={['社課', '活動', '會議'].map((v) => ({ value: v, label: v }))} />
                    </Form.Item>
                    {activityType === '活動' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                        <Form.Item name="isLarge" valuePropName="checked" noStyle>
                          <Checkbox style={{ whiteSpace: 'nowrap' }}>大活動</Checkbox>
                        </Form.Item>
                        <Popover
                          trigger={['hover', 'click']}
                          content={
                            <div style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 280 }}>
                              工作人員或服務對象達 <span className="num">50</span> 人以上、活動連續辦理 <span className="num">2-3</span> 天以上、總時數超過 <span className="num">20</span> 小時、活動經費達 <span className="num">10</span> 萬元以上、需 <span className="num">3</span> 個月以上籌備時間且召開 <span                         className="num">5</span> 次以上籌備會議。
                            </div>
                          }
                        >
                          <InfoCircleOutlined
                            aria-label="大型活動說明"
                            style={{ color: 'var(--steel)', fontSize: 14, cursor: 'help' }}
                          />
                        </Popover>
                      </span>
                    )}
                  </div>
                </Form.Item>
                <Form.Item
                  name="location"
                  label="地點"
                  rules={[{ required: true, message: '請輸入地點' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="活動地點" />
                </Form.Item>
              </div>
              <div className="form-grid-2">
                <Form.Item
                  name="date"
                  label="開始日期"
                  rules={[{ required: true, message: '請選擇開始日期' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
                </Form.Item>
                <Form.Item
                  name="startTime"
                  label="開始時間"
                  rules={[{ required: true, message: '請選擇開始時間' }]}
                  style={{ marginBottom: 0 }}
                >
                  <TimePicker
                    style={{ width: '100%' }}
                    format={{ format: 'HH:mm', type: 'mask' }}
                    needConfirm={false}
                  />
                </Form.Item>
              </div>
              <div className="form-grid-2">
                <Form.Item
                  name="endDate"
                  label="結束日期"
                  rules={[{ required: true, message: '請選擇結束日期' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    format="YYYY/MM/DD"
                    disabledDate={(d) => {
                      const start = form.getFieldValue('date') as dayjs.Dayjs | undefined
                      return !!start && d.isBefore(start, 'day')
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="endTime"
                  label="結束時間"
                  rules={[{ required: true, message: '請選擇結束時間' }]}
                  style={{ marginBottom: 0 }}
                >
                  <TimePicker
                    style={{ width: '100%' }}
                    format={{ format: 'HH:mm', type: 'mask' }}
                    needConfirm={false}
                  />
                </Form.Item>
              </div>
              <div className="form-grid-2">
                <Form.Item
                  name="participantsIn"
                  label="校內參加人數"
                  rules={[{ required: true, message: '請輸入校內人數' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
                <Form.Item
                  name="participantsOut"
                  label="校外參加人數"
                  rules={[{ required: true, message: '請輸入校外人數' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
              </div>
              <Form.Item name="content" label="活動內容（至多 150 字）" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={6} maxLength={150} showCount placeholder="活動目的、內容、預期效益" />
              </Form.Item>

              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  <span style={{ color: '#C13B34' }}>*</span> 工作分配
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {works.map((w) => (
                    <div key={w.key} onBlur={(e) => blurLeavesRow(e) && compactWorks()} style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={w.task}
                        onChange={(e) => setWork(w.key, { task: e.target.value })}
                        placeholder="項目"
                      />
                      <Input
                        value={w.owner}
                        onChange={(e) => setWork(w.key, { owner: e.target.value })}
                        placeholder="負責人"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 右欄:經費明細 + 附件 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>經費明細</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {budget.map((r) => {
                  const hint = BUDGET_HINTS[r.category]
                  return (
                    <div key={r.key} onBlur={(e) => blurLeavesRow(e) && compactBudget()} style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px' }}>
                      {/* 第一列:類別/自籌/擬請;第二列:經費說明整行(避免窄欄換行截斷) */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Select
                          aria-label="經費科目"
                          value={r.category}
                          onChange={(v) => updateBudget(r.key, { category: v })}
                          options={BUDGET_CATEGORIES.map((c) => ({ value: c, label: c }))}
                          style={{ flex: 1, minWidth: 150 }}
                        />
                        <InputNumber
                          aria-label="自籌"
                          className="num-right"
                          value={r.selfFund}
                          onChange={(v) => updateBudget(r.key, { selfFund: v })}
                          min={0}
                          precision={0}
                          controls={false}
                          placeholder="自籌"
                          style={{ width: 100 }}
                        />
                        <InputNumber
                          aria-label="擬請補助"
                          className="num-right"
                          value={r.requestedSubsidy}
                          onChange={(v) => updateBudget(r.key, { requestedSubsidy: v })}
                          min={0}
                          precision={0}
                          controls={false}
                          placeholder="擬請"
                          style={{ width: 100 }}
                        />
                      </div>
                      <Input
                        aria-label="經費說明"
                        value={r.description}
                        onChange={(e) => updateBudget(r.key, { description: e.target.value })}
                        placeholder="經費說明"
                        style={{ marginTop: 8 }}
                      />
                      {hint && (
                        <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 6 }}>{hint}</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 12, fontSize: 13 }}>
                <span>
                  自籌合計 <span className="num" style={{ fontWeight: 500 }}>{fmtMoney(totals.self)}</span>
                </span>
                <span>
                  擬請合計 <span className="num" style={{ fontWeight: 500 }}>{fmtMoney(totals.requested)}</span>
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>附件</div>
              <Upload.Dragger
                multiple
                accept=".pdf"
                fileList={files}
                beforeUpload={() => false}
                onChange={({ fileList }) => {
                  // 加總大小驗證:超過上限的新增檔整批拒收
                  if (totalBytes(fileList) > MAX_ATTACHMENT_TOTAL_BYTES) {
                    message.error(`附件合計超過 ${MAX_ATTACHMENT_TOTAL_MB} MB 上限`)
                    return
                  }
                  setFiles(fileList)
                }}
                showUploadList={false}
                style={{ background: 'transparent' }}
              >
                <p style={{ margin: '4px 0 8px' }}>
                  <InboxOutlined style={{ fontSize: 28, color: 'var(--steel)' }} />
                </p>
                <p style={{ fontSize: 13, color: 'var(--steel)', margin: 0 }}>拖放 PDF 檔案</p>
                <p style={{ fontSize: 12, color: 'var(--steel)', margin: '4px 0 0' }}>
                  已使用 <span className="num">{(totalBytes(files) / 1024 / 1024).toFixed(1)}/{MAX_ATTACHMENT_TOTAL_MB}</span> MB
                </p>
              </Upload.Dragger>
              {files.map((f) => (
                <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px 2px', fontSize: 13 }}>
                  <FileTextOutlined style={{ color: 'var(--steel)' }} />
                  <span style={{ fontWeight: 500 }}>{f.name}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
                    {f.size != null ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : ''}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => setFiles((fs) => fs.filter((x) => x.uid !== f.uid))}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button onClick={saveDraft}>暫存草稿</Button>
              <Button type="primary" htmlType="submit">
                送出申請
              </Button>
            </div>
          </div>
        </div>
      </Form>
    </div>
  )
}
