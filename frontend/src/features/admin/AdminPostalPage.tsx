import { useState } from 'react'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager } from '../../components/ui/tableControls'
import { fileDownloadUrl } from '../../api/adminFiles'
import { StatusCell } from './ApplicationStatusCell'
import {
  APPLICATIONS_PAGE_SIZE,
  useAdminPostalChanges,
  usePendingPostalTotal,
} from '../../api/adminApplications'

// 郵局帳戶管理(權限鍵 apostal)。原本與幹部證明同頁,拆成兩頁兩把鍵(decisions.md D-11)。
export default function AdminPostalPage() {
  const [page, setPage] = useState(1)
  const postalQuery = useAdminPostalChanges(page)
  const postals = postalQuery.data?.rows ?? []
  const pendingTotal = usePendingPostalTotal()

  return (
    <div>
      <PageHeader
        title="郵局帳戶管理"
        sub={
          <>
            待處理 <span className="num">{pendingTotal.data ?? '—'}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={postalQuery.isPending}>
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
                  <td>{p.accountName || '—'}</td>
                  <td className="num" style={{ fontSize: 13 }}>{p.accountNumber || '—'}</td>
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
                    <StatusCell kind="postal" id={p.id} status={p.status} name={`${p.club} ${p.accountName || ''}`.trim()} />
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
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無郵局帳戶異動申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>
      <Pager
        page={page}
        pageSize={APPLICATIONS_PAGE_SIZE}
        total={postalQuery.data?.total ?? 0}
        onChange={setPage}
      />
    </div>
  )
}
