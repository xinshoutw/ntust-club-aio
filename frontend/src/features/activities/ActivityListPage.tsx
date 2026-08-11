import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Dropdown, Modal, Popconfirm, Select, Spin, Tooltip } from 'antd'
import { DownloadOutlined, EllipsisOutlined, FileTextOutlined, LinkOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import StatusPill from '../../components/ui/StatusPill'
import LargeBadge from '../../components/ui/LargeBadge'
import { STATUS } from '../../lib/status'
import { semesterOptions } from '../../lib/semester'
import { downloadEvalFile, downloadPhotosZip } from '../eval/files'
import type { EvalFile } from '../eval/types'
import FilePreview from '../eval/FilePreview'
import {
  ACTIVITY_PAGE_SIZE,
  activityReflectionsPdf,
  activityReportPdf,
  useActivityDetail,
  useActivityList,
  useActivityMutations,
  useDraftActivities,
  useActivitySemesters,
  type ClubActivity,
  type ClubActivityDetail,
} from '../../api/activities'
import { fmtMoney } from './types'
import { TIME_RANGE_SEP, dateRangeText } from './utils'

// 排序鍵=後端 /club/activities 白名單(budget=自籌+擬請補助合計;同值的 id 降冪
// tiebreak 由後端固定,前端不必也不能送 id)
type SortKey = 'name' | 'type' | 'date' | 'budget' | 'status'

// 狀態漏斗以顯示標籤操作:三個申請關卡共用「申請待審核」,選一個標籤要送出對應的全部狀態
const LISTED_STATUSES = [
  'pending_advisor',
  'pending_chief',
  'pending_dean',
  'approved',
  'rejected',
  'closing_pending_advisor',
  'closed',
] as const
const STATUS_LABELS = [...new Set(LISTED_STATUSES.map((s) => STATUS[s].label))]

function money(a: ClubActivity): string {
  if (a.selfFundTotal === 0 && a.requestedTotal === 0) return '–'
  return `${fmtMoney(a.selfFundTotal)} / ${fmtMoney(a.requestedTotal)}`
}

// 檔名可點預覽,右側附下載鈕
function FileChip({ f, onPreview }: { f: EvalFile; onPreview: (f: EvalFile) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px' }}>
      <FileTextOutlined style={{ color: 'var(--steel)' }} />
      <button type="button" className="link-btn" style={{ padding: 0, fontSize: 12 }} onClick={() => onPreview(f)}>
        {f.name}
      </button>
      <button type="button" className="link-btn" aria-label={`下載 ${f.name}`} style={{ padding: '0 2px' }} onClick={() => downloadEvalFile(f)}>
        <DownloadOutlined style={{ fontSize: 12, color: 'var(--steel)' }} />
      </button>
    </span>
  )
}

// 詳情彈窗的分區標題
function SectionTitle({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, margin: first ? '0 0 10px' : '22px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
      {children}
    </div>
  )
}

// 與申請不一致的實際值:直接取代申請值並以色彩標示,hover 顯示預計值
function ActualValue({ actual, planned }: { actual: React.ReactNode; planned: string }) {
  return (
    <Tooltip mouseEnterDelay={0} title={<span style={{ fontSize: 14 }}>預計 {planned}</span>}>
      <span className="num" style={{ color: '#8A5A00', borderBottom: '1px dotted #8A5A00', cursor: 'help' }}>{actual}</span>
    </Tooltip>
  )
}

function PreviewModal({ a, detail, loading, error, onRetry, open, onClose, afterClose, onEdit, onGoClose, onPreviewFile }: {
  a: ClubActivity | null
  detail: ClubActivityDetail | undefined
  loading: boolean
  error?: unknown
  onRetry?: () => void
  open: boolean
  onClose: () => void
  afterClose: () => void
  onEdit: () => void
  onGoClose: () => void
  onPreviewFile: (f: EvalFile) => void
}) {
  const { message } = App.useApp()
  if (!a) return null
  const editable = a.status === 'draft' || a.status === 'rejected'
  const rep = a.status === 'closed' || a.status === 'closing_pending_advisor' ? detail?.report : undefined
  const photos = detail?.photos ?? []
  const attachments = detail?.attachments ?? []
  const budget = detail?.budget ?? []

  // 與申請值比對:相同就不顯示實際值;比較前正規化分隔符
  const normTime = (tr: string) => tr.split(TIME_RANGE_SEP).map((s) => s.trim()).join('–')
  const actualTime = rep ? `${rep.actualStart}–${rep.actualEnd}` : ''
  const timeChanged = !!rep && normTime(actualTime) !== normTime(a.timeRange ?? '')
  const locationChanged = !!rep && rep.actualLocation !== a.location
  const plannedCountsText = `社員 ${a.participantsIn} · 非社員 ${a.participantsOut}`
  const countChanged = !!rep && (rep.memberCount !== a.participantsIn || rep.nonMemberCount !== a.participantsOut)

  const downloadItems = [
    { key: 'photos', label: '下載照片檔', disabled: photos.length === 0 },
    { key: 'feedback', label: '下載學習心得檔案', disabled: !rep },
    { key: 'report', label: '下載活動成果報告', disabled: !rep },
  ]
  const onDownload = ({ key }: { key: string }) => {
    // 照片打包成 zip(僅 archive);成果報告與心得的 PDF 由後端依 docs/模板_*.docx
    // 於下載時動態生成,版面不可自由設計
    if (key === 'photos') {
      downloadPhotosZip(`${a.name}_照片`, photos).catch((e: unknown) =>
        message.error(e instanceof Error ? e.message : '照片下載失敗'),
      )
    }
    if (key === 'feedback' && rep) downloadEvalFile(activityReflectionsPdf(a, rep.submittedAt))
    if (key === 'report' && rep) downloadEvalFile(activityReportPdf(a, rep.submittedAt))
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={rep ? 1080 : 840}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          {a.name} <StatusPill status={a.status} />
          <span style={{ flex: 1 }} />
          <Dropdown trigger={['click']} menu={{ items: downloadItems, onClick: onDownload }}>
            <button
              type="button"
              className="link-btn"
              aria-label="下載選單"
              style={{ padding: 0, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <EllipsisOutlined style={{ fontSize: 18, color: 'var(--steel)' }} />
            </button>
          </Dropdown>
        </div>
      }
      footer={
        editable ? (
          <Button type="primary" onClick={onEdit}>
            {a.status === 'rejected' ? '編輯重送' : '繼續編輯'}
          </Button>
        ) : a.canClose ? (
          <Button type="primary" onClick={onGoClose}>前往結案</Button>
        ) : null
      }
    >
      <Spin spinning={loading}>
      {/* 詳情載入失敗:整塊改為錯誤呈現,避免結案資料/附件被誤看成不存在 */}
      {error != null ? (
        <div style={{ marginTop: 10 }}>
          <QueryError compact title="活動詳情載入失敗" error={error} onRetry={onRetry} />
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: rep ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap: 32, marginTop: 10, alignItems: 'start' }}>
        {/* 左欄:申請資料、經費、檔案 */}
        <div>
          <SectionTitle first>基本資料</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13 }}>
            <div style={{ color: 'var(--steel)' }}>類型</div><div>{a.type}</div>
            <div style={{ color: 'var(--steel)' }}>日期</div>
            <div>
              <span className="num">{dateRangeText(a)}</span>{' '}
              {timeChanged && rep ? (
                <ActualValue actual={actualTime} planned={a.timeRange ?? '未填'} />
              ) : (
                a.timeRange && <span className="num">{a.timeRange}</span>
              )}
            </div>
            <div style={{ color: 'var(--steel)' }}>地點</div>
            <div>
              {locationChanged && rep ? (
                <ActualValue actual={rep.actualLocation} planned={a.location || '未填'} />
              ) : (
                a.location || '—'
              )}
            </div>
            <div style={{ color: 'var(--steel)' }}>人數</div>
            <div>
              {countChanged && rep ? (
                <ActualValue actual={`社員 ${rep.memberCount} · 非社員 ${rep.nonMemberCount}`} planned={plannedCountsText} />
              ) : (
                <span className="num">{plannedCountsText}</span>
              )}
            </div>
            {a.content && (<><div style={{ color: 'var(--steel)' }}>內容</div><div style={{ lineHeight: 1.7 }}>{a.content}</div></>)}
            {a.works.length > 0 && (
              <>
                <div style={{ color: 'var(--steel)' }}>工作分配</div>
                <div style={{ lineHeight: 1.7 }}>{a.works.map((w) => [w.task, w.owner].filter(Boolean).join(':')).join('、')}</div>
              </>
            )}
            {attachments.length > 0 && (
              <>
                <div style={{ color: 'var(--steel)' }}>附件</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {attachments.map((f) => (
                    <FileChip key={f.id} f={f} onPreview={onPreviewFile} />
                  ))}
                </div>
              </>
            )}
          </div>

          <SectionTitle>
            經費
            <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>
              {money(a) === '–' ? '無申請經費' : <>自籌 <span className="num">{fmtMoney(a.selfFundTotal)}</span> · 擬請 <span className="num">{fmtMoney(a.requestedTotal)}</span></>}
              {rep && <> · 實際支出 <span className="num">{fmtMoney(rep.expense)}</span></>}
            </span>
          </SectionTitle>
          {budget.map((b) => (
            <div key={b.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 110, color: 'var(--steel)' }}>{b.category}</span>
              <span style={{ flex: 1 }}>{b.description}</span>
              <span className="num">{b.selfFund.toLocaleString()} / {b.requestedSubsidy.toLocaleString()}</span>
            </div>
          ))}

          {detail?.rejectReason && (
            <div style={{ background: 'var(--paper)', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, marginTop: 16 }}>
              <span style={{ fontWeight: 500, color: '#B03A2E' }}>退回原因</span>
              <span style={{ color: 'var(--steel)' }}> — {detail.rejectReason.by} · <span className="num">{detail.rejectReason.date}</span>:</span>
              {detail.rejectReason.text}
            </div>
          )}

          {rep && photos.length > 0 && (
            <>
              <SectionTitle>活動照片(<span className="num">{photos.length}</span> 張)</SectionTitle>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((p) => (
                  <button key={p.id} type="button" className="link-btn" style={{ padding: 0 }} aria-label={`預覽 ${p.name}`} onClick={() => onPreviewFile(p)}>
                    <img src={p.url} alt={p.name} title={p.name} style={{ width: 104, height: 78, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {rep && (
            <>
              <SectionTitle>結案檔案</SectionTitle>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <FileChip f={activityReportPdf(a, rep.submittedAt)} onPreview={onPreviewFile} />
                <FileChip f={activityReflectionsPdf(a, rep.submittedAt)} onPreview={onPreviewFile} />
                {rep.videoLink && (
                  <span style={{ fontSize: 13 }}>
                    <LinkOutlined style={{ color: 'var(--steel)', marginRight: 6 }} />
                    <a href={rep.videoLink} target="_blank" rel="noopener noreferrer">{rep.videoLink}</a>
                  </span>
                )}
              </div>
            </>
          )}

          {a.status === 'locked' && (
            <div style={{ fontSize: 13, color: '#A3341F', marginTop: 16 }}>
              已逾結案期限並鎖定,請洽學務處申請解鎖
            </div>
          )}
        </div>

        {/* 右欄:結案成果全文 */}
        {rep && (
          <div>
            <SectionTitle first>
              結案成果
              {rep.submittedAt && (
                <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>
                  送出 <span className="num">{rep.submittedAt}</span>
                </span>
              )}
            </SectionTitle>
            {([['活動重點', rep.highlights], ['達成目標', rep.goals], ['其他成果', rep.others]] as const).map(([lab, text]) => (
              <div key={lab} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 3 }}>{lab}</div>
                <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{text}</div>
              </div>
            ))}
            {rep.reviewMeeting && (
              <>
                <SectionTitle>
                  檢討會議
                  <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>
                    <span className="num">{rep.reviewDate ?? '—'}</span>
                    {rep.reviewAttendees != null && <> · 與會 <span className="num">{rep.reviewAttendees}</span> 人</>}
                  </span>
                </SectionTitle>
                {([['討論事項', rep.reviewTopics], ['內容決議', rep.reviewConclusion]] as const).map(([lab, text]) =>
                  text ? (
                    <div key={lab} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 3 }}>{lab}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{text}</div>
                    </div>
                  ) : null,
                )}
              </>
            )}
            <SectionTitle>學習心得(<span className="num">{rep.reflections.length}</span> 人)</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rep.reflections.map((x) => (
                <div key={`${x.name}-${x.dept}`} style={{ background: 'var(--paper)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {x.name} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--steel)' }}>{x.dept}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 4, whiteSpace: 'pre-wrap' }}>{x.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
      </Spin>
    </Modal>
  )
}

export default function ActivityListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [semesterSel, setSemesterSel] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const { entries, toggle } = useMultiSort<SortKey>([{ key: 'date', dir: -1 }])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  // 以顯示標籤篩選:三個申請關卡共用「申請待審核」,避免選單出現重複項
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [preview, setPreview] = useState<ClubActivity | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [filePreview, setFilePreview] = useState<EvalFile | null>(null)
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)

  // 學期下拉:資料既有學期 + 當前學期,預設最新
  const semestersQuery = useActivitySemesters()
  const semOptions = semesterOptions(semestersQuery.data ?? [])
  const semester = semesterSel ?? semOptions[0].value

  // 草稿不分學期,獨立區置頂(量少、排序特殊,整批抓回自排);
  // 主列表的學期/類型/狀態篩選、排序與分頁一律由後端處理
  const draftsQuery = useDraftActivities()
  // 未選狀態時也要明列狀態:不帶 status 的話後端連草稿都會回,而草稿在上方獨立區
  const statuses = statusFilter.length
    ? LISTED_STATUSES.filter((s) => statusFilter.includes(STATUS[s].label))
    : [...LISTED_STATUSES]
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
      <td className="cell-clip" style={{ fontWeight: 500 }} title={a.name || undefined}>
        {/* 鍵盤入口:與整列 onClick 同動作;stopPropagation 避免雙觸發 */}
        <button
          type="button"
          className="row-open-btn"
          aria-label={`開啟「${a.name || '未命名活動'}」詳情`}
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
      <td className="num" style={{ fontSize: 13 }}>{dateRangeText(a)}</td>
      <td className="r num" style={{ fontSize: 13 }}>{money(a)}</td>
      <td><StatusPill status={a.status} /></td>
      <td className="r" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>{actions}</td>
    </tr>
  )

  return (
    <div>
      <PageHeader
        title="活動列表"
        sub={
          <>
            共 <span className="num">{total}</span> 件
          </>
        }
        extra={
          <Select
            value={semester}
            onChange={(v) => {
              setSemesterSel(v)
              setPage(1)
            }}
            style={{ width: 110 }}
            options={semOptions}
          />
        }
      />

      <Spin spinning={draftsQuery.isPending || listQuery.isPending}>
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
            <table className="tb fixed" style={{ minWidth: 820 }} aria-label="草稿活動">
              <Cols widths={['auto', 120, 180, 160, 110, 140]} />
              <thead>
                <tr>
                  <th scope="col">名稱</th>
                  <th scope="col">類型</th>
                  <th scope="col">日期</th>
                  <th scope="col" className="r">經費(自籌/擬請)</th>
                  <th scope="col">狀態</th>
                  <th scope="col" className="r">動作</th>
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
          <table className="tb fixed" style={{ minWidth: 820 }} aria-label="活動列表">
            <Cols widths={['auto', 120, 180, 160, 110, 120]} />
            <thead>
              <tr>
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
                <th scope="col" className="r">{sortHeader('經費(自籌/擬請)', 'budget')}</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {sortHeader('狀態', 'status')}
                    <FilterButton
                      options={STATUS_LABELS}
                      selected={statusFilter}
                      onChange={(next) => { setStatusFilter(next); setPage(1) }}
                      label="篩選狀態"
                    />
                  </span>
                </th>
                <th scope="col" className="r">動作</th>
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
              {paged.length === 0 && !listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 28 }}>
                    本學期尚無活動
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
      <Pager page={page} pageSize={ACTIVITY_PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />
      <PreviewModal
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
        onPreviewFile={(f) => {
          setFilePreview(f)
          setFilePreviewOpen(true)
        }}
      />
      <FilePreview
        file={filePreview}
        open={filePreviewOpen}
        onClose={() => setFilePreviewOpen(false)}
        afterClose={() => setFilePreview(null)}
      />
    </div>
  )
}
