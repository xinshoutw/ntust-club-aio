import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Select, TimePicker, Tooltip, Upload } from 'antd'
import type { UploadFile } from 'antd'
import { FileTextOutlined, InboxOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { blurLeavesRow } from '../../lib/form'
import { addDraft, nextActivityId } from './mock'
import { BUDGET_CATEGORIES, BUDGET_HINTS, fmtMoney, type Activity } from './types'
import './actform.css'

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

export default function ActivityFormPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const activityType = Form.useWatch('type', form)
  const [files, setFiles] = useState<UploadFile[]>([])

  // 自動增列:保證尾端永遠有一列空白;清空的列自動移除
  const workKeyRef = useRef(2)
  const [works, setWorks] = useState<WorkRow[]>([{ key: 1, task: '', owner: '' }])
  const budgetKeyRef = useRef(2)
  const [budget, setBudget] = useState<BudgetRow[]>([emptyBudget(1)])

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
      id: nextActivityId(),
      name: (v.name as string)?.trim() || '(未命名活動)',
      club: user?.club ?? '',
      type: (v.type as Activity['type']) ?? '社課',
      date: v.date ? v.date.format('YYYY/MM/DD') : '—',
      timeRange: v.timeRange ? `${v.timeRange[0].format('HH:mm')}–${v.timeRange[1].format('HH:mm')}` : undefined,
      location: v.location,
      participantsIn: v.participantsIn ?? undefined,
      participantsOut: v.participantsOut ?? undefined,
      content: (v.content as string)?.trim() || undefined,
      works: filledWorks.length ? filledWorks.map((w) => ({ task: w.task.trim(), owner: w.owner.trim() })) : undefined,
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

  const saveDraft = () => {
    const doSave = () => {
      addDraft(buildDraft('draft'))
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
    if (!works.some((w) => w.task.trim() !== '' && w.owner.trim() !== '')) {
      message.error('請填寫至少一筆工作分配。')
      return
    }
    addDraft(buildDraft('pending_advisor'))
    message.success('已送出申請')
    navigate('/activities')
  }

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto' }}>
      <PageHeader title="活動申請" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        申請活動或社課,核准後辦理;辦理後 <span className="num">1</span> 個月內須完成結案。
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark initialValues={{ type: '社課' }}>
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
                <Input placeholder="活動名稱" />
              </Form.Item>
              <div className="form-grid-2">
                <Form.Item label="活動類型" required style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Form.Item name="type" noStyle rules={[{ required: true }]}>
                      <Select style={{ flex: 1 }} options={['社課', '活動', '會議'].map((v) => ({ value: v, label: v }))} />
                    </Form.Item>
                    {activityType === '活動' && (
                      <Tooltip title="大型活動在行政資料能夠獲得較高的評分">
                        <Form.Item name="isLarge" valuePropName="checked" noStyle>
                          <Checkbox style={{ whiteSpace: 'nowrap' }}>大型活動申請</Checkbox>
                        </Form.Item>
                      </Tooltip>
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
                  label="活動日期"
                  rules={[{ required: true, message: '請選擇活動日期' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
                </Form.Item>
                <Form.Item
                  name="timeRange"
                  label="活動時間"
                  rules={[{ required: true, message: '請選擇活動時間' }]}
                  style={{ marginBottom: 0 }}
                >
                  <TimePicker.RangePicker
                    style={{ width: '100%' }}
                    format={{ format: 'HH:mm', type: 'mask' }}
                    needConfirm={false}
                  />
                </Form.Item>
              </div>
              <div className="form-grid-2">
                <Form.Item
                  name="participantsIn"
                  label="參加人數(校內)"
                  rules={[{ required: true, message: '請輸入校內人數' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
                <Form.Item
                  name="participantsOut"
                  label="參加人數(校外)"
                  rules={[{ required: true, message: '請輸入校外人數' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
              </div>
              <Form.Item name="content" label="活動內容(至多 150 字)" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={6} maxLength={150} showCount placeholder="活動目的、內容、預期效益" />
              </Form.Item>

              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  工作分配 <span style={{ color: '#C13B34' }}>*</span>
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--steel)', marginLeft: 8 }}>
                    填寫後自動增列,清空即移除
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {works.map((w) => (
                    <div key={w.key} onBlur={(e) => blurLeavesRow(e) && compactWorks()} style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={w.task}
                        onChange={(e) => setWork(w.key, { task: e.target.value })}
                        placeholder="工作項目"
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
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>逐項編列;填寫後自動增列,清空即移除</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {budget.map((r) => {
                  const hint = BUDGET_HINTS[r.category]
                  return (
                    <div key={r.key} onBlur={(e) => blurLeavesRow(e) && compactBudget()} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
                      <div className="budget-row">
                        <Select
                          aria-label="經費科目"
                          value={r.category}
                          onChange={(v) => updateBudget(r.key, { category: v })}
                          options={BUDGET_CATEGORIES.map((c) => ({ value: c, label: c }))}
                          style={{ width: 150 }}
                        />
                        <Input
                          aria-label="經費說明"
                          value={r.description}
                          onChange={(e) => updateBudget(r.key, { description: e.target.value })}
                          placeholder="經費說明"
                          style={{ flex: 1, minWidth: 180 }}
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
                          style={{ width: 96 }}
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
                          style={{ width: 96 }}
                        />
                      </div>
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
                onChange={({ fileList }) => setFiles(fileList)}
                showUploadList={false}
                style={{ background: 'transparent' }}
              >
                <p style={{ margin: '4px 0 8px' }}>
                  <InboxOutlined style={{ fontSize: 28, color: 'var(--steel)' }} />
                </p>
                <p style={{ fontSize: 13, color: 'var(--steel)', margin: 0 }}>
                  拖放檔案至此,或點擊選擇(企劃書、估價單;PDF)
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
