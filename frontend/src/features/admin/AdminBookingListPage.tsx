import { useEffect, useRef, useState } from 'react'
import { Select } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useAuth } from '../../app/auth'
import { canAccessAdminPath } from '../../lib/permissions'
import LoadingBlock from '../../components/ui/LoadingBlock'
import OptionsError from '../../components/ui/OptionsError'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { countText } from '../../lib/counts'
import { clampPage } from '../../lib/paging'
import { useFitRows } from '../../lib/fitRows'
import { semesterOptions } from '../../lib/semester'
import { STATUS, type StatusKey } from '../../lib/status'
import { groupActiveClubs, useClubOptions } from '../../api/adminClubs'
import {
  useAdminBookingMutations,
  useBookingList,
  useBookingSemesters,
  type BookingListKind,
  type ListedBooking,
} from '../../api/adminBookings'
import BookingReviewModal from './BookingReviewModal'

// 兩種借用各自的狀態集合:漏斗的選項就是這一份,送給後端的也是這些鍵
// (器材的「已逾期」是推導狀態,後端 status=overdue 一併吃)
export const STATUSES: Record<BookingListKind, readonly StatusKey[]> = {
  venue: ['pending', 'approved', 'rejected', 'cancelled'],
  loan: ['pending', 'approved', 'checked_out', 'returned', 'overdue', 'rejected', 'cancelled'],
}

const TITLE: Record<BookingListKind, string> = { venue: '所有場地借用', loan: '所有器材借用' }

// 排序鍵=後端兩支清單各自的白名單;日期那一欄場地是 date、器材是 start_date
type SortKey = 'status' | 'date' | 'start_date' | 'club' | 'venue' | 'equipment' | 'created_at'

/** 借用的查閱頁:一個學期、所有社團、所有狀態攤在同一張表(與「所有活動」同一種頁);
 *  審核動作仍在「臨時場地器材借用」—— 持 `abooking` 的承辦在本頁的彈窗一樣簽得動,只持查閱鍵就純看 */
export default function AdminBookingListPage({ kind }: { kind: BookingListKind }) {
  // 卡片撐到視窗底、列數依高度算;分頁列跟著卡片底邊
  const tableCard = useRef<HTMLDivElement>(null)
  const { height: cardHeight, rows: pageSize } = useFitRows(tableCard)
  const [page, setPage] = useState(1)
  const [semesterSel, setSemesterSel] = useState<string | null>(null)
  const dateKey: SortKey = kind === 'venue' ? 'date' : 'start_date'
  const { entries, toggle } = useMultiSort<SortKey>([{ key: dateKey, dir: -1 }])
  const [clubFilter, setClubFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [current, setCurrent] = useState<ListedBooking | null>(null)
  const [open, setOpen] = useState(false)
  // 「看得到」與「動得了」是兩個判定:核准/退回/撤銷是 abooking 的事(一頁一鍵)
  const canAct = canAccessAdminPath(useAuth().user, '/admin/bookings')
  const mutations = useAdminBookingMutations()

  const semestersQuery = useBookingSemesters(kind)
  // 「全部學期」是必要的出口:跨學期找一張舊單,夾在單一學期裡看到的「無符合條件」是騙人的
  const semOptions = semesterOptions(semestersQuery.data ?? [], true)
  const semesterSelected = semesterSel ?? semOptions[1].value
  const semester = semesterSelected === 'all' ? undefined : semesterSelected

  // 有選社團但主檔未載入/名稱失效 → 強制空集,不可 fail-open 回全部(同所有活動頁)
  const clubsQuery = useClubOptions()
  const clubFolders = groupActiveClubs(clubsQuery.data ?? [])
  const clubIdMatches = clubFilter.length
    ? (clubsQuery.data ?? []).filter((c) => clubFilter.includes(c.name)).map((c) => c.id)
    : undefined
  const clubIds = clubIdMatches && clubIdMatches.length === 0 ? [-1] : clubIdMatches

  const statusKeys = STATUSES[kind]
  const listQuery = useBookingList(kind, {
    semester,
    statuses: statusKeys.filter((k) => statusFilter.includes(STATUS[k].label)),
    clubIds,
    sort: sortParam(entries),
    page,
    pageSize,
  })
  const rows = listQuery.data?.rows ?? []
  const total = listQuery.data?.total ?? 0

  // 只在查詢成功後 clamp:失敗時 total 也是 0,一起收斂會把錯誤說明洗掉
  const listLoaded = listQuery.isSuccess
  useEffect(() => {
    if (listLoaded) setPage((p) => clampPage(p, total, pageSize))
  }, [listLoaded, total, pageSize])

  const resetPage = () => setPage(1)
  const toggleSort = (k: SortKey) => {
    toggle(k)
    resetPage()
  }
  const sortHeader = (label: string, key: SortKey) => (
    <MultiSortButton label={label} sortKey={key} entries={entries} onToggle={toggleSort} />
  )
  const openRow = (i: number) => {
    setCurrent(rows[i])
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title={TITLE[kind]}
        sub={
          <>
            共 <span className="num">{countText(total, listQuery)}</span> 件
          </>
        }
        extra={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* semesterOptions 一定補上當學期,查詢掛掉時只是歷史學期全不見 */}
            {semestersQuery.isError && (
              <OptionsError
                what="學期清單"
                error={semestersQuery.error}
                onRetry={() => void semestersQuery.refetch()}
              />
            )}
            <Select
              value={semesterSelected}
              onChange={(v) => {
                setSemesterSel(v)
                resetPage()
              }}
              style={{ width: 120 }}
              options={semOptions}
              loading={semestersQuery.isPending}
            />
          </div>
        }
      />

      <div
        ref={tableCard}
        className="card"
        style={{ marginTop: 20, height: cardHeight, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
          <LoadingBlock pending={listQuery.isPending} rows={8}>
            <table
              className="tb dense fixed"
              aria-label={TITLE[kind]}
              aria-busy={listQuery.isPlaceholderData}
              style={{ minWidth: 960, opacity: listQuery.isPlaceholderData ? 0.55 : 1 }}
            >
              {/* 社團/場地截斷;器材與數量允許換行(數量須可見);時段用途吃剩餘寬 */}
              <Cols widths={[96, kind === 'venue' ? 110 : 190, 132, kind === 'venue' ? 160 : 180, 'auto', 140, 32]} />
              <thead>
                <tr>
                  <th scope="col">
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {sortHeader('狀態', 'status')}
                      <FilterButton
                        options={statusKeys.map((k) => STATUS[k].label)}
                        selected={statusFilter}
                        onChange={(next) => { setStatusFilter(next); resetPage() }}
                        label="篩選狀態"
                      />
                    </span>
                  </th>
                  <th scope="col">{sortHeader(kind === 'venue' ? '日期' : '借用期間', dateKey)}</th>
                  <th scope="col">
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {sortHeader('社團', 'club')}
                      <FilterButton
                        options={clubFolders}
                        selected={clubFilter}
                        onChange={(next) => { setClubFilter(next); resetPage() }}
                        label="篩選社團"
                      />
                    </span>
                  </th>
                  <th scope="col">
                    {kind === 'venue' ? sortHeader('場地', 'venue') : sortHeader('器材與數量', 'equipment')}
                  </th>
                  <th scope="col">{kind === 'venue' ? '時段與用途' : '活動與用途'}</th>
                  <th scope="col">{sortHeader('送件時間', 'created_at')}</th>
                  <th scope="col" aria-label="開啟" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const d = row.data
                  const name =
                    row.kind === 'venue' ? row.data.venue || '未命名場地' : row.data.equipment || '未命名器材'
                  return (
                    <tr
                      key={d.id}
                      onClick={() => openRow(i)}
                      style={{ cursor: 'pointer', ...(current?.data.id === d.id && open ? { background: 'var(--seal-tint)' } : {}) }}
                    >
                      <td><StatusPill status={d.status} /></td>
                      <td className="num" style={{ fontSize: 13 }}>
                        {row.kind === 'venue' ? row.data.date : `${row.data.startDate} – ${row.data.endDate}`}
                      </td>
                      <td className="cell-clip" title={d.club}>{d.club}</td>
                      <td className={row.kind === 'venue' ? 'cell-clip' : undefined} title={name} style={{ fontWeight: 500 }}>
                        {/* 鍵盤入口:與整列 onClick 同動作;stopPropagation 避免雙觸發 */}
                        <button
                          type="button"
                          className="row-open-btn"
                          aria-label={`開啟 ${d.club} 借用「${name}」的詳細資訊`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openRow(i)
                          }}
                        >
                          {name}
                        </button>
                        {row.kind === 'loan' && <> <span className="num">×{row.data.qty}</span></>}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                        {row.kind === 'venue'
                          ? `第 ${row.data.periods.join('、')} 節 · ${row.data.purpose}`
                          : row.data.activity
                            ? `${row.data.activity} · ${row.data.purpose}`
                            : row.data.purpose}
                      </td>
                      <td className="num">{d.createdAt}</td>
                      <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                    </tr>
                  )
                })}
                {/* 兩種失敗都要有出口:列表失敗時 rows 是空陣列,不說出來就會顯示成「無符合條件」 */}
                {(listQuery.isError || clubsQuery.isError) && (
                  <tr className="no-hover">
                    <td colSpan={7}>
                      <QueryError
                        compact
                        title={listQuery.isError ? '借用列表載入失敗' : '篩選選項載入失敗'}
                        error={listQuery.error ?? clubsQuery.error}
                        onRetry={() => {
                          if (listQuery.isError) void listQuery.refetch()
                          if (clubsQuery.isError) void clubsQuery.refetch()
                        }}
                      />
                    </td>
                  </tr>
                )}
                {!listQuery.isFetching && !listQuery.isError && !clubsQuery.isError && rows.length === 0 && (
                  <tr className="no-hover">
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 28 }}>
                      {clubFilter.length || statusFilter.length
                        ? '無符合條件的借用'
                        : semester
                          ? '本學期尚無借用'
                          : '尚無借用'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </LoadingBlock>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>

      {/* 與臨時場地器材審核頁同一支彈窗:待審且持 abooking 可就地簽核,否則唯讀;
          常駐待退場動畫結束才卸載 */}
      {current && (
        <BookingReviewModal
          key={`${current.kind}-${current.data.id}`}
          item={current}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setCurrent(null)}
          onApprove={
            canAct
              ? (qty) =>
                  current.kind === 'venue'
                    ? mutations.approveVenue.mutateAsync(current.data.apiId)
                    : mutations.approveLoan.mutateAsync({ id: current.data.apiId, qty })
              : undefined
          }
          onReject={
            canAct
              ? (reason) =>
                  current.kind === 'venue'
                    ? mutations.rejectVenue.mutateAsync({ id: current.data.apiId, reason })
                    : mutations.rejectLoan.mutateAsync({ id: current.data.apiId, reason })
              : undefined
          }
          onRevoke={
            canAct
              ? (reason) =>
                  current.kind === 'venue'
                    ? mutations.revokeVenue.mutateAsync({ id: current.data.apiId, reason })
                    : mutations.revokeLoan.mutateAsync({ id: current.data.apiId, reason })
              : undefined
          }
        />
      )}
    </div>
  )
}
