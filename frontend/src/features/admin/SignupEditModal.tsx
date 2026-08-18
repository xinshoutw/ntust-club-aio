import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useSignupItemMutations, type AdminSignupItem } from '../../api/adminSignups'

const DATETIME_FMT = 'YYYY/MM/DD HH:mm'

interface EditValues {
  name: string
  place?: string
  description?: string
  eventAt: Dayjs
  signupEnd: Dayjs
  maxParticipants: number
  requiresConfirmation: boolean
  isOpen: boolean
}

// 建立後的修改(decisions.md D-09)。活動種類不在這裡:它同時決定行政分採計與是否場次制,
// 改掉會讓既有場次與簽到失去意義。表單欄位也不在這裡 —— 那是建立頁的職責,
// 且一有人報名就鎖住(後端 SIGNUP_FIELDS_LOCKED)。修改不發通知。
export default function SignupEditModal({
  item,
  open,
  onClose,
}: {
  item: AdminSignupItem
  open: boolean
  onClose: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<EditValues>()
  const { update } = useSignupItemMutations()

  return (
    <Modal
      open={open}
      title="編輯報名活動"
      okText="儲存"
      cancelText="取消"
      confirmLoading={update.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form<EditValues>
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{
          name: item.name,
          place: item.place,
          description: item.description,
          eventAt: item.eventAt ? dayjs(item.eventAt, DATETIME_FMT) : undefined,
          signupEnd: item.signupEnd ? dayjs(item.signupEnd, DATETIME_FMT) : undefined,
          maxParticipants: item.maxParticipants,
          requiresConfirmation: item.requiresConfirmation,
          isOpen: item.isOpen,
        }}
        onFinish={(v) => {
          update.mutate(
            {
              itemId: item.id,
              patch: {
                name: v.name.trim(),
                // 清空要送 null:undefined 會被 JSON.stringify 丟掉,後端就當作「沒帶」
                place: v.place?.trim() || null,
                description: v.description ?? '',
                eventAt: v.eventAt.format(DATETIME_FMT),
                signupEnd: v.signupEnd.format(DATETIME_FMT),
                maxParticipants: v.maxParticipants,
                requiresConfirmation: v.requiresConfirmation,
                isOpen: v.isOpen,
              },
            },
            {
              onSuccess: () => {
                message.success('已儲存')
                onClose()
              },
              onError: (e) => message.error(e.message),
            },
          )
        }}
      >
        <Form.Item name="name" label="活動名稱" rules={[{ required: true, message: '請輸入活動名稱' }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="place" label="地點">
          <Input maxLength={100} />
        </Form.Item>
        <div className="form-grid-2">
          <Form.Item name="eventAt" label="活動時間" rules={[{ required: true, message: '請選擇活動時間' }]}>
            <DatePicker showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="signupEnd"
            label="報名截止"
            // 往回改等於用系統時鐘偽造「當時就截止了」;要提前收攤請改用「開放報名」
            rules={[
              { required: true, message: '請選擇報名截止' },
              {
                validator: (_, v: Dayjs | null) =>
                  !v || !v.isBefore(dayjs())
                    ? Promise.resolve()
                    : Promise.reject(new Error('報名截止只能改到現在或未來')),
              },
            ]}
          >
            <DatePicker showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="maxParticipants" label="每社名額上限" rules={[{ required: true, message: '請輸入名額上限' }]}>
          <InputNumber min={1} max={500} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="活動描述">
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
        <div style={{ display: 'flex', gap: 20 }}>
          <Form.Item name="requiresConfirmation" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>審核制(報名後須確認)</Checkbox>
          </Form.Item>
          <Form.Item name="isOpen" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>開放報名</Checkbox>
          </Form.Item>
        </div>
      </Form>
      <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 14 }}>
        活動種類與表單欄位建立後不可修改;要提前收單請取消「開放報名」。修改不會通知已報名的社團。
      </div>
    </Modal>
  )
}
