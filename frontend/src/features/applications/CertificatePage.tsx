import { App, Button, Form, Input, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { MEMBERS, type Member } from '../members/mock'

const TERMS = [
  { value: '114', label: '114學年度' },
  { value: '114-1', label: '114學年度第1學期' },
  { value: '114-2', label: '114學年度第2學期' },
]

const POSITION_KIND: Record<string, Member['kind']> = {
  社長或會長: '社長／會長',
  副社長或副會長: '副社長／副會長',
}

export default function CertificatePage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const term: string | undefined = Form.useWatch('term', form)
  const position: string | undefined = Form.useWatch('position', form)

  // 依學年期 + 職位自動帶出成員;0 或 >1 位皆不可送出
  const matches =
    term && position
      ? MEMBERS.filter(
          (m) => m.kind === POSITION_KIND[position] && (term === '114' ? m.semester.startsWith('114') : m.semester === term),
        )
      : []
  const uniqueNames = [...new Set(matches.map((m) => m.name))]
  const matchState: 'idle' | 'ok' | 'none' | 'many' =
    !term || !position ? 'idle' : uniqueNames.length === 1 ? 'ok' : uniqueNames.length === 0 ? 'none' : 'many'

  return (
    <div>
      <PageHeader title="幹部證明" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        社(會)長、副社(會)長服務證明,製作約 <span className="num">2</span> 個工作天。
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={() => {
            message.success(`幹部證明申請已送出(${uniqueNames[0]})`)
            form.resetFields(['term', 'position'])
          }}
          initialValues={{ club: user?.club }}
        >
          <div className="form-grid-2">
            <Form.Item name="term" label="擔任學年度或學期" rules={[{ required: true, message: '請選擇學年期' }]} style={{ marginBottom: 0 }}>
              <Select placeholder="請選擇" options={TERMS} />
            </Form.Item>
            <Form.Item name="club" label="社團名稱" style={{ marginBottom: 0 }}>
              <Input readOnly style={{ background: 'var(--paper)' }} />
            </Form.Item>
            <Form.Item name="position" label="擔任職位" rules={[{ required: true, message: '請選擇職位' }]} style={{ marginBottom: 0 }}>
              <Select placeholder="請選擇" options={Object.keys(POSITION_KIND).map((p) => ({ value: p, label: p }))} />
            </Form.Item>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>姓名(自動帶出)</div>
              <Input
                readOnly
                value={matchState === 'ok' ? uniqueNames[0] : ''}
                placeholder={matchState === 'idle' ? '選擇學年期與職位後帶出' : ''}
                style={{ background: 'var(--paper)' }}
              />
              {matchState === 'none' && (
                <div style={{ fontSize: 12, color: '#C13B34', marginTop: 4 }}>該學年期成員名單中找不到此職位,無法送出;請先至成員列表補登。</div>
              )}
              {matchState === 'many' && (
                <div style={{ fontSize: 12, color: '#C13B34', marginTop: 4 }}>找到多位符合成員,無法送出;請先修正成員名單。</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit" disabled={matchState !== 'ok'}>
              送出申請
            </Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>我的申請(近 5 筆)</div>
        <table className="tb" style={{ minWidth: 480 }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 500 }}>顏志明(社長或會長)</td>
              <td style={{ color: 'var(--steel)', fontSize: 13 }}>114學年度第2學期</td>
              <td className="num" style={{ fontSize: 13, width: 110 }}>2026/06/10</td>
              <td style={{ width: 100 }}><StatusPill status="pending" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
