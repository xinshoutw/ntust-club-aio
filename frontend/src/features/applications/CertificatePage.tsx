import { App, Button, Form, Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols } from '../../components/ui/tableControls'
import { useAuth } from '../../app/auth'
import { kindLabel, type MemberKind } from '../../lib/roles'
import { useMemberSemesters } from '../../api/members'
import {
  termLabel,
  termOptions,
  useCertificateMutations,
  useCertificates,
  useRecentCertificates,
  useOfficerNames,
} from '../../api/applications'

// 可申請證明的職位:標準身份值,顯示依社團名稱推導(社長/會長)
const POSITIONS: MemberKind[] = ['負責人', '副負責人']

export default function CertificatePage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const guard = useFormUnsavedGuard()
  const term: string | undefined = Form.useWatch('term', form)
  const position: MemberKind | undefined = Form.useWatch('position', form)

  const semestersQuery = useMemberSemesters()
  const terms = termOptions(semestersQuery.data ?? [])

  // 依學年期 + 職位自動帶出成員(名單預覽);0 或 >1 位皆不可送出,送出時後端再驗證
  const namesQuery = useOfficerNames(term, position)
  const uniqueNames = namesQuery.data ?? []
  const matchState: 'idle' | 'loading' | 'ok' | 'none' | 'many' | 'error' =
    !term || !position
      ? 'idle'
      : namesQuery.isError
        ? 'error'
        : namesQuery.isPending
          ? 'loading'
          : uniqueNames.length === 1
            ? 'ok'
            : uniqueNames.length === 0
              ? 'none'
              : 'many'

  const listQuery = useCertificates()
  const recentQuery = useRecentCertificates()
  // 正在申請=未完成全部、最近申請=已完成近 5 筆,兩份都由後端篩好
  const activeRows = listQuery.data?.records ?? []
  const recentRows = recentQuery.data ?? []
  const { create } = useCertificateMutations()

  return (
    <div>
      <PageHeader title="幹部證明" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        製作需 <span className="num">2</span> 個工作天
      </div>

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          onValuesChange={guard.onValuesChange}
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
                  guard.clear()
                },
                onError: (e) => message.error(e.message),
              },
            )
          }}
          initialValues={{ club: user?.club }}
        >
          <div className="form-grid-2">
            <Form.Item name="term" label="擔任學年度或學期" rules={[{ required: true, message: '請選擇學年期' }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder={terms.length ? '請選擇' : '名單尚無資料'}
                options={terms}
                loading={semestersQuery.isPending}
                disabled={!terms.length}
              />
            </Form.Item>
            <Form.Item name="club" label="社團名稱" style={{ marginBottom: 0 }}>
              <Input readOnly style={{ background: 'var(--paper)' }} />
            </Form.Item>
            <Form.Item name="position" label="擔任職位" rules={[{ required: true, message: '請選擇職位' }]} style={{ marginBottom: 0 }}>
              <Select placeholder="請選擇" options={POSITIONS.map((p) => ({ value: p, label: kindLabel(p, user?.clubKind) }))} />
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
              {matchState === 'error' && (
                <QueryError compact title="成員名單載入失敗" error={namesQuery.error} onRetry={() => namesQuery.refetch()} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit" disabled={matchState !== 'ok' || create.isPending} loading={create.isPending}>
              送出申請
            </Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在申請</div>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb fixed" aria-label="幹部證明申請紀錄" style={{ minWidth: 480 }}>
            <Cols widths={['auto', 130, 110, 100]} />
            <thead>
              <tr>
                <th scope="col">申請人</th>
                <th scope="col">學年期</th>
                <th scope="col">申請日期</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{`${c.applicantName} (${kindLabel(c.position, user?.clubKind)})`}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{termLabel(c.term)}</td>
                  <td className="num" style={{ fontSize: 13 }}>{c.date}</td>
                  <td><StatusPill status={c.status} /></td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="申請紀錄載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && activeRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有進行中的申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
        <LoadingBlock pending={recentQuery.isPending}>
          <table className="tb fixed" aria-label="幹部證明申請紀錄" style={{ minWidth: 480 }}>
            <Cols widths={['auto', 130, 110, 100]} />
            <thead>
              <tr>
                <th scope="col">申請人</th>
                <th scope="col">學年期</th>
                <th scope="col">申請日期</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{`${c.applicantName} (${kindLabel(c.position, user?.clubKind)})`}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{termLabel(c.term)}</td>
                  <td className="num" style={{ fontSize: 13 }}>{c.date}</td>
                  <td><StatusPill status={c.status} /></td>
                </tr>
              ))}
              {recentQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="申請紀錄載入失敗" error={recentQuery.error} onRetry={() => recentQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!recentQuery.isPending && !recentQuery.isError && recentRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>
    </div>
  )
}
