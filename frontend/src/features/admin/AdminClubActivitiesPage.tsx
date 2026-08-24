import { useEffect, useRef, useState } from 'react'
import { Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import OptionsError from '../../components/ui/OptionsError'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import StatusPill from '../../components/ui/StatusPill'
import MoneyPair from '../../components/ui/MoneyPair'
import LargeBadge from '../../components/ui/LargeBadge'
import { countText } from '../../lib/counts'
import { clampPage } from '../../lib/paging'
import { semesterOptions } from '../../lib/semester'
import { useFitRows } from '../../lib/fitRows'
import { useFilePreview } from '../eval/useFilePreview'
import ActivityPreviewModal from '../activities/ActivityPreviewModal'
import { LISTED_STATUS_LABELS, approvedText, fmtMoney, statusesForLabels } from '../activities/types'
import { dateRangeText } from '../activities/utils'
import { type ClubActivity } from '../../api/activities'
import {
  useAdminActivitySemesters,
  useAdminClubActivities,
  useAdminClubActivityDetail,
} from '../../api/adminActivities'
import { useClubOptions } from '../../api/adminClubs'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'

// 排序鍵=後端 /admin/activities 白名單中社團端也有的那幾個。白名單裡的 budget 是
// 「自籌+擬請」合計,與經費欄顯示的「自籌 / 核定」不是同一件事,故不接出去(同社團端)
type SortKey = 'name' | 'type' | 'date' | 'status'

// 類型漏斗**不能照抄社團端的兩個選項**:社團端篩的是 Activity.type(「活動」含大型),
// 行政端的「活動」是 EVENT 且非大型、大型另成一項。只放兩個的話,承辦選「活動」
// 會讓該社的大型活動整批消失,而列上還畫著大型徽章
const TYPE_OPTIONS = ['社課或會議', '活動', '大型活動']

// 社團端活動列表的行政唯讀版:同一張表、同一個詳情彈窗(features/activities/ActivityPreviewModal),
// 差別只有三處 —— 沒有動作欄、沒有草稿區(草稿不進行政視野)、詳情沒有編輯/結案按鈕。
// 欄序、欄寬與經費欄的 MoneyPair 都跟著社團端走:兩頁刻意長一樣,改一頁沒改另一頁
// 就是同一張表在兩個地方長不一樣(類型漏斗是唯一例外,見上)。
// 資料走 /admin/activities?club_id=,經社團端的對照轉成同一組型別。
export default function AdminClubActivitiesPage() {
  const { club, clubId } = useAdminClub()
  // 卡片撐到視窗底、列數依高度算;分頁列跟著卡片底邊,列數不足時位置也不變
  const tableCard = useRef<HTMLDivElement>(null)
  const { height: cardHeight, rows: pageSize } = useFitRows(tableCard)
  const [page, setPage] = useState(1)
  const [semesterSel, setSemesterSel] = useState<string | null>(null)
  const { entries, toggle } = useMultiSort<SortKey>([{ key: 'date', dir: -1 }])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [preview, setPreview] = useState<ClubActivity | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const filePreview = useFilePreview()

  // 換社團要回第一頁,學期也要放掉:上一社選的學期在新社可能一筆都沒有,
  // 留著就是一片空白卻沒有任何說明(比照 AdminMembersPage)
  useEffect(() => {
    setPage(1)
    setSemesterSel(null)
  }, [clubId])

  // clubId 為 null 有兩個原因:還沒選,或社團選項載不到 —— 後者叫人「請先選擇社團」是做不到的指示
  const clubsQuery = useClubOptions()
  const semestersQuery = useAdminActivitySemesters(clubId, clubId != null)
  const semOptions = semesterOptions(semestersQuery.data ?? [])
  const semester = semesterSel ?? semOptions[0].value

  const listQuery = useAdminClubActivities({
    clubId,
    semester,
    statuses: statusesForLabels(statusFilter),
    types: typeFilter.length ? typeFilter : undefined,
    sort: sortParam(entries),
    page,
    pageSize,
  })
  const rows = listQuery.data?.rows ?? []
  const total = listQuery.data?.total ?? 0
  const detailQuery = useAdminClubActivityDetail(preview?.id)

  // 視窗變高會讓總頁數變少;停在末頁只會看到空表。失敗時 total 也是 0,只在成功後收斂
  const listLoaded = listQuery.isSuccess
  useEffect(() => {
    if (listLoaded) setPage((p) => clampPage(p, total, pageSize))
  }, [listLoaded, total, pageSize])

  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }
  const sortHeader = (label: string, key: SortKey) => (
    <MultiSortButton label={label} sortKey={key} entries={entries} onToggle={toggleSort} />
  )
  const openRow = (a: ClubActivity) => {
    setPreview(a)
    setPreviewOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="活動列表"
        sub={
          <>
            共 <span className="num">{countText(total, listQuery)}</span> 件
          </>
        }
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* semesterOptions 一定補上當學期,查詢掛掉時只是歷史學期全不見 */}
            {semestersQuery.isError && (
              <OptionsError
                what="學期清單"
                error={semestersQuery.error}
                onRetry={() => void semestersQuery.refetch()}
              />
            )}
            <Select
              value={semester}
              onChange={(v) => {
                setSemesterSel(v)
                setPage(1)
              }}
              style={{ width: 110 }}
              options={semOptions}
              loading={semestersQuery.isPending && clubId != null}
            />
            <ClubSelect />
          </div>
        }
      />

      <div
        ref={tableCard}
        className="card"
        style={{ marginTop: 20, height: cardHeight, display: 'flex', flexDirection: 'column' }}
      >
        {/* 表格區吃掉剩餘高度;直向不捲(列數就是照這塊高度算的),橫向留給窄視窗 */}
        <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        {/* 沿用上一份時整表淡化,避免看起來像是新條件的結果(社團端同一條) */}
        <LoadingBlock pending={clubId != null && listQuery.isPending} rows={8}>
          <table
            className="tb fixed"
            aria-label="活動列表"
            aria-busy={listQuery.isPlaceholderData}
            style={{ minWidth: 810, opacity: listQuery.isPlaceholderData ? 0.55 : 1 }}
          >
            <Cols widths={[110, 'auto', 120, 190, 190]} />
            <thead>
              <tr>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {sortHeader('狀態', 'status')}
                    <FilterButton
                      options={LISTED_STATUS_LABELS}
                      selected={statusFilter}
                      onChange={(next) => { setStatusFilter(next); setPage(1) }}
                      label="篩選狀態"
                    />
                  </span>
                </th>
                <th scope="col">{sortHeader('名稱', 'name')}</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {sortHeader('類型', 'type')}
                    <FilterButton
                      options={TYPE_OPTIONS}
                      selected={typeFilter}
                      onChange={(next) => { setTypeFilter(next); setPage(1) }}
                      label="篩選類型"
                    />
                  </span>
                </th>
                <th scope="col">{sortHeader('日期', 'date')}</th>
                <th scope="col" className="r num">
                  <MoneyPair left="自籌" right="核定" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} onClick={() => openRow(a)} style={{ cursor: 'pointer' }}>
                  <td><StatusPill status={a.status} /></td>
                  <td className="cell-clip" style={{ fontWeight: 500 }} title={a.name || undefined}>
                    {/* 鍵盤入口:與整列 onClick 同動作;stopPropagation 避免雙觸發 */}
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟「${a.name || '未命名活動'}」詳細資訊`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openRow(a)
                      }}
                    >
                      {a.name || '(未命名)'}
                    </button>
                  </td>
                  <td>
                    {a.type}
                    <LargeBadge applied={a.isLarge} approved={a.largeApproved} />
                  </td>
                  {/* 起訖日折成兩行讀起來像兩筆日期 */}
                  <td className="num" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dateRangeText(a)}</td>
                  {/* 核定為 null=承辦還沒核,不是核了 0 元 */}
                  <td className="r num" style={{ fontSize: 13 }}>
                    <MoneyPair left={fmtMoney(a.selfFundTotal)} right={approvedText(a.approvedTotal, fmtMoney)} />
                  </td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError
                      compact
                      title="活動列表載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {/* 未選社團時查詢未啟用、isPending 恆真,tbody 會整個空白 —— 空狀態要自己帶 clubId。
                  抓取中不顯示空狀態:沿用上一份時 rows 不會是空的,但首次載入會 */}
              {(clubId == null || (!listQuery.isFetching && !listQuery.isError)) && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 28 }}>
                    {clubsQuery.isError
                      ? '社團清單載入失敗，請以頁首的重試鈕重新載入'
                      : clubId == null
                        ? '請先選擇社團'
                        : `${club} 本學期尚無活動`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
        </div>
        {/* 分頁列改放卡片內:卡片高度固定,它才會永遠停在同一條線上(全站其餘表格同型) */}
        <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>

      {/* 唯讀:不給 onEdit / onGoClose,footer 的編輯與前往結案自然收掉;
          結案 PDF 走行政端那兩支(社團端的綁 club_id,承辦讀別社會 404) */}
      <ActivityPreviewModal
        a={preview}
        detail={detailQuery.data}
        loading={preview != null && detailQuery.isPending}
        error={detailQuery.error}
        onRetry={() => void detailQuery.refetch()}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        afterClose={() => setPreview(null)}
        onPreviewFile={filePreview.preview}
        pdfBase="admin"
      />
      {filePreview.node}
    </div>
  )
}
