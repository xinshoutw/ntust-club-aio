import { useState } from 'react'
import { App, Select, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { fileDownloadUrl } from '../../api/adminFiles'
import {
  APPLICATIONS_PAGE_SIZE,
  NEXT_STATUS,
  useAdminOfficerCerts,
  useAdminPostalChanges,
  useApplicationStatusMutation,
  usePendingApplicationTotal,
  type ApplicationKind,
  type ApplicationStatus,
} from '../../api/adminApplications'

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: '審核中',
  processing: '處理中',
  completed: '請洽學務處',
}

// 狀態機僅允許單步前進(審核中→處理中→請洽學務處):下拉只開放下一步選項
function StatusCell({
  kind,
  id,
  status,
  name,
}: {
  kind: ApplicationKind
  id: number
  status: ApplicationStatus
  name: string
}) {
  const { message } = App.useApp()
  const updateStatus = useApplicationStatusMutation()
  if (status === 'completed') return <StatusPill status="completed" />
  return (
    <Select<ApplicationStatus>
      size="small"
      value={status}
      style={{ width: 120 }}
      disabled={updateStatus.isPending}
      onChange={(v) =>
        updateStatus.mutate(
          { kind, id, status: v },
          {
            onSuccess: () => message.success(`${name} 狀態已更新為「${STATUS_LABELS[v]}」`),
            onError: (e) => message.error(e.message),
          },
        )
      }
      options={(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
        disabled: s !== status && NEXT_STATUS[status] !== s,
      }))}
    />
  )
}

export default function AdminApplicationsPage() {
  // 兩張表各自分頁(是兩種申請、兩支端點,頁碼不共用)
  const [certPage, setCertPage] = useState(1)
  const [postalPage, setPostalPage] = useState(1)
  const certsQuery = useAdminOfficerCerts(certPage)
  const postalQuery = useAdminPostalChanges(postalPage)
  const certs = certsQuery.data?.rows ?? []
  const postals = postalQuery.data?.rows ?? []
  const pendingTotal = usePendingApplicationTotal()

  return (
    <div>
      <PageHeader
        title="線上申請管理"
        sub={
          <>
            待處理 <span className="num">{pendingTotal.data ?? '—'}</span> 件
          </>
        }
      />

      <Spin spinning={certsQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <div style={{ padding: '14px 16px 0', fontSize: 15, fontWeight: 600 }}>幹部證明</div>
          <table className="tb dense fixed" style={{ minWidth: 720 }}>
            {/* 社團吃剩餘寬並截斷;學年期/職位/申請人/申請日/狀態固定 px */}
            <Cols widths={['auto', 90, 110, 100, 96, 150]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">學年期</th>
                <th scope="col">職位</th>
                <th scope="col">申請人</th>
                <th scope="col">申請日</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
                  <td className="cell-clip" title={c.club}>{c.club}</td>
                  <td className="num">{c.term}</td>
                  <td>{c.position}</td>
                  <td style={{ fontWeight: 500 }}>{c.applicant}</td>
                  <td className="num" style={{ fontSize: 13 }}>{c.date}</td>
                  <td>
                    <StatusCell kind="cert" id={c.id} status={c.status} name={`${c.club} ${c.applicant}`} />
                  </td>
                </tr>
              ))}
              {certsQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError compact title="幹部證明載入失敗" error={certsQuery.error} onRetry={() => certsQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!certsQuery.isPending && !certsQuery.isError && certs.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有幹部證明申請</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager
            page={certPage}
            pageSize={APPLICATIONS_PAGE_SIZE}
            total={certsQuery.data?.total ?? 0}
            onChange={setCertPage}
          />
        </div>
      </Spin>

      <Spin spinning={postalQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <div style={{ padding: '14px 16px 0', fontSize: 15, fontWeight: 600 }}>郵局帳戶異動</div>
          <table className="tb dense fixed" style={{ minWidth: 860 }}>
            {/* 社團截斷、事由吃剩餘寬且允許換行;戶名/帳號/代理人/申請日/狀態固定 px */}
            <Cols widths={['14%', 'auto', 100, 130, 130, 110, 96, 150]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">事由</th>
                <th scope="col">戶名</th>
                <th scope="col">局號帳號</th>
                <th scope="col">新代理人</th>
                <th scope="col">存簿影本</th>
                <th scope="col">申請日</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {postals.map((p) => (
                <tr key={p.id}>
                  <td className="cell-clip" title={p.club}>{p.club}</td>
                  <td style={{ fontSize: 13 }}>{p.reasons.join('、')}</td>
                  <td>{p.accountName}</td>
                  <td className="num" style={{ fontSize: 13 }}>{p.accountNumber}</td>
                  <td style={{ fontSize: 13 }}>
                    {p.newAgentName ? (
                      <>
                        {p.newAgentName} <span className="num" style={{ color: 'var(--steel)' }}>{p.newAgentPhone}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  {/* 承辦要核對局號帳號,存簿影本不該只在檔案管理找得到 */}
                  <td className="cell-clip" style={{ fontSize: 13 }} title={p.passbook.map((f) => f.name).join('、')}>
                    {p.passbook.length
                      ? p.passbook.map((f, i) => (
                          <span key={f.id}>
                            {i > 0 && ' · '}
                            <a href={fileDownloadUrl(f.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--focus)' }}>
                              {f.name}
                            </a>
                          </span>
                        ))
                      : <span style={{ color: 'var(--steel)' }}>—</span>}
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{p.date}</td>
                  <td>
                    <StatusCell kind="postal" id={p.id} status={p.status} name={`${p.club} ${p.accountName}`} />
                  </td>
                </tr>
              ))}
              {postalQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={8}>
                    <QueryError compact title="郵局帳戶異動載入失敗" error={postalQuery.error} onRetry={() => postalQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!postalQuery.isPending && !postalQuery.isError && postals.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有郵局帳戶異動申請</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager
            page={postalPage}
            pageSize={APPLICATIONS_PAGE_SIZE}
            total={postalQuery.data?.total ?? 0}
            onChange={setPostalPage}
          />
        </div>
      </Spin>
    </div>
  )
}
