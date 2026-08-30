import { useState } from 'react'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager } from '../../components/ui/tableControls'
import { StatusCell } from './ApplicationStatusCell'
import {
  APPLICATIONS_PAGE_SIZE,
  useAdminOfficerCerts,
  usePendingCertTotal,
} from '../../api/adminApplications'

// 幹部證明管理(權限鍵 acert)。原本與郵局帳戶異動同頁,拆成兩頁兩把鍵(decisions.md D-11)。
export default function AdminCertificatesPage() {
  const [page, setPage] = useState(1)
  const certsQuery = useAdminOfficerCerts(page)
  const certs = certsQuery.data?.rows ?? []
  const pendingTotal = usePendingCertTotal()

  return (
    <div>
      <PageHeader
        title="幹部證明管理"
        sub={
          <>
            待處理 <span className="num">{pendingTotal.data ?? '—'}</span> 件
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={certsQuery.isPending}>
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
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無幹部證明申請</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>
      <Pager
        page={page}
        pageSize={APPLICATIONS_PAGE_SIZE}
        total={certsQuery.data?.total ?? 0}
        onChange={setPage}
      />
    </div>
  )
}
