import { App, Button, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'

export default function CertificatePage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <PageHeader title="幹部證明" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        社(會)長、副社(會)長服務證明;製作約 <span className="num">2</span> 個工作天,完成後至課外活動指導組領取。
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={() => {
            message.success('幹部證明申請已送出')
            form.resetFields(['term', 'position', 'name'])
          }}
          initialValues={{ club: user?.club }}
        >
          <div className="form-grid-2">
            <Form.Item
              name="term"
              label="擔任學年度或學期"
              rules={[{ required: true, message: '請輸入學年期' }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="例:114 學年度第 2 學期" />
            </Form.Item>
            <Form.Item name="club" label="社團名稱" style={{ marginBottom: 0 }}>
              <Input readOnly style={{ background: 'var(--paper)' }} />
            </Form.Item>
            <Form.Item name="position" label="擔任職位" rules={[{ required: true, message: '請選擇職位' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="請選擇"
                options={[{ value: '社長或會長' }, { value: '副社長或副會長' }]}
              />
            </Form.Item>
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]} style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">送出申請</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的申請</div>
        <table className="tb" style={{ minWidth: 520 }}>
          <tbody>
            <tr>
              <td className="num" style={{ color: 'var(--steel)', width: 140 }}>OFC-114-0021</td>
              <td style={{ fontWeight: 500 }}>顏志明(社長或會長)</td>
              <td style={{ color: 'var(--steel)', fontSize: 13 }}>114-2</td>
              <td className="num" style={{ fontSize: 13, width: 110 }}>2026/06/10</td>
              <td style={{ width: 100 }}><StatusPill status="pending" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
