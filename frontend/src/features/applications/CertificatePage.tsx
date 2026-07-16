import { App, Button, Form, Input, Select, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { kindLabel, type MemberKind } from '../../lib/roles'
import {
  termLabel,
  useCertificateMutations,
  useCertificates,
  useOfficerNames,
} from '../../api/applications'

const TERMS = ['114', '114-1', '114-2'].map((value) => ({ value, label: termLabel(value) }))

// 可申請證明的職位:標準身份值,顯示依社團名稱推導(社長/會長)
const POSITIONS: MemberKind[] = ['負責人', '副負責人']

export default function CertificatePage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const term: string | undefined = Form.useWatch('term', form)
  const position: MemberKind | undefined = Form.useWatch('position', form)

  // 依學年期 + 職位自動帶出成員(名單預覽);0 或 >1 位皆不可送出,送出時後端再驗證
  const namesQuery = useOfficerNames(term, position)
  const uniqueNames = namesQuery.data ?? []
  const matchState: 'idle' | 'loading' | 'ok' | 'none' | 'many' =
    !term || !position
      ? 'idle'
      : namesQuery.isPending
        ? 'loading'
        : uniqueNames.length === 1
          ? 'ok'
          : uniqueNames.length === 0
            ? 'none'
            : 'many'

  const listQuery = useCertificates()
  const records = listQuery.data?.records ?? []
  const { create } = useCertificateMutations()

  return (
    <div>
      <PageHeader title="幹部證明" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        製作需 <span className="num">2</span> 個工作天
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={(values: { term: string; position: MemberKind }) => {
            create.mutate(
              { term: values.term, position: values.position },
              {
                onSuccess: (r) => {
                  message.success(`幹部證明申請已送出(${r.applicantName})`)
                  form.resetFields(['term', 'position'])
                },
                onError: (e) => message.error(e.message),
              },
            )
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
              <Select placeholder="請選擇" options={POSITIONS.map((p) => ({ value: p, label: kindLabel(p, user?.club) }))} />
            </Form.Item>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>姓名</div>
              <Input
                readOnly
                value={matchState === 'ok' ? uniqueNames[0] : ''}
                placeholder={matchState === 'idle' ? '請選擇學年期與職位' : matchState === 'loading' ? '查詢名單中…' : ''}
                style={{ background: 'var(--paper)' }}
              />
              {matchState === 'none' && (
                <div style={{ fontSize: 12, color: '#C13B34', marginTop: 4 }}>該學年期「成員名單」中找不到此職位，無法送出。請先至成員列表補上</div>
              )}
              {matchState === 'many' && (
                <div style={{ fontSize: 12, color: '#C13B34', marginTop: 4 }}>找到多位符合成員，無法送出。請先修正成員名單</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit" disabled={matchState !== 'ok'} loading={create.isPending}>
              送出申請
            </Button>
          </div>
        </Form>
      </div>

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
          <table className="tb" style={{ minWidth: 480 }}>
            <tbody>
              {records.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{`${c.applicantName} (${kindLabel(c.position, user?.club)})`}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{termLabel(c.term)}</td>
                  <td className="num" style={{ fontSize: 13, width: 110 }}>{c.date}</td>
                  <td style={{ width: 100 }}><StatusPill status={c.status} /></td>
                </tr>
              ))}
              {!listQuery.isPending && records.length === 0 && (
                <tr className="no-hover">
                  <td style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}
