import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Popconfirm, Popover, Select, Spin, TimePicker } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import dayjs from 'dayjs'
import { FileTextOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'
import { fmtMB, isPdfFile } from '../../lib/uploads'
import { blurLeavesRow } from '../../lib/form'
import type { EvalFile } from '../eval/types'
import {
  createActivity,
  deleteActivityAttachment,
  submitActivity,
  updateActivity,
  uploadActivityAttachment,
  useActivityDetail,
  useInvalidateActivities,
  type ActivityInput,
  type ClubActivityDetail,
} from '../../api/activities'
import { useClubConfig, type BudgetCategory } from '../../api/clubConfig'
import { TIME_RANGE_SEP } from './utils'
import { fmtMoney } from './types'
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

const emptyBudget = (key: number, defaultCat: string): BudgetRow => ({
  key,
  category: defaultCat,
  description: '',
  selfFund: null,
  requestedSubsidy: null,
})

// 科目仍為預設值且其餘皆空才視為空列,避免剛選好的科目被 blur 整理吃掉
const isBudgetEmpty = (r: BudgetRow, defaultCat: string) =>
  r.category === defaultCat && !r.description.trim() && r.selfFund == null && r.requestedSubsidy == null

interface WorkRow {
  key: number
  task: string
  owner: string
}

const isWorkEmpty = (w: WorkRow) => w.task.trim() === '' && w.owner.trim() === ''

interface FormValues {
  name: string
  type: ActivityInput['type']
  isLarge?: boolean
  location: string
  date: dayjs.Dayjs
  endDate: dayjs.Dayjs
  startTime: dayjs.Dayjs
  endTime: dayjs.Dayjs
  participantsIn: number
  participantsOut: number
  content?: string
}


const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// 編輯模式由外層取得詳情並確認狀態(僅草稿與被退回件可編輯),表單一律以完整資料掛載
export default function ActivityFormPage() {
  const { id } = useParams()
  const idNum = id != null ? Number(id) : undefined
  const isValidId = idNum == null || Number.isInteger(idNum)
  const detailQuery = useActivityDetail(isValidId ? idNum : undefined)
  // 經費科目/附件上限來自後端組態;表單初始化(預設科目)前必須先載入
  const configQuery = useClubConfig()

  const spin = (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <Spin />
    </div>
  )
  const errorBox = (title: string, error: unknown, retry: () => void) => (
    <div>
      <PageHeader title="活動申請" />
      <div style={{ marginTop: 20 }}>
        <QueryError title={title} error={error} onRetry={retry} />
      </div>
    </div>
  )

  if (configQuery.isPending) return spin
  if (configQuery.isError) return errorBox('系統組態載入失敗', configQuery.error, () => void configQuery.refetch())
  const config = configQuery.data

  if (idNum != null) {
    if (!isValidId) return <Navigate to="/activities" replace />
    if (detailQuery.isPending) return spin
    // 載入失敗留在原頁顯示錯誤與重試,不導回列表(導走會被誤認為活動不存在)
    if (detailQuery.isError) return errorBox('活動資料載入失敗', detailQuery.error, () => void detailQuery.refetch())
    const detail = detailQuery.data
    if (!detail || (detail.status !== 'draft' && detail.status !== 'rejected')) {
      return <Navigate to="/activities" replace />
    }
    return <ActivityForm key={detail.id} editing={detail} categories={config.budgetCategories} attachmentTotalBytes={config.uploadLimits.activityAttachmentBytes} />
  }
  return <ActivityForm categories={config.budgetCategories} attachmentTotalBytes={config.uploadLimits.activityAttachmentBytes} />
}

function ActivityForm({
  editing,
  categories,
  attachmentTotalBytes,
}: {
  editing?: ClubActivityDetail
  categories: BudgetCategory[]
  attachmentTotalBytes: number
}) {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const invalidate = useInvalidateActivities()
  // 經費科目預設值與提示查詢(後端供給;至少一項由後端保證)
  const defaultCat = categories[0]?.name ?? ''
  const hintOf = (name: string) => categories.find((c) => c.name === name)?.hint
  const [form] = Form.useForm<FormValues>()
  const activityType = Form.useWatch('type', form)
  const [files, setFiles] = useState<BagFile[]>([])
  // 既有附件(編輯重送保留,可逐一移除;新選檔於送出時上傳)
  const [existing, setExisting] = useState<EvalFile[]>(editing?.attachments ?? [])
  const [worksError, setWorksError] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)

  // 自動增列:保證尾端永遠有一列空白;清空的列自動移除
  const workKeyRef = useRef((editing?.works.length ?? 0) + 2)
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
    return [...base, emptyBudget(base.length + 1, defaultCat)]
  })

  // 工作分配、經費編列與附件都在 Form 之外,onValuesChange 看不到 —— 只改這幾塊
  // 就離開,正是未存檔守衛要擋的情境。與載入時的快照比對
  const localSnapshot = JSON.stringify([works, budget, files.length, existing.map((f) => f.id)])
  const loadedRef = useRef(localSnapshot)
  const guard = useFormUnsavedGuard(localSnapshot !== loadedRef.current)

  // 輸入時只增列;空列的移除延後到 blur(避免打字中列被吃掉)
  const setWork = (key: number, patch: Partial<Omit<WorkRow, 'key'>>) => {
    setWorksError(false)
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
      if (!isBudgetEmpty(next[next.length - 1], defaultCat)) {
        budgetKeyRef.current += 1
        next.push(emptyBudget(budgetKeyRef.current, defaultCat))
      }
      return next
    })
  }
  const compactBudget = () =>
    setBudget((rows) => {
      const filled = rows.filter((r) => !isBudgetEmpty(r, defaultCat))
      budgetKeyRef.current += 1
      return [...filled, emptyBudget(budgetKeyRef.current, defaultCat)]
    })

  const filledBudget = budget.filter((r) => !isBudgetEmpty(r, defaultCat))
  const totals = filledBudget.reduce(
    (acc, r) => ({ self: acc.self + (r.selfFund ?? 0), requested: acc.requested + (r.requestedSubsidy ?? 0) }),
    { self: 0, requested: 0 },
  )

  // 草稿允許部分填寫:未填欄位以 undefined 傳遞(送審路徑經完整驗證,欄位必然齊全)
  const buildInput = (v: Partial<FormValues>): ActivityInput => ({
    name: (v.name ?? '').trim(),
    type: v.type ?? '社課或會議',
    isLarge: v.type === '活動' ? !!v.isLarge : false,
    date: v.date?.format('YYYY/MM/DD'),
    endDate: v.endDate?.format('YYYY/MM/DD'),
    startTime: v.startTime?.format('HH:mm'),
    endTime: v.endTime?.format('HH:mm'),
    location: (v.location ?? '').trim(),
    content: (v.content ?? '').trim(),
    participantsIn: v.participantsIn ?? undefined,
    participantsOut: v.participantsOut ?? undefined,
    works: works.filter((w) => !isWorkEmpty(w)).map((w) => ({ task: w.task.trim(), owner: w.owner.trim() })),
    budget: filledBudget.map((r) => ({
      category: r.category,
      description: r.description.trim(),
      selfFund: r.selfFund ?? 0,
      requestedSubsidy: r.requestedSubsidy ?? 0,
    })),
  })

  const checkTimes = (v: FormValues): boolean => {
    const start = dayjs(`${v.date.format('YYYY/MM/DD')} ${v.startTime.format('HH:mm')}`, 'YYYY/MM/DD HH:mm')
    const end = dayjs(`${v.endDate.format('YYYY/MM/DD')} ${v.endTime.format('HH:mm')}`, 'YYYY/MM/DD HH:mm')
    if (!end.isAfter(start)) {
      message.error('活動結束時間須晚於開始時間')
      return false
    }
    // 過去時間全面禁止:送出/重送擋過去開始時刻(草稿不走此檢核;後端亦擋)
    if (start.isBefore(dayjs())) {
      message.error('活動開始時間早於現在，請調整活動日期與時間')
      return false
    }
    return true
  }

  const saveDraft = async () => {
    // 退回件的「儲存修改」仍須完整(非草稿列的完整性由 DB CHECK 收口);草稿只要有填任何一欄即可
    let v: Partial<FormValues>
    if (editing?.status === 'rejected') {
      try {
        v = await form.validateFields()
      } catch {
        message.error('請先完成必填欄位')
        return
      }
      if (!checkTimes(v as FormValues)) return
    } else {
      v = form.getFieldsValue()
      // 填了的起訖須自洽;其餘留待送出時檢核
      if (v.date && v.endDate && v.endDate.isBefore(v.date, 'day')) {
        message.error('結束日期不得早於開始日期')
        return
      }
      if (
        v.date &&
        v.endDate &&
        v.endDate.isSame(v.date, 'day') &&
        v.startTime &&
        v.endTime &&
        !v.endTime.isAfter(v.startTime)
      ) {
        message.error('活動結束時間須晚於開始時間')
        return
      }
    }
    const input = buildInput(v)
    const hasAny =
      !!(input.name || input.location || input.content || input.date || input.startTime || input.endTime) ||
      input.participantsIn != null ||
      input.participantsOut != null ||
      input.works.length > 0 ||
      input.budget.length > 0
    if (!hasAny) {
      message.error('請至少填寫一個欄位再暫存')
      return
    }
    const doSave = async () => {
      setBusy('draft')
      try {
        if (editing) await updateActivity(editing.id, input)
        else await createActivity(input)
        invalidate()
        message.success(editing?.status === 'rejected' ? '已儲存修改' : '已暫存草稿')
        navigate('/activities')
      } catch (e) {
        message.error(errMsg(e))
      } finally {
        setBusy(null)
      }
    }
    if (files.length > 0) {
      // 草稿不保存新選附件:避免未送出檔案殘留伺服器(孤兒檔案/個資殘留)
      confirmDialog(modal, {
        title: '附件不會隨草稿保存',
        content: `已選擇的 ${files.length} 個附件將被捨棄，確定要暫存草稿？`,
        okText: '捨棄並暫存',
        cancelText: '取消',
        onOk: () => {
          void doSave()
        },
      })
      return
    }
    void doSave()
  }

  const onFinish = async (v: FormValues) => {
    if (!checkTimes(v)) return
    if (!works.some((w) => w.task.trim() !== '' && w.owner.trim() !== '')) {
      setWorksError(true)
      message.error('請填寫至少一筆工作分配')
      return
    }
    const input = buildInput(v)
    setBusy('submit')
    try {
      // 後端介面:先存草稿(POST/PUT)→ 逐檔上傳附件 → POST submit 送審
      const saved = editing ? await updateActivity(editing.id, input) : await createActivity(input)
      for (const b of [...files]) {
        try {
          await uploadActivityAttachment(saved.id, b.file)
          setFiles((prev) => prev.filter((x) => x.key !== b.key))
        } catch (e) {
          invalidate()
          message.error(`附件「${b.file.name}」上傳失敗:${errMsg(e)};申請已存為草稿,請補齊附件後再送出`)
          navigate(`/activities/${saved.id}/edit`)
          return
        }
      }
      try {
        await submitActivity(saved.id)
      } catch (e) {
        invalidate()
        message.error(`送出申請失敗:${errMsg(e)};申請已存為草稿`)
        // 新建流程轉入編輯路由:再按送出走更新,不會重複建立草稿
        if (!editing) navigate(`/activities/${saved.id}/edit`)
        return
      }
      invalidate()
      message.success('已送出申請')
      navigate('/activities')
    } catch (e) {
      invalidate() // 建立/更新可能已成功(如逾時),讓列表刷新
      message.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const removeExisting = async (f: EvalFile) => {
    if (!editing) return
    try {
      await deleteActivityAttachment(editing.id, f.id)
      setExisting((xs) => xs.filter((x) => x.id !== f.id))
      invalidate()
      message.success('已移除附件')
    } catch (e) {
      message.error(errMsg(e))
    }
  }

  const existingBytes = existing.reduce((s, f) => s + f.size, 0)

  return (
    <div>
      <PageHeader title="活動申請" />

      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => void onFinish(v)}
        requiredMark
        scrollToFirstError
        onValuesChange={(changed) => {
          guard.onValuesChange()
          // 單日活動居多:選開始日期時,結束日期未填就自動帶同一天
          if ('date' in changed && changed.date && !form.getFieldValue('endDate')) {
            form.setFieldValue('endDate', changed.date)
          }
        }}
        initialValues={
          editing
            ? {
                name: editing.name,
                type: editing.type,
                isLarge: editing.isLarge,
                location: editing.location,
                // 部分填寫的草稿可能缺日期(dayjs(undefined) 會變成今天,必須先判空)
                date: editing.date ? dayjs(editing.date, 'YYYY/MM/DD') : undefined,
                endDate: editing.endDate ? dayjs(editing.endDate, 'YYYY/MM/DD') : undefined,
                startTime: parseTimeRange(editing.timeRange)[0],
                endTime: parseTimeRange(editing.timeRange)[1],
                participantsIn: editing.participantsIn,
                participantsOut: editing.participantsOut,
                content: editing.content || undefined,
              }
            : { type: '社課或會議' }
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
                      <Select style={{ flex: 1 }} options={['社課或會議', '活動'].map((v) => ({ value: v, label: v }))} />
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
                              工作人員或服務對象達 <span className="num">50</span> 人以上、活動連續辦理 <span className="num">2-3</span> 天以上、總時數超過 <span className="num">20</span> 小時、活動經費達 <span className="num">10</span> 萬元以上、需 <span className="num">3</span> 個月以上籌備時間且召開 <span className="num">5</span> 次以上籌備會議
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
                  <DatePicker
                    style={{ width: '100%' }}
                    format="YYYY/MM/DD"
                    disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                  />
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
                      if (d.isBefore(dayjs().startOf('day'))) return true // 過去日期不可選
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
                  label="社員參加人數"
                  rules={[{ required: true, message: '請輸入社員人數' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
                <Form.Item
                  name="participantsOut"
                  label="非社員參加人數"
                  dependencies={['participantsIn']}
                  rules={[
                    { required: true, message: '請輸入非社員人數' },
                    // 兩欄各自可為 0(只有社員或只有校外人士),合計 0 等於沒填 —— 與後端同一條
                    ({ getFieldValue }) => ({
                      validator: (_, value) =>
                        (getFieldValue('participantsIn') ?? 0) + (value ?? 0) > 0
                          ? Promise.resolve()
                          : Promise.reject(new Error('參加人數合計不得為 0')),
                    }),
                  ]}
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
                        status={worksError ? 'error' : undefined}
                        onChange={(e) => setWork(w.key, { task: e.target.value })}
                        placeholder="項目"
                      />
                      <Input
                        value={w.owner}
                        status={worksError ? 'error' : undefined}
                        onChange={(e) => setWork(w.key, { owner: e.target.value })}
                        placeholder="負責人"
                      />
                    </div>
                  ))}
                </div>
                {worksError && (
                  <div style={{ fontSize: 12, color: '#C13B34', marginTop: 4 }}>請填寫至少一筆工作分配</div>
                )}
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
                  const hint = hintOf(r.category)
                  return (
                    <div key={r.key} onBlur={(e) => blurLeavesRow(e) && compactBudget()} style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px' }}>
                      {/* 第一列:類別/自籌/擬請;第二列:經費說明整行(避免窄欄換行截斷) */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Select
                          aria-label="經費科目"
                          value={r.category}
                          onChange={(v) => updateBudget(r.key, { category: v })}
                          options={categories.map((c) => ({ value: c.name, label: c.name }))}
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
              {existing.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
                  {existing.map((f) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px', fontSize: 13 }}>
                      <FileTextOutlined style={{ color: 'var(--steel)' }} />
                      <span style={{ fontWeight: 500 }}>{f.name}</span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{fmtMB(f.size)} MB</span>
                      <div style={{ flex: 1 }} />
                      <Popconfirm
                        title={`移除附件「${f.name}」?`}
                        okText="移除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() => void removeExisting(f)}
                      >
                        <button type="button" className="link-btn danger">移除</button>
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              )}
              <AttachmentArea
                value={files}
                onChange={setFiles}
                accept=".pdf"
                hint="拖放 PDF 檔案"
                validate={async (f) => ((await isPdfFile(f)) ? null : '不是有效的 PDF 檔')}
                maxTotalBytes={attachmentTotalBytes}
                usedBytes={existingBytes}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button loading={busy === 'draft'} disabled={busy === 'submit'} onClick={() => void saveDraft()}>
                暫存草稿
              </Button>
              <Button type="primary" htmlType="submit" loading={busy === 'submit'} disabled={busy !== null}>
                送出申請
              </Button>
            </div>
          </div>
        </div>
      </Form>
    </div>
  )
}
