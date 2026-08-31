import { useState } from 'react'
import { useNavigate } from 'react-router'
import { countText } from '../../lib/counts'
import { Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import BookingReviewModal, { type BookingReviewItem } from './BookingReviewModal'
import BookingGrid from '../bookings/BookingGrid'
import {
  useAdminBookingMutations,
  usePendingEquipmentLoans,
  usePendingVenueBookings,
} from '../../api/adminBookings'

const PAGE_SIZE = 50

export default function AdminBookingsPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<BookingReviewItem | null>(null)
  const [open, setOpen] = useState(false)
  const [venuePage, setVenuePage] = useState(1)
  const [loanPage, setLoanPage] = useState(1)

  const venueQuery = usePendingVenueBookings({ page: venuePage, pageSize: PAGE_SIZE })
  const loanQuery = usePendingEquipmentLoans({ page: loanPage, pageSize: PAGE_SIZE })
  const { approveVenue, rejectVenue, approveLoan, rejectLoan } = useAdminBookingMutations()

  const pendingVenues = venueQuery.data?.bookings ?? []
  const venueTotal = venueQuery.data?.total ?? 0
  const pendingLoans = loanQuery.data?.loans ?? []
  const loanTotal = loanQuery.data?.total ?? 0

  const openReview = (item: BookingReviewItem) => {
    setSelected(item)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="臨時場地器材借用"
        sub={
          <>
            待審 <span className="num">{countText(venueTotal + loanTotal, venueQuery, loanQuery)}</span> 件
          </>
        }
      />

      {/* 借用情形:與社團端、公開首頁同一份色格圖。點格直接帶參數去手動借用 */}
      <BookingGrid
        allowPast
        onBookVenue={(venueId, date, period) =>
          navigate(
            `/admin/manual-booking?venue=${venueId}&date=${date.format('YYYY/MM/DD')}&period=${period}`,
          )
        }
        onBookEquipment={(equipmentId, date) =>
          navigate(`/admin/manual-booking?equipment=${equipmentId}&date=${date.format('YYYY/MM/DD')}`)
        }
      />

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>場地</div>
        <LoadingBlock pending={venueQuery.isPending}>
          <table className="tb dense fixed" aria-label="待審場地借用" style={{ minWidth: 720 }}>
            {/* 社團/場地截斷、時段與用途吃剩餘寬且允許換行;日期/狀態/開啟固定 px */}
            <Cols widths={['18%', '18%', 96, 'auto', 90, 32]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">場地</th>
                <th scope="col">日期</th>
                <th scope="col">時段與用途</th>
                <th scope="col">狀態</th>
                <th scope="col" aria-label="開啟" />
              </tr>
            </thead>
            <tbody>
              {pendingVenues.map((v) => (
                <tr key={v.id} onClick={() => openReview({ kind: 'venue', data: v })} style={{ cursor: 'pointer' }}>
                  <td className="cell-clip" title={v.club}>{v.club}</td>
                  <td className="cell-clip" title={v.venue || '未命名場地'} style={{ fontWeight: 500 }}>
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟 ${v.club} 借用「${v.venue || '未命名場地'}」的審核`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openReview({ kind: 'venue', data: v })
                      }}
                    >
                      {v.venue || '未命名場地'}
                    </button>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>第 {v.periods.join('、')} 節 · {v.purpose}</td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {venueQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError
                      compact
                      title="臨時場地申請載入失敗"
                      error={venueQuery.error}
                      onRetry={() => void venueQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!venueQuery.isPending && !venueQuery.isError && pendingVenues.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的場地借用</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={venuePage} pageSize={PAGE_SIZE} total={venueTotal} onChange={setVenuePage} />
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材</div>
        <LoadingBlock pending={loanQuery.isPending}>
          <table className="tb dense fixed" aria-label="待審器材借用" style={{ minWidth: 720 }}>
            {/* 社團截斷、器材與數量允許換行(數量須可見)、活動與用途吃剩餘寬;期間/狀態/開啟固定 px */}
            <Cols widths={['16%', '20%', 184, 'auto', 90, 32]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">器材與數量</th>
                <th scope="col">借用期間</th>
                <th scope="col">活動與用途</th>
                <th scope="col">狀態</th>
                <th scope="col" aria-label="開啟" />
              </tr>
            </thead>
            <tbody>
              {pendingLoans.map((l) => {
                // 該區間可借數不足:數量紅字提示(是否核准由管理員裁量)
                const short = l.availableExcludingSelf != null && l.qty > l.availableExcludingSelf
                return (
                  <tr key={l.id} onClick={() => openReview({ kind: 'loan', data: l })} style={{ cursor: 'pointer' }}>
                    <td className="cell-clip" title={l.club}>{l.club}</td>
                    <td style={{ fontWeight: 500 }}>
                      <button
                        type="button"
                        className="row-open-btn"
                        aria-label={`開啟 ${l.club} 借用「${l.equipment || '未命名器材'}」的審核`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openReview({ kind: 'loan', data: l })
                        }}
                      >
                        {l.equipment || '未命名器材'}
                      </button>{' '}
                      {short ? (
                        <Tooltip title={`該區間可借 ${l.availableExcludingSelf}`}>
                          <span className="num" style={{ color: '#C13B34', fontWeight: 600 }}>×{l.qty}</span>
                        </Tooltip>
                      ) : (
                        <span className="num">×{l.qty}</span>
                      )}
                    </td>
                    <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                    <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                      {l.activity ? `${l.activity} · ${l.purpose}` : l.purpose}
                    </td>
                    <td><StatusPill status={l.status} /></td>
                    <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                  </tr>
                )
              })}
              {loanQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError
                      compact
                      title="器材借用申請載入失敗"
                      error={loanQuery.error}
                      onRetry={() => void loanQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!loanQuery.isPending && !loanQuery.isError && pendingLoans.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有待審的器材借用</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={loanPage} pageSize={PAGE_SIZE} total={loanTotal} onChange={setLoanPage} />
      </div>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <BookingReviewModal
          key={selected.data.id}
          item={selected}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
          onApprove={() =>
            selected.kind === 'venue'
              ? approveVenue.mutateAsync(selected.data.apiId)
              : approveLoan.mutateAsync(selected.data.apiId)
          }
          onReject={(reason) =>
            selected.kind === 'venue'
              ? rejectVenue.mutateAsync({ id: selected.data.apiId, reason })
              : rejectLoan.mutateAsync({ id: selected.data.apiId, reason })
          }
        />
      )}
    </div>
  )
}
