import { useState } from 'react'
import { App, Button, Form, Input, Modal, Popconfirm, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { MEMBERS, type Member } from './mock'

export default function MembersPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [members, setMembers] = useState<Member[]>(MEMBERS)
  const [addOpen, setAddOpen] = useState(false)
  const [form] = Form.useForm()
  const kind = Form.useWatch('kind', form)

  const onAdd = (values: { name: string; studentId: string; kind: Member['kind']; title?: string }) => {
    setMembers((ms) => [
      ...ms,
      { id: Math.max(0, ...ms.map((m) => m.id)) + 1, updatedAt: '—(未儲存)', ...values },
    ])
    setAddOpen(false)
    form.resetFields()
    message.success('已新增社員(名單更新影響評鑑行政分)')
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="成員列表"
        sub={
          <>
            {user?.club} · 共 <span className="num">{members.length}</span> 人
          </>
        }
        extra={
          <Button type="primary" style={{ height: 36 }} onClick={() => setAddOpen(true)}>
            + 新增社員
          </Button>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>姓名</th>
              <th>學號</th>
              <th>身分</th>
              <th>職稱</th>
              <th>更新時間</th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td className="num" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                <td>{m.kind}</td>
                <td>{m.title ?? '—'}</td>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>
                <td className="r">
                  <Popconfirm
                    title={`移除 ${m.name}?`}
                    okText="移除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))}
                  >
                    <button type="button" className="link-btn danger">移除</button>
                  </Popconfirm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        幹部需填職稱;名單定期更新採計「社員、幹部名單更新」行政分。
      </div>

      <Modal
        open={addOpen}
        title="新增社員"
        onCancel={() => {
          setAddOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="新增"
      >
        <Form form={form} layout="vertical" onFinish={onAdd} initialValues={{ kind: '社員' }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="studentId" label="學號" rules={[{ required: true, message: '請輸入學號' }]}>
            <Input className="num" />
          </Form.Item>
          <Form.Item name="kind" label="身分" rules={[{ required: true }]}>
            <Select options={[{ value: '社員' }, { value: '幹部' }]} />
          </Form.Item>
          {kind === '幹部' && (
            <Form.Item name="title" label="職稱" preserve={false} rules={[{ required: true, message: '幹部需填職稱' }]}>
              <Input placeholder="例:社長、總務" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
