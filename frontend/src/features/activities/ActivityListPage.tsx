import { useEffect, useMemo, useState } from 'react'
import { countText } from '../../lib/counts'
import { useNavigate, useSearchParams } from 'react-router'
import { App, Button, Popconfirm, Select, Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import OptionsError from '../../components/ui/OptionsError'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import StatusPill from '../../components/ui/StatusPill'
import MoneyPair from '../../components/ui/MoneyPair'
import LargeBadge from '../../components/ui/LargeBadge'
import { semesterOptions } from '../../lib/semester'
import { useFilePreview } from '../eval/useFilePreview'
import {
  ACTIVITY_PAGE_SIZE,
  useActivityDetail,
  useActivityList,
  useActivityMutations,
  useDraftActivities,
  useActivitySemesters,
  type ClubActivity,
} from '../../api/activities'
import { LISTED_STATUS_LABELS, approvedText, fmtMoney, statusesForLabels } from './types'
import ActivityPreviewModal from './ActivityPreviewModal'
import { dateRangeText } from './utils'

// 排序鍵=後端 /club/activities 白名單(同值的 id 降冪 tiebreak 由後端固定,
// 前端不必也不能送 id)。白名單裡的 budget 是「自籌+擬請」合計,與經費欄顯示的
// 「自籌 / 核定」不是同一件事,故不接出去
type SortKey = 'name' | 'type' | 'date' | 'status'

export default function ActivityListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  // 總覽的活動列連到 ?semester=&open=:總覽的活動多半不在預設(最新)學期,
  // 不把學期一起帶過來的話落地就是一片空白
  const [searchParams, setSearchParams] = useSearchParams()
  const openParam = Number(searchParams.get('open')) || null
  const [semesterSel, setSemesterSel] = useState<string | null>(() => {
    const v = searchParams.get('semester')
    return v && /^\d{3}-[12]$/.test(v) ? v : null // 不合法就當沒帶:後端同一條 pattern,亂帶會 422
  })
  const [page, setPage] = useState(1)
  const { entries, toggle } = useMultiSort<SortKey>([{ key: 'date', dir: -1 }])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  // 以顯示標籤篩選:三個申請關卡共用「申請待審核」,避免選單出現重複項
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [preview, setPreview] = useState<ClubActivity | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const filePreview = useFilePreview()

  // 學期下拉:資料既有學期 + 當前學期,預設最新
  const semestersQuery = useActivitySemesters()
  const semOptions = semesterOptions(semestersQuery.data ?? [])
  const semester = semesterSel ?? semOptions[0].value
  // 使用者換學期時網址跟著走,否則重新整理會跳回連結帶來的那個學期
  const pickSemester = (v: string) => {
    setSemesterSel(v)
    setPage(1)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('semester', v)
      return next
    }, { replace: true })
  }

  // 草稿不分學期,獨立區置頂(量少、排序特殊,整批抓回自排);
  // 主列表的學期/類型/狀態篩選、排序與分頁一律由後端處理
  const draftsQuery = useDraftActivities()
  // 未選狀態時也要明列狀態:不帶 status 的話後端連草稿都會回,而草稿在上方獨立區。
  // 標籤對不到任何狀態時同樣退回全部(空陣列會被 qs 略過,等於靜默不篩)
  const statuses = statusesForLabels(statusFilter)
  const listQuery = useActivityList({
    semester,
    statuses,
    types: typeFilter.length ? typeFilter : undefined,
    sort: sortParam(entries),
    page,
    pageSize: ACTIVITY_PAGE_SIZE,
  })
  // 草稿預設序:未填日期在前(最需要補的草稿),再日期新到舊(plan §B:準則 3+待補優先)
  const drafts = useMemo(
    () =>
      [...(draftsQuery.data ?? [])].sort((a, b) => {
        if (!a.date !== !b.date) return a.date ? 1 : -1
        if (a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '')
        return b.id - a.id
      }),
    [draftsQuery.data],
  )
  const detailQuery = useActivityDetail(preview?.id)
  // 深連結:詳情本身就是完整的 ClubActivity,不必等它出現在當頁列表
  // (它可能落在第 3 頁,或被目前的狀態/類型篩選擋掉)
  const linkedQuery = useActivityDetail(openParam ?? undefined)
  const linked = linkedQuery.data
  const linkedFailed = linkedQuery.isError
  useEffect(() => {
    if (!linked && !linkedFailed) return
    if (linked) {
      setPreview(linked)
      setPreviewOpen(true)
    } else {
      // 別社的活動或已刪除:靜默不動的話網址卡著 open、畫面像什麼都沒發生
      message.error('找不到這個活動，可能已被刪除')
    }
    // 用掉(或確定用不了)就從網址移除:重新整理或返回時不該又試一次
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('open')
      return next
    }, { replace: true })
  }, [linked, linkedFailed, message, setSearchParams])
  const { submit, remove } = useActivityMutations()

  const paged = listQuery.data?.rows ?? []
  const total = listQuery.data?.total ?? 0
  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }

  const sortHeader = (label: string, key: SortKey) => (
    <MultiSortButton label={label} sortKey={key} entries={entries} onToggle={toggleSort} />
  )


  // 點列一律開活動詳情預覽;結案走列上的動作鈕(或預覽內「前往結案」)
  const onRowClick = (a: ClubActivity) => {
    setPreview(a)
    setPreviewOpen(true)
  }

  const row = (a: ClubActivity, actions: React.ReactNode) => (
    <tr key={a.id} onClick={() => onRowClick(a)} style={{ cursor: 'pointer' }}>
      <td><StatusPill status={a.status} /></td>
      <td className="cell-clip" style={{ fontWeight: 500 }} title={a.name || undefined}>
        {/* 鍵盤入口:與整列 onClick 同動作;stopPropagation 避免雙觸發 */}
        <button
          type="button"
          className="row-open-btn"
          aria-label={`開啟「${a.name || '未命名活動'}」詳細資訊`}
          onClick={(e) => {
            e.stopPropagation()
            onRowClick(a)
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
      <td
        className="r"
        style={{ whiteSpace: 'nowrap', paddingLeft: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {actions}
      </td>
    </tr>
  )

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
            {/* semesterOptions 一定補上當學期,查詢掛掉時只是歷史學期全不見(見 MembersPage 同型) */}
            {semestersQuery.isError && (
              <OptionsError
                what="學期清單"
                error={semestersQuery.error}
                onRetry={() => void semestersQuery.refetch()}
              />
            )}
            <Select
              value={semester}
              onChange={pickSemester}
              style={{ width: 110 }}
              options={semOptions}
            />
          </div>
        }
      />

      {/* 草稿卡是條件渲染又排在主列表上方:兩支分開等會讓草稿卡晚一步插進來、把列表整個推下去,
          所以主列表的 Skeleton 連 draftsQuery 一起等(草稿本身沒有要撐住的版面,不另鋪 Skeleton) */}
      {draftsQuery.isError && (
          <div style={{ marginTop: 20 }}>
            <QueryError title="草稿載入失敗" error={draftsQuery.error} onRetry={() => void draftsQuery.refetch()} />
          </div>
        )}
        {drafts.length > 0 && (
          <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, padding: '14px 20px 6px' }}>
              草稿 <span className="num" style={{ fontSize: 12, background: '#EEF0F3', color: 'var(--steel)', borderRadius: 999, padding: '1px 8px' }}>{drafts.length}</span>
            </div>
            <table className="tb fixed" style={{ minWidth: 830 }} aria-label="草稿活動">
              <Cols widths={[110, 'auto', 120, 190, 190, 124]} />
              <thead>
                <tr>
                  <th scope="col">狀態</th>
                  <th scope="col">名稱</th>
                  <th scope="col">類型</th>
                  <th scope="col">日期</th>
                  <th scope="col" className="r num">
                    <MoneyPair left="自籌" right="核定" />
                  </th>
                  <th scope="col" className="r" style={{ paddingLeft: 0 }}>動作</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((a) =>
                  row(
                    a,
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <Button
                        size="small"
                        type="primary"
                        loading={submit.isPending && submit.variables === a.id}
                        onClick={() =>
                          submit.mutate(a.id, {
                            onSuccess: () => message.success('已送出申請'),
                            onError: (e) => message.error(e.message),
                          })
                        }
                      >
                        送出
                      </Button>
                      <Popconfirm
                        title={`刪除草稿「${a.name}」?`}
                        okText="刪除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() =>
                          remove.mutate(a.id, {
                            onSuccess: () => message.success('已刪除草稿'),
                            onError: (e) => message.error(e.message),
                          })
                        }
                      >
                        <Button size="small" danger>刪除</Button>
                      </Popconfirm>
                    </span>,
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        {/* 沿用上一份時整表淡化(見下方 opacity),避免看起來像是新條件的結果 */}
        <LoadingBlock pending={draftsQuery.isPending || listQuery.isPending} rows={8}>
          <table
            className="tb fixed"
            aria-label="活動列表"
            aria-busy={listQuery.isPlaceholderData}
            style={{ minWidth: 830, opacity: listQuery.isPlaceholderData ? 0.55 : 1 }}
          >
            <Cols widths={[110, 'auto', 120, 190, 190, 104]} />
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
                      options={['社課或會議', '活動']}
                      selected={typeFilter}
                      onChange={(next) => { setTypeFilter(next); setPage(1) }}
                      label="篩選類型"
                    />
                  </span>
                </th>
                <th scope="col">{sortHeader('日期', 'date')}</th>
                {/* 排序鍵 budget 是「自籌+擬請」合計,與顯示的「自籌 / 核定」不是同一件事 ——
                    該欄因此不給排序,不做名實不符的指示器(同 /admin/activities) */}
                <th scope="col" className="r num">
                  <MoneyPair left="自籌" right="核定" />
                </th>
                <th scope="col" className="r" style={{ paddingLeft: 0 }}>動作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((a) =>
                row(
                  a,
                  a.canClose ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {a.hasCloseDraft && (
                        <Tooltip title="已暫存結案草稿">
                          <span style={{ fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>草稿</span>
                        </Tooltip>
                      )}
                      <Button size="small" type="primary" onClick={() => navigate(`/activities/close?id=${a.id}`)}>結案</Button>
                    </span>
                  ) : a.status === 'approved' ? (
                    <Tooltip title="活動結束後才可結案">
                      <span style={{ fontSize: 12, color: 'var(--steel)' }}>未開始/進行中</span>
                    </Tooltip>
                  ) : null,
                ),
              )}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError compact title="活動列表載入失敗" error={listQuery.error} onRetry={() => void listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {/* 抓取中不顯示空狀態:沿用上一份時 paged 不會是空的,但首次載入會 */}
              {paged.length === 0 && !listQuery.isFetching && !listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 28 }}>
                    本學期尚無活動
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
        </div>
      <Pager page={page} pageSize={ACTIVITY_PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />
      <ActivityPreviewModal
        a={preview}
        detail={detailQuery.data}
        loading={preview != null && detailQuery.isPending}
        error={detailQuery.error}
        onRetry={() => void detailQuery.refetch()}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        afterClose={() => setPreview(null)}
        onEdit={() => {
          setPreviewOpen(false)
          if (preview) navigate(`/activities/${preview.id}/edit`)
        }}
        onGoClose={() => {
          setPreviewOpen(false)
          if (preview) navigate(`/activities/close?id=${preview.id}`)
        }}
        onPreviewFile={filePreview.preview}
      />
      {filePreview.node}
    </div>
  )
}
