import { App, Button, Checkbox, DatePicker, Form, Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { useStaffClubs, useStaffMutations, useViolationItems } from '../../api/staff'

interface FormValues {
  club: number
  date: Dayjs
  location: string
  items: string[]
  other?: string
}

// 違規勸導填寫:社團與違規項目目錄來自後端(只列啟用中社團,與行政端選擇器同一條規則);
// 填寫人=登入工讀生(後端取 session),發生日不可未來
export default function PtViolationFormPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const clubsQuery = useStaffClubs()
  const itemsQuery = useViolationItems()
  const { fileViolation } = useStaffMutations()

  const onFinish = (v: FormValues) => {
    fileViolation.mutate(
      {
        clubId: v.club,
        occurredOn: v.date,
        location: v.location.trim(),
        items: v.items,
        other: v.other?.trim() || undefined,
      },
      {
        onSuccess: () => {
          message.success('違規勸導已送出')
          form.resetFields()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  if (clubsQuery.isError || itemsQuery.isError) {
    return (
      <div>
        <PageHeader title="違規勸導填寫" />
        <div style={{ marginTop: 20 }}>
          <QueryError
            title="基礎資料載入失敗"
            error={clubsQuery.error ?? itemsQuery.error}
            onRetry={() => {
              void clubsQuery.refetch()
              void itemsQuery.refetch()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="違規勸導填寫" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <LoadingBlock pending={clubsQuery.isPending || itemsQuery.isPending}>
          <Form form={form} layout="vertical" requiredMark onFinish={onFinish}>
            <Form.Item name="club" label="社團" rules={[{ required: true, message: '請選擇社團' }]}>
              <Select
                showSearch
                placeholder="選擇社團"
                optionFilterProp="label"
                options={(clubsQuery.data ?? [])
                  .filter((c) => c.isActive)
                  .map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
            <Form.Item name="date" label="發生日期" rules={[{ required: true, message: '請選擇日期' }]}>
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY/MM/DD"
                disabledDate={(d) => d.isAfter(dayjs(), 'day')}
              />
            </Form.Item>
            <Form.Item
              name="location"
              label="地點"
              rules={[{ required: true, whitespace: true, message: '請填寫地點' }]}
            >
              <Input placeholder="如:學生活動中心 B1" maxLength={100} />
            </Form.Item>
            <Form.Item
              name="items"
              label="違規項目"
              rules={[{ required: true, message: '請至少勾選一項' }]}
            >
              <Checkbox.Group
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                options={(itemsQuery.data ?? []).map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
            <Form.Item name="other" label="其他說明">
              <Input.TextArea rows={3} maxLength={500} placeholder="選填" />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="primary" htmlType="submit" loading={fileViolation.isPending} disabled={fileViolation.isPending}>
                送出勸導
              </Button>
            </div>
          </Form>
        </LoadingBlock>
      </div>
    </div>
  )
}
