import { useEffect, useRef, useState } from 'react'
import { Checkbox, Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import OptionsError from '../../components/ui/OptionsError'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import MoneyPair from '../../components/ui/MoneyPair'
import LargeBadge from '../../components/ui/LargeBadge'
import { RightOutlined } from '@ant-design/icons'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { countText } from '../../lib/counts'
import { clampPage } from '../../lib/paging'
import { useFitRows } from '../../lib/fitRows'
import { semesterOptions } from '../../lib/semester'
import { useFilePreview } from '../eval/useFilePreview'
import ActivityPreviewModal from '../activities/ActivityPreviewModal'
import { LISTED_STATUS_LABELS, approvedText, fmtMoney, statusesForLabels } from '../activities/types'
import type { ClubActivity } from '../../api/activities'
import {
  useAdminActivitiesPaged,
  useAdminActivityDetail,
  useAdminActivityMutations,
  useAdminActivitySemesters,
  useAdminClubActivityDetail,
  type AdminActivity,
} from '../../api/adminActivities'
import { groupClubsForFilter, useClubOptions } from '../../api/adminClubs'
import ActivityReviewModal from './ActivityReviewModal'


// 排序鍵=後端 /admin/activities 白名單。經費欄顯示「自籌 / 核定」但排序鍵 budget 是
// 「自籌 + 擬請」合計,兩者不是同一件事 —— 該欄因此不給排序,不做名實不符的指示器
type SortKey = 'club' | 'name' | 'date' | 'status' | 'created_at' | 'reviewed_at'

// 結案流程中與已結案:這兩種狀態的重點是結案成果(照片、心得、檢討會議),
// 審核彈窗看不到那些,改開社團端那份完整檢視(唯讀)
const CLOSE_STAGE = new Set(['closing_pending_advisor', 'closed'])

/** 全校活動的查閱頁:所有狀態、所有社團,學期在右上角 */
export default function AdminActivitiesPage() {
  // 卡片撐到視窗底、列數依高度算;分頁列跟著卡片底邊,列數不足時位置也不變
  const tableCard = useRef<HTMLDivElement>(null)
  const { height: cardHeight, rows: pageSize } = useFitRows(tableCard)
  const [page, setPage] = useState(1)
  const [semesterSel, setSemesterSel] = useState<string | null>(null)
  const { entries, toggle } = useMultiSort<SortKey>([{ key: 'date', dir: -1 }])
  const [clubFilter, setClubFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [overdueOnly, setOverdueOnly] = useState(false)
  // 伺服器端搜尋:按下 Enter 或搜尋鈕才送出(邊打邊送等於對 14k 筆逐鍵掃一次)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState<AdminActivity | null>(null)
  // 完整檢視吃社團端型別;與 current 同一列、同一次查詢,兩份形狀一起收下
  const [currentClub, setCurrentClub] = useState<ClubActivity | null>(null)
  const [open, setOpen] = useState(false)
  const filePreview = useFilePreview()

  const semestersQuery = useAdminActivitySemesters()
  // 「全部學期」是必要的出口:逾期未結案與跨學期搜尋幾乎都落在舊學期
  // (issues.md ISS-95 記過同一個坑),夾在單一學期裡看到的「無符合條件」是騙人的
  const semOptions = semesterOptions(semestersQuery.data ?? [], true)
  const semesterSelected = semesterSel ?? semOptions[1].value
  const semester = semesterSelected === 'all' ? undefined : semesterSelected

  // 有選社團但主檔未載入/名稱失效 → 強制空集,不可 fail-open 回全部(同申請審核頁)
  const clubsQuery = useClubOptions()
  const clubFolders = groupClubsForFilter(clubsQuery.data ?? [])
  const clubIdMatches = clubFilter.length
    ? (clubsQuery.data ?? []).filter((c) => clubFilter.includes(c.name)).map((c) => c.id)
    : undefined
  const clubIds = clubIdMatches && clubIdMatches.length === 0 ? [-1] : clubIdMatches

  const listQuery = useAdminActivitiesPaged({
    semester,
    q: query || undefined,
    statuses: statusesForLabels(statusFilter),
    clubIds,
    overdue: overdueOnly,
    sort: sortParam(entries),
    page,
    pageSize,
  })
  const rows = listQuery.data?.rows ?? []
  const clubRows = listQuery.data?.clubRows ?? []
  const total = listQuery.data?.total ?? 0

  // 別處簽掉一件就會讓清單少一筆,停在末頁只會看到空表。
  // 失敗時 total 也是 0,一起 clamp 會把錯誤說明洗掉,所以只在成功後收斂
  const listLoaded = listQuery.isSuccess
  useEffect(() => {
    if (listLoaded) setPage((p) => clampPage(p, total, pageSize))
  }, [listLoaded, total, pageSize])

  const closeStage = current != null && CLOSE_STAGE.has(current.status)
  // 兩個彈窗吃不同型別,詳情只發需要的那一支
  const reviewDetail = useAdminActivityDetail(closeStage ? undefined : current?.activityId)
  const fullDetail = useAdminClubActivityDetail(closeStage ? current?.activityId : undefined)
  const { approve, reject } = useAdminActivityMutations()

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
    setCurrentClub(clubRows[i])
    setOpen(true)
  }
  const applyKeyword = (v: string) => {
    setQuery(v.trim())
    resetPage()
  }

  return (
    <div>
      <PageHeader
        title="所有活動"
        sub={
          <>
            共 <span className="num">{countText(total, listQuery)}</span> 件
          </>
        }
        extra={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Checkbox
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked)
                resetPage()
              }}
            >
              逾期未結案
            </Checkbox>
            <Input.Search
              allowClear
              placeholder="搜尋活動名稱"
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value)
                // 清空即還原:清除鈕不一定觸發 onSearch,不接這條就會卡在上一個關鍵字
                if (!e.target.value) applyKeyword('')
              }}
              onSearch={applyKeyword}
            />
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
        {/* 表格區吃掉剩餘高度;直向不捲(列數就是照這塊高度算的),橫向留給窄視窗 */}
        <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        {/* 沿用上一份時整表淡化,避免看起來像是新條件的結果 */}
        <LoadingBlock pending={listQuery.isPending} rows={8}>
          <table
            className="tb dense fixed"
            aria-label="所有活動"
            aria-busy={listQuery.isPlaceholderData}
            style={{ minWidth: 1080, opacity: listQuery.isPlaceholderData ? 0.55 : 1 }}
          >
            <Cols widths={[96, 110, 132, 'auto', 190, 130, 130, 32]} />
            <thead>
              <tr>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {sortHeader('狀態', 'status')}
                    <FilterButton
                      options={LISTED_STATUS_LABELS}
                      selected={statusFilter}
                      onChange={(next) => { setStatusFilter(next); resetPage() }}
                      label="篩選狀態"
                    />
                  </span>
                </th>
                <th scope="col">{sortHeader('活動日期', 'date')}</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {sortHeader('社團', 'club')}
                    {/* 159 個社團平鋪讀不完:漏斗改二級選單,資料夾與 ClubCascader 同一份 */}
                    <FilterButton
                      options={clubFolders}
                      selected={clubFilter}
                      onChange={(next) => { setClubFilter(next); resetPage() }}
                      label="篩選社團"
                    />
                  </span>
                </th>
                <th scope="col">{sortHeader('活動名稱', 'name')}</th>
                <th scope="col" className="r num">
                  <MoneyPair left="自籌" right="核定" />
                </th>
                <th scope="col">{sortHeader('申請時間', 'created_at')}</th>
                <th scope="col">{sortHeader('審核時間', 'reviewed_at')}</th>
                <th scope="col" aria-label="開啟" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr
                  key={a.id}
                  onClick={() => openRow(i)}
                  style={{ cursor: 'pointer', ...(current?.id === a.id && open ? { background: 'var(--seal-tint)' } : {}) }}
                >
                  <td><StatusPill status={a.status} /></td>
                  <td className="num">{a.date}</td>
                  <td className="cell-clip" title={a.club}>{a.club}</td>
                  <td className="cell-clip" title={a.name} style={{ fontWeight: 500 }}>
                    {/* 鍵盤入口:與整列 onClick 同動作;stopPropagation 避免雙觸發 */}
                    <button
                      type="button"
                      className="row-open-btn"
                      aria-label={`開啟「${a.name || '未命名活動'}」詳細資訊`}
                      onClick={(e) => {
                        e.stopPropagation()
                        openRow(i)
                      }}
                    >
                      {a.name || '(未命名)'}
                    </button>
                    {/* 類型欄拿掉了,大型徽章跟著活動名稱走(評鑑 ×3 加權看得出來) */}
                    <LargeBadge applied={a.isLarge} approved={a.largeApproved} />
                  </td>
                  {/* 核定為 null=承辦還沒核,不是核了 0 元 */}
                  <td className="r num">
                    <MoneyPair
                      left={fmtMoney(a.selfFundTotal)}
                      right={approvedText(a.approvedTotal, fmtMoney)}
                    />
                  </td>
                  <td className="num">{a.submittedAt}</td>
                  <td className="num">{a.reviewedAt ?? '—'}</td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {/* 兩種失敗都要有出口:列表失敗時 rows 是空陣列,不說出來就會顯示成「無符合條件」;
                  社團選項失敗則讓漏斗靜靜地空著 */}
              {(listQuery.isError || clubsQuery.isError) && (
                <tr className="no-hover">
                  <td colSpan={8}>
                    <QueryError
                      compact
                      title={listQuery.isError ? '活動列表載入失敗' : '篩選選項載入失敗'}
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
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 28 }}>
                    {/* 沒下條件時說「無符合條件」是在指責使用者的操作:新學期本來就一筆都沒有 */}
                    {clubFilter.length || statusFilter.length || overdueOnly || query
                      ? '無符合條件的活動'
                      : semester
                        ? '本學期尚無活動'
                        : '尚無活動'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>

      {/* 結案相關狀態開完整唯讀檢視(結案成果、照片、心得);其餘開審核彈窗 ——
          待本關者可就地簽核,非本關自動唯讀。兩者常駐待退場動畫結束才卸載 */}
      {current && !closeStage && (
        <ActivityReviewModal
          key={current.id}
          item={reviewDetail.data ?? current}
          detailError={reviewDetail.error}
          onRetryDetail={() => void reviewDetail.refetch()}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => {
            setCurrent(null)
            setCurrentClub(null)
          }}
          onApprove={(p) =>
            approve.mutateAsync({
              id: current.activityId,
              // 僅第一關送核定內容;組長/學務長關空 body 過關(後端規則)
              fundSource: current.status === 'pending_advisor' ? p.fundSource : undefined,
              budget: current.status === 'pending_advisor' ? p.budget : [],
              isLargeApproved:
                current.status === 'pending_advisor' && current.type === '活動' ? p.largeApproved : undefined,
            })
          }
          onReject={(reason) => reject.mutateAsync({ id: current.activityId, reason })}
        />
      )}
      {closeStage && (
        <ActivityPreviewModal
          key={current.id}
          a={fullDetail.data ?? currentClub}
          detail={fullDetail.data}
          loading={fullDetail.isPending}
          error={fullDetail.error}
          onRetry={() => void fullDetail.refetch()}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => {
            setCurrent(null)
            setCurrentClub(null)
          }}
          onPreviewFile={filePreview.preview}
          pdfBase="admin"
        />
      )}
      {filePreview.node}
    </div>
  )
}
