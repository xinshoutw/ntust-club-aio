import { useState } from 'react'
import { useNavigate } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import SuspensionNote from '../../components/ui/SuspensionNote'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager } from '../../components/ui/tableControls'
import StatusPill from '../../components/ui/StatusPill'
import { confirmDialog } from '../../lib/confirm'
import { bookingStarted, usePeriods } from '../../lib/periods'
import {
  roomEntryText,
  useActiveEquipmentLoans,
  useActiveRoomBookings,
  useActiveVenueBookings,
  RECENT_PAGE,
  useRecentEquipmentLoans,
  useRecentRoomBookings,
  useRecentVenueBookings,
  useReturnedEquipmentLoans,
  useBookingMutations,
} from '../../api/bookings'
import BookingGrid from './BookingGrid'
import { useDecisionReason } from './DecisionReasonModal'
import { taipeiToday } from '../../lib/today'

const RETURNED_PAGE = 10

export default function BookingOverviewPage() {
  const periodCatalogue = usePeriods()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const { cancelRoomBooking, cancelVenueBooking, cancelEquipmentLoan } = useBookingMutations()
  const [returnedPage, setReturnedPage] = useState(1)
  const todayStart = taipeiToday()

  // 正在借用:伺服器端 active=true 過濾
  const roomsQuery = useActiveRoomBookings()
  const venueBookingsQuery = useActiveVenueBookings()
  const loansQuery = useActiveEquipmentLoans()
  const returnedQuery = useReturnedEquipmentLoans({ page: returnedPage, pageSize: RETURNED_PAGE })
  const rooms = roomsQuery.data ?? []
  const venueBookings = venueBookingsQuery.data ?? []
  const active = loansQuery.data ?? []
  const returnedPaged = returnedQuery.data?.rows ?? []
  const returnedTotal = returnedQuery.data?.total ?? 0
  const listsPending = roomsQuery.isPending || venueBookingsQuery.isPending || loansQuery.isPending
  const listsErrored = [roomsQuery, venueBookingsQuery, loansQuery].filter((q) => q.isError)
  const retryLists = () => {
    for (const q of listsErrored) void q.refetch()
  }

  // 最近申請:三類各取近 5 筆(與各借用頁同一份查詢),退回件可點開原因
  const firstPage = { page: 1, pageSize: RECENT_PAGE }
  const recentRoomsQuery = useRecentRoomBookings(firstPage)
  const recentVenuesQuery = useRecentVenueBookings(firstPage)
  const recentLoansQuery = useRecentEquipmentLoans(firstPage)
  const decision = useDecisionReason()
  const recentRooms = recentRoomsQuery.data?.rows ?? []
  const recentVenues = recentVenuesQuery.data?.rows ?? []
  // 不濾掉已歸還的:這裡拿到的就是後端給的最新 5 筆,濾完可能一列不剩,
  // 空表再配上「尚無申請紀錄」就成了假話。與上面那張卡重疊幾列是可以接受的代價
  const recentLoans = recentLoansQuery.data?.rows ?? []
  const recentQueries = [recentRoomsQuery, recentVenuesQuery, recentLoansQuery]
  const recentPending = recentQueries.some((q) => q.isPending)
  const recentErrored = recentQueries.filter((q) => q.isError)
  const retryRecent = () => {
    for (const q of recentErrored) void q.refetch()
  }

  // 取消:審核中隨時可取消;已核准僅開始日前可取消(後端亦驗)
  const confirmCancel = (title: string, run: () => void) =>
    confirmDialog(modal, {
      title,
      content: '取消後不可復原;已核准的借用取消後時段將釋出',
      okText: '取消借用',
      okButtonProps: { danger: true },
      cancelText: '返回',
      onOk: run,
    })
  const cancelError = (e: unknown) => message.error(e instanceof Error ? e.message : '取消失敗')

  const book = (venueId: number, date: Dayjs, period: string) =>
    navigate(`/bookings/venue?venue=${venueId}&date=${date.format('YYYY/MM/DD')}&period=${period}`)

  // 器材借用的起訖日預設同為點擊的那一天(要跨天由使用者在借用頁調整)
  const borrow = (equipmentId: number, date: Dayjs) =>
    navigate(`/bookings/equipment?equipment=${equipmentId}&date=${date.format('YYYY/MM/DD')}`)

  return (
    <div>
      <PageHeader title="借用總覽" sub={<SuspensionNote />} />

      <BookingGrid onBookVenue={book} onBookEquipment={borrow} />

      {/* 正在借用:單卡整併(固定/臨時/器材)、完整呈現不限長度 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在借用</div>
        <LoadingBlock pending={listsPending}>
          <table className="tb fixed" aria-label="正在借用" style={{ minWidth: 680 }}>
            <Cols widths={[90, 'auto', 240, 110, 80]} />
            <thead>
              <tr>
                <th scope="col">類別</th>
                <th scope="col">內容</th>
                <th scope="col">時間</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={`room-${r.id}`}>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>固定場地</td>
                  <td style={{ fontWeight: 500 }}>{r.venueName}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    每週 {r.entries.map(roomEntryText).join('、')}
                  </td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="r">
                    {r.status === 'pending' || dayjs(r.startDate, 'YYYY/MM/DD').isAfter(todayStart, 'day') ? (
                      <Button
                        size="small"
                        danger
                        loading={cancelRoomBooking.isPending}
                        onClick={() =>
                          confirmCancel(`取消固定借用 ${r.venueName}`, () =>
                            cancelRoomBooking.mutate(r.id, {
                              onSuccess: () => message.success('已取消'),
                              onError: cancelError,
                            }),
                          )
                        }
                      >
                        取消
                      </Button>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {venueBookings.map((v) => (
                <tr key={`venue-${v.id}`}>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>臨時場地</td>
                  <td style={{ fontWeight: 500 }}>{v.venueName}<span style={{ color: 'var(--steel)', fontWeight: 400, fontSize: 13 }}> · {v.purpose}</span></td>
                  <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{v.date} 第 {v.periods.join('、')} 節</td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="r">
                    {/* 臨時場地:申請起始時刻(最早節次起點)前皆可取消,pending 與 approved 一致(與後端同界) */}
                    {(v.status === 'pending' || v.status === 'approved') && !bookingStarted(periodCatalogue, v.date, v.periods) ? (
                      <Button
                        size="small"
                        danger
                        loading={cancelVenueBooking.isPending}
                        onClick={() =>
                          confirmCancel(`取消臨時借用 ${v.venueName}(${v.date})`, () =>
                            cancelVenueBooking.mutate(v.id, {
                              onSuccess: () => message.success('已取消'),
                              onError: cancelError,
                            }),
                          )
                        }
                      >
                        取消
                      </Button>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {active.map((l) => (
                <tr key={`loan-${l.id}`}>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>器材</td>
                  <td style={{ fontWeight: 500 }}>{l.equipmentName} <span className="num">×{l.qty}</span></td>
                  <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                  <td><StatusPill status={l.status} /></td>
                  <td className="r">
                    {l.status === 'pending' ||
                    (l.status === 'approved' && dayjs(l.startDate, 'YYYY/MM/DD').isAfter(todayStart, 'day')) ? (
                      <Button
                        size="small"
                        danger
                        loading={cancelEquipmentLoan.isPending}
                        onClick={() =>
                          confirmCancel(`取消器材借用 ${l.equipmentName} ×${l.qty}`, () =>
                            cancelEquipmentLoan.mutate(l.id, {
                              onSuccess: () => message.success('已取消'),
                              onError: cancelError,
                            }),
                          )
                        }
                      >
                        取消
                      </Button>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {listsErrored.length > 0 && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError compact title="借用紀錄載入失敗" error={listsErrored[0]?.error} onRetry={retryLists} />
                  </td>
                </tr>
              )}
              {listsErrored.length === 0 && !listsPending && rooms.length === 0 && venueBookings.length === 0 && active.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無借用紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      {/* 已歸還:伺服器端分頁(status=returned) */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近歸還</div>
        <LoadingBlock pending={returnedQuery.isPending}>
          <table className="tb fixed" aria-label="最近歸還" style={{ minWidth: 560 }}>
            <Cols widths={['auto', 190, 'auto', 100]} />
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col">借用期間</th>
                <th scope="col">用途</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {returnedPaged.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipmentName} <span className="num">×{l.qty}</span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.purpose}</td>
                  <td><StatusPill status="returned" /></td>
                </tr>
              ))}
              {returnedQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="歸還紀錄載入失敗" error={returnedQuery.error} onRetry={() => returnedQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!returnedQuery.isError && returnedTotal === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無歸還紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={returnedPage} pageSize={RETURNED_PAGE} total={returnedTotal} onChange={setReturnedPage} style={{ padding: '10px 0 14px' }} />
      </div>

      {/* 最近申請:已結束/退回/取消的近況,單卡整併三類(與「正在借用」同一份欄位) */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近申請</div>
        <LoadingBlock pending={recentPending}>
          <table className="tb fixed" aria-label="最近申請" style={{ minWidth: 680 }}>
            <Cols widths={[90, 'auto', 240, 110]} />
            <thead>
              <tr>
                <th scope="col">類別</th>
                <th scope="col">內容</th>
                <th scope="col">時間</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recentRooms.map((r) => {
                const row = decision.rowProps(r.venueName, r.status, r.decision)
                return (
                  <tr key={`room-${r.id}`} {...row.tr}>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>固定場地</td>
                    <td style={{ fontWeight: 500 }}>{row.wrap(r.venueName)}</td>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                      每週 {r.entries.map(roomEntryText).join('、')}
                    </td>
                    <td><StatusPill status={r.status} /></td>
                  </tr>
                )
              })}
              {recentVenues.map((v) => {
                const row = decision.rowProps(`${v.venueName}（${v.date}）`, v.status, v.decision)
                return (
                  <tr key={`venue-${v.id}`} {...row.tr}>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>臨時場地</td>
                    <td style={{ fontWeight: 500 }}>
                      {row.wrap(<>{v.venueName}<span style={{ color: 'var(--steel)', fontWeight: 400, fontSize: 13 }}> · {v.purpose}</span></>)}
                    </td>
                    <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{v.date} 第 {v.periods.join('、')} 節</td>
                    <td><StatusPill status={v.status} /></td>
                  </tr>
                )
              })}
              {recentLoans.map((l) => {
                const row = decision.rowProps(`${l.equipmentName} ×${l.qty}`, l.status, l.decision)
                return (
                  <tr key={`loan-${l.id}`} {...row.tr}>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>器材</td>
                    <td style={{ fontWeight: 500 }}>
                      {row.wrap(<>{l.equipmentName} <span className="num">×{l.qty}</span></>)}
                    </td>
                    <td className="num" style={{ color: 'var(--steel)', fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                    <td><StatusPill status={l.status} /></td>
                  </tr>
                )
              })}
              {recentErrored.length > 0 && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError compact title="申請紀錄載入失敗" error={recentErrored[0]?.error} onRetry={retryRecent} />
                  </td>
                </tr>
              )}
              {recentErrored.length === 0 && !recentPending && recentRooms.length === 0 && recentVenues.length === 0 && recentLoans.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無申請紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      {decision.node}
    </div>
  )
}
