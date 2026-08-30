import { useRef } from 'react'
import { App, Button, DatePicker, Form, Input, InputNumber, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import dayjs, { type Dayjs } from 'dayjs'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import TagListInput from '../../components/ui/TagListInput'
import AdminEquipmentCard from './AdminEquipmentCard'
import AdminVenueCard from './AdminVenueCard'
import type { BudgetCategory } from '../../api/clubConfig'
import {
  evalYearLabel,
  useSystemSettings,
  useUpdateSettings,
  type SystemSettings,
} from '../../api/adminSettings'

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }
const DATE_FMT = 'YYYY/MM/DD'

// 經費科目編輯:每列名稱 + 提示(選填);末端「新增科目」補一列。受控元件。
let budgetRowSeq = 0

function BudgetCategoriesInput({
  value = [],
  onChange,
}: {
  value?: BudgetCategory[]
  onChange?: (next: BudgetCategory[]) => void
}) {
  // 列身分 key 與 value 平行維護:index key 在刪中間列時會讓後列 DOM 被復用、
  // 焦點與輸入法組字錯位;value 為 Form 注入的資料形狀,不能塞 key 欄位
  const rowKeys = useRef<number[]>([])
  while (rowKeys.current.length < value.length) rowKeys.current.push(++budgetRowSeq)
  if (rowKeys.current.length > value.length) rowKeys.current.length = value.length

  const update = (i: number, patch: Partial<BudgetCategory>) =>
    onChange?.(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => {
    rowKeys.current = rowKeys.current.filter((_: number, idx: number) => idx !== i)
    onChange?.(value.filter((_, idx) => idx !== i))
  }
  const add = () => onChange?.([...value, { name: '', hint: '' }])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.map((c, i) => (
        <div key={rowKeys.current[i]} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            value={c.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="項目名稱"
            style={{ width: 160, flexShrink: 0 }}
          />
          <Input
            value={c.hint}
            onChange={(e) => update(i, { hint: e.target.value })}
            placeholder="選填"
            style={{ flex: 1 }}
          />
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            aria-label={`移除 ${c.name || '項目'}`}
            onClick={() => remove(i)}
          />
        </div>
      ))}
      <div>
        <Button size="small" icon={<PlusOutlined />} onClick={add}>
          新增項目
        </Button>
      </div>
    </div>
  )
}

interface FormValues {
  fixedWindow?: [Dayjs, Dayjs] | null
  closeLockDays: number
  docMb: number
  imgMb: number
  zipMb: number
  videoMb: number
  attachmentTotalMb: number
  maintenanceTotalMb: number
  closePhotoTotalMb: number
  perClubGib: number
  evalYear: number
  violItems: string[]
  budgetCats: BudgetCategory[]
}

const nonEmptyList = {
  validator: (_: unknown, v?: string[]) =>
    v?.length ? Promise.resolve() : Promise.reject(new Error('至少需保留一項')),
}

// 經費科目:至少一項且每項名稱非空(名稱空的列送出前需補齊)
const nonEmptyBudget = {
  validator: (_: unknown, v?: BudgetCategory[]) => {
    if (!v?.length) return Promise.reject(new Error('至少需保留一項'))
    if (v.some((c) => !c.name.trim())) return Promise.reject(new Error('項目名稱不得為空'))
    return Promise.resolve()
  },
}

function SettingsForm({ initial }: { initial: SystemSettings }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const update = useUpdateSettings()

  const onFinish = (v: FormValues) => {
    update.mutate(
      {
        fixedFrom: v.fixedWindow?.[0] ? v.fixedWindow[0].format(DATE_FMT) : undefined,
        fixedUntil: v.fixedWindow?.[1] ? v.fixedWindow[1].format(DATE_FMT) : undefined,
        closeLockDays: v.closeLockDays,
        docMb: v.docMb,
        imgMb: v.imgMb,
        zipMb: v.zipMb,
        videoMb: v.videoMb,
        attachmentTotalMb: v.attachmentTotalMb,
        maintenanceTotalMb: v.maintenanceTotalMb,
        closePhotoTotalMb: v.closePhotoTotalMb,
        perClubGib: v.perClubGib,
        evalYear: v.evalYear,
        violItems: v.violItems,
        budgetCats: v.budgetCats,
      },
      {
        onSuccess: () => message.success('系統設定已儲存'),
        onError: (e) => message.error(e.message),
      },
    )
  }

  // 評鑑年度選項:固定提供近兩屆,並保底包含現值
  const evalYears = [...new Set([initial.evalYear, 116, 117])].sort()

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{
        fixedWindow:
          initial.fixedFrom && initial.fixedUntil
            ? [dayjs(initial.fixedFrom, DATE_FMT), dayjs(initial.fixedUntil, DATE_FMT)]
            : undefined,
        closeLockDays: initial.closeLockDays,
        docMb: initial.docMb,
        imgMb: initial.imgMb,
        zipMb: initial.zipMb,
        videoMb: initial.videoMb,
        attachmentTotalMb: initial.attachmentTotalMb,
        maintenanceTotalMb: initial.maintenanceTotalMb,
        closePhotoTotalMb: initial.closePhotoTotalMb,
        perClubGib: initial.perClubGib,
        evalYear: initial.evalYear,
        violItems: initial.violItems,
        budgetCats: initial.budgetCats,
      }}
    >
      <div className="form-grid-2" style={{ marginTop: 20, alignItems: 'stretch' }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={sectionTitle}>借用</div>
          <Form.Item name="fixedWindow" label="固定場地借用受理期間" style={{ marginBottom: 0 }}>
            <DatePicker.RangePicker style={{ width: '100%' }} format={DATE_FMT} allowClear />
          </Form.Item>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={sectionTitle}>活動與評鑑</div>
          <div className="form-grid-2">
            <Form.Item name="closeLockDays" label="活動結案期限（天）">
              <InputNumber min={1} max={366} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="evalYear" label="評鑑年度" style={{ marginBottom: 0 }}>
              <Select options={evalYears.map((y) => ({ value: y, label: evalYearLabel(y) }))} />
            </Form.Item>
          </div>
          <div style={{ ...sectionTitle, marginTop: 20 }}>申請附件總上限（MB）</div>
          <div className="form-grid-2">
            <Form.Item name="attachmentTotalMb" label="活動申請附件" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maintenanceTotalMb" label="空間報修佐證（含影片）" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="closePhotoTotalMb" label="活動結案照片與附件" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ ...sectionTitle, marginTop: 20 }}>單檔上限（MB）</div>
          <div className="form-grid-2">
            <Form.Item name="docMb" label="文件" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="imgMb" label="圖片" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="zipMb" label="壓縮檔" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="videoMb" label="影片" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={sectionTitle}>儲存空間</div>
        <Form.Item name="perClubGib" label="單一社團限制 (GiB)" style={{ marginBottom: 0, maxWidth: 280 }}>
          <InputNumber min={1} max={1024} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={sectionTitle}>違規項目目錄</div>
        <Form.Item name="violItems" rules={[nonEmptyList]} style={{ marginBottom: 0 }}>
          <TagListInput />
        </Form.Item>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={sectionTitle}>經費項目</div>
        <Form.Item name="budgetCats" rules={[nonEmptyBudget]} style={{ marginBottom: 0 }}>
          <BudgetCategoriesInput />
        </Form.Item>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button type="primary" htmlType="submit" loading={update.isPending} disabled={update.isPending}>儲存</Button>
      </div>
    </Form>
  )
}

// 系統設定(system_settings):散落各流程的可調參數集中於此;權限鍵 asetting
export default function AdminSettingsPage() {
  const settingsQuery = useSystemSettings()

  return (
    <div>
      <PageHeader title="系統設定" />
      {/* 器材主檔各列即時 PATCH(獨立於 system_settings);置於設定表單前,
          讓表單的「儲存」按鈕留在整頁最底,不被下方卡片夾在中間 */}
      <AdminVenueCard />
      <AdminEquipmentCard />
      {settingsQuery.isPending ? (
        <LoadingBlock pending rows={6} />
      ) : settingsQuery.data ? (
        <SettingsForm initial={settingsQuery.data} />
      ) : (
        <div style={{ marginTop: 20 }}>
          <QueryError
            title="系統設定載入失敗"
            error={settingsQuery.error}
            onRetry={() => void settingsQuery.refetch()}
          />
        </div>
      )}
    </div>
  )
}
