import { useState } from 'react'
import { App, Button, Checkbox, DatePicker, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { CLUBS, VIOLATION_ITEMS } from './mock'

// 違規勸導填寫(工讀生端基礎原型):目前為 mock,送出僅 toast;
// 接後端時走 POST /violations(填寫人=登入工讀生)+ 佐證照片上傳管線
export default function PtViolationFormPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  return (
    <div>
      <PageHeader title="違規勸導填寫" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={() => {
            setSubmitting(true)
            // mock:接後端時改 mutation
            setTimeout(() => {
              setSubmitting(false)
              message.success('違規勸導已送出')
              form.resetFields()
            }, 300)
          }}
        >
          <Form.Item name="club" label="社團" rules={[{ required: true, message: '請選擇社團' }]}>
            <Select
              showSearch
              placeholder="選擇社團"
              options={CLUBS.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item name="date" label="發生日期" rules={[{ required: true, message: '請選擇日期' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
          </Form.Item>
          <Form.Item name="location" label="地點" rules={[{ required: true, message: '請填寫地點' }]}>
            <Input placeholder="如:學生活動中心 B1" maxLength={100} />
          </Form.Item>
          <Form.Item
            name="items"
            label="違規項目"
            rules={[{ required: true, message: '請至少勾選一項' }]}
          >
            <Checkbox.Group
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              options={VIOLATION_ITEMS.map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="other" label="其他說明">
            <Input.TextArea rows={3} maxLength={500} placeholder="選填" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit" loading={submitting}>
              送出勸導
            </Button>
          </div>
        </Form>
      </div>
    </div>
  )
}
