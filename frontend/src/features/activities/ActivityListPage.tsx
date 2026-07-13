import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Dropdown, Modal, Pagination, Select, Tooltip } from 'antd'
import { DownloadOutlined, FileTextOutlined, FilterOutlined, LinkOutlined, MoreOutlined, SwapOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { STATUS, type StatusKey } from '../../lib/status'
import { semesterOf, semesterOptions } from '../../lib/semester'
import { resultOf } from '../eval/store'
import { downloadEvalFile } from '../eval/files'
import type { EvalFile } from '../eval/types'
import FilePreview from '../eval/FilePreview'
import { CLUB_ACTIVITIES } from './mock'
import { budgetTotals, fmtMoney, type Activity } from './types'

const PAGE_SIZE = 20
type SortKey = 'name' | 'type' | 'date' | 'budget' | 'status'

function money(a: Activity): string {
  const t = budgetTotals(a.budget)
  if (t.self === 0 && t.requested === 0) return '–'
  return `${fmtMoney(t.self)} / ${fmtMoney(t.requested)}`
}

function sortValue(a: Activity, key: SortKey): string | number {
  if (key === 'budget') {
    const t = budgetTotals(a.budget)
    return t.self + t.requested
  }
  if (key === 'status') return STATUS[a.status].label
  return a[key] ?? ''
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

function PreviewModal({ a, open, onClose, afterClose, onEdit, onGoClose, onPreviewFile }: { a: Activity | null; open: boolean; onClose: () => void; afterClose: () => void; onEdit: () => void; onGoClose: () => void; onPreviewFile: (f: EvalFile) => void }) {
  if (!a) return null
  const t = budgetTotals(a.budget)
  const editable = a.status === 'draft' || a.status === 'rejected'
  const r = resultOf(a.id)
  const downloadItems = [
    { key: 'photos', label: '下載照片檔', disabled: r.photos.length === 0 },
    { key: 'feedback', label: '下載學習心得檔案', disabled: !r.feedback },
    { key: 'report', label: '下載活動成果報告', disabled: !r.report },
  ]
  const onDownload = ({ key }: { key: string }) => {
    if (key === 'photos') r.photos.forEach(downloadEvalFile)
    if (key === 'feedback' && r.feedback) downloadEvalFile(r.feedback)
    if (key === 'report' && r.report) downloadEvalFile(r.report)
  }
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 30 }}>
          {a.name} <StatusPill status={a.status} />
          <span style={{ flex: 1 }} />
          <Dropdown trigger={['click']} menu={{ items: downloadItems, onClick: onDownload }}>
            <button type="button" className="link-btn" aria-label="下載選單" style={{ padding: '0 4px' }}>
              <MoreOutlined style={{ fontSize: 18, color: 'var(--steel)' }} />
            </button>
          </Dropdown>
        </div>
      }
      footer={
        editable ? (
          <Button type="primary" onClick={onEdit}>
            {a.status === 'rejected' ? '編輯重送' : '繼續編輯'}
          </Button>
        ) : a.status === 'approved' ? (
          <Button type="primary" onClick={onGoClose}>前往結案</Button>
        ) : null
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '8px 12px', fontSize: 13, marginTop: 8 }}>
        <div style={{ color: 'var(--steel)' }}>類型</div><div>{a.type}</div>
        <div style={{ color: 'var(--steel)' }}>日期</div><div className="num">{a.date}{a.timeRange ? ` ${a.timeRange}` : ''}</div>
        {a.location && (<><div style={{ color: 'var(--steel)' }}>地點</div><div>{a.location}</div></>)}
        {(a.participantsIn != null || a.participantsOut != null) && (
          <>
            <div style={{ color: 'var(--steel)' }}>人數</div>
            <div className="num">校內 {a.participantsIn ?? 0} · 校外 {a.participantsOut ?? 0}</div>
          </>
        )}
        {a.content && (<><div style={{ color: 'var(--steel)' }}>內容</div><div style={{ lineHeight: 1.6 }}>{a.content}</div></>)}
        {a.works && a.works.length > 0 && (
          <>
            <div style={{ color: 'var(--steel)' }}>工作分配</div>
            <div>{a.works.map((w) => [w.task, w.owner].filter(Boolean).join(':')).join('、')}</div>
          </>
        )}
        <div style={{ color: 'var(--steel)' }}>經費</div>
        <div className="num">{money(a) === '–' ? '無申請經費' : `自籌 ${fmtMoney(t.self)} · 擬請 ${fmtMoney(t.requested)}`}</div>
        {a.attachments && a.attachments.length > 0 && (
          <>
            <div style={{ color: 'var(--steel)' }}>附件</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {a.attachments.map((f) => (
                <FileChip key={f.id} f={f} onPreview={onPreviewFile} />
              ))}
            </div>
          </>
        )}
      </div>

      {a.budget.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>經費明細</div>
          {a.budget.map((b) => (
            <div key={b.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 110, color: 'var(--steel)' }}>{b.category}</span>
              <span style={{ flex: 1 }}>{b.description}</span>
              <span className="num">{b.selfFund.toLocaleString()} / {b.requestedSubsidy.toLocaleString()}</span>
            </div>
          ))}
        </>
      )}

      {a.rejectReason && (
        <div style={{ background: 'var(--paper)', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, marginTop: 14 }}>
          <span style={{ fontWeight: 500, color: '#B03A2E' }}>退回原因</span>
          <span style={{ color: 'var(--steel)' }}> — {a.rejectReason.by} · <span className="num">{a.rejectReason.date}</span>:</span>
          {a.rejectReason.text}
        </div>
      )}

      {(a.status === 'closed' || a.status === 'closing_pending_advisor') && a.report && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>結案成果</div>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <div style={{ color: 'var(--steel)' }}>實際人數</div>
            <div className="num">社員 {a.report.memberCount} · 非社員 {a.report.nonMemberCount}</div>
            <div style={{ color: 'var(--steel)' }}>實際時間</div>
            <div className="num">{a.report.actualStart}–{a.report.actualEnd} · 實際支出 {fmtMoney(a.report.expense)}</div>
            <div style={{ color: 'var(--steel)' }}>實際地點</div><div>{a.report.actualLocation}</div>
            <div style={{ color: 'var(--steel)' }}>活動重點</div><div>{a.report.highlights}</div>
            <div style={{ color: 'var(--steel)' }}>達成目標</div><div>{a.report.goals}</div>
            <div style={{ color: 'var(--steel)' }}>其他成果</div><div>{a.report.others}</div>
            <div style={{ color: 'var(--steel)' }}>檢討會</div>
            <div>
              {a.report.reviewMeeting ? '是' : '否'}
              {a.report.reviewDate ? <span className="num"> · {a.report.reviewDate}</span> : ''}
            </div>
            <div style={{ color: 'var(--steel)' }}>學習心得</div>
            <div>
              <span className="num">{a.report.reflections.length}</span> 人:
              {a.report.reflections.map((x) => `${x.name}(${x.dept})`).join('、')}
            </div>
          </div>
          {r.photos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {r.photos.map((p) => (
                <button key={p.id} type="button" className="link-btn" style={{ padding: 0 }} aria-label={`預覽 ${p.name}`} onClick={() => onPreviewFile(p)}>
                  <img src={p.url} alt={p.name} title={p.name} style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {r.report && <FileChip f={r.report} onPreview={onPreviewFile} />}
            {r.feedback && <FileChip f={r.feedback} onPreview={onPreviewFile} />}
          </div>
          {r.videoLink && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <LinkOutlined style={{ color: 'var(--steel)', marginRight: 6 }} />
              <a href={r.videoLink} target="_blank" rel="noopener noreferrer">{r.videoLink}</a>
            </div>
          )}
        </>
      )}
      {(a.status === 'approved' || a.status === 'locked') && a.closeDeadline && (
        <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 14 }}>
          結案期限 <span className="num">{a.closeDeadline}</span>
          {a.status === 'locked' ? ',已逾期鎖定,請洽課外活動指導組解鎖。' : `,剩 ${a.closeDaysLeft} 天。`}
        </div>
      )}
    </Modal>
  )
}

export default function ActivityListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const semOptions = semesterOptions(CLUB_ACTIVITIES.filter((a) => a.status !== 'draft').map((a) => semesterOf(a.date)))
  const [semester, setSemester] = useState(semOptions[0].value)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusKey[]>([])
  const [preview, setPreview] = useState<Activity | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [filePreview, setFilePreview] = useState<EvalFile | null>(null)
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)

  const act = (label: string, a: Activity) => message.info(`「${label}」尚未接上後端(${a.name})`)

  const drafts = CLUB_ACTIVITIES.filter((a) => a.status === 'draft')
  const rest = useMemo(() => {
    let list = CLUB_ACTIVITIES.filter((a) => a.status !== 'draft' && semesterOf(a.date) === semester)
    if (typeFilter.length) list = list.filter((a) => typeFilter.includes(a.type))
    if (statusFilter.length) list = list.filter((a) => statusFilter.includes(a.status))
    if (sort) {
      list = [...list].sort((x, y) => {
        const a = sortValue(x, sort.key)
        const b = sortValue(y, sort.key)
        return sort.dir * (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'zh-Hant'))
      })
    }
    return list
  }, [semester, sort, typeFilter, statusFilter])

  const paged = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))

  const sortHeader = (label: string, key: SortKey) => (
    <button type="button" className="link-btn" style={{ padding: 0, fontWeight: 500 }} onClick={() => toggleSort(key)}>
      {label} <SwapOutlined rotate={90} style={{ fontSize: 11, color: sort?.key === key ? 'var(--seal)' : undefined }} />
    </button>
  )

  const statusKeys = [...new Set(CLUB_ACTIVITIES.filter((a) => a.status !== 'draft').map((a) => a.status))]

  // 點列一律開活動詳情預覽;結案走列上的動作鈕(或預覽內「前往結案」)
  const onRowClick = (a: Activity) => {
    setPreview(a)
    setPreviewOpen(true)
  }

  const row = (a: Activity, actions: React.ReactNode) => (
    <tr key={a.id} onClick={() => onRowClick(a)} style={{ cursor: 'pointer' }}>
      <td style={{ fontWeight: 500 }}>{a.name}</td>
      <td>
        {a.type}
        {a.isLarge && (
          <Tooltip title={a.largeApproved ? '已認可為大型活動(行政分 ×3)' : '大型活動申請,待學務處認可'}>
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 500,
                color: a.largeApproved ? '#fff' : 'var(--seal)',
                background: a.largeApproved ? 'var(--seal)' : 'transparent',
                border: '1px solid var(--seal)',
                borderRadius: 4,
                padding: '0 4px',
              }}
            >
              大
            </span>
          </Tooltip>
        )}
      </td>
      <td className="num" style={{ fontSize: 13 }}>{a.date}</td>
      <td className="r num" style={{ fontSize: 13 }}>{money(a)}</td>
      <td><StatusPill status={a.status} /></td>
      <td className="r" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>{actions}</td>
    </tr>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="活動列表"
        sub={
          <>
            {user?.club} · 本學期 <span className="num">{rest.length}</span> 件
          </>
        }
        extra={
          <Select
            value={semester}
            onChange={(v) => {
              setSemester(v)
              setPage(1)
            }}
            style={{ width: 110 }}
            options={semOptions}
          />
        }
      />

      {drafts.length > 0 && (
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '14px 20px 6px' }}>
            草稿 <span className="num" style={{ fontSize: 12, background: '#EEF0F3', color: 'var(--steel)', borderRadius: 999, padding: '1px 8px' }}>{drafts.length}</span>
          </div>
          <table className="tb" style={{ minWidth: 760 }}>
            <tbody>
              {drafts.map((a) =>
                row(
                  a,
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <Button size="small" type="primary" onClick={() => act('送出', a)}>送出</Button>
                    <Button size="small" danger onClick={() => act('刪除', a)}>刪除</Button>
                  </span>,
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>{sortHeader('名稱', 'name')}</th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {sortHeader('類型', 'type')}
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: ['社課', '活動', '會議'].map((t) => ({ key: t, label: t })),
                      selectable: true,
                      multiple: true,
                      selectedKeys: typeFilter,
                      onSelect: ({ selectedKeys }) => { setTypeFilter(selectedKeys); setPage(1) },
                      onDeselect: ({ selectedKeys }) => { setTypeFilter(selectedKeys); setPage(1) },
                    }}
                  >
                    <button type="button" className="link-btn" aria-label="篩選類型" style={{ padding: 0 }}>
                      <FilterOutlined style={{ fontSize: 11, color: typeFilter.length ? 'var(--seal)' : 'var(--steel)' }} />
                    </button>
                  </Dropdown>
                </span>
              </th>
              <th>{sortHeader('日期', 'date')}</th>
              <th className="r">{sortHeader('經費(自籌/擬請)', 'budget')}</th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {sortHeader('狀態', 'status')}
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: statusKeys.map((k) => ({ key: k, label: STATUS[k].label })),
                      selectable: true,
                      multiple: true,
                      selectedKeys: statusFilter,
                      onSelect: ({ selectedKeys }) => { setStatusFilter(selectedKeys as StatusKey[]); setPage(1) },
                      onDeselect: ({ selectedKeys }) => { setStatusFilter(selectedKeys as StatusKey[]); setPage(1) },
                    }}
                  >
                    <button type="button" className="link-btn" aria-label="篩選狀態" style={{ padding: 0 }}>
                      <FilterOutlined style={{ fontSize: 11, color: statusFilter.length ? 'var(--seal)' : 'var(--steel)' }} />
                    </button>
                  </Dropdown>
                </span>
              </th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((a) =>
              row(
                a,
                a.status === 'approved' ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {a.closeDraft && (
                      <Tooltip title="已暫存結案草稿">
                        <span style={{ fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>草稿</span>
                      </Tooltip>
                    )}
                    <Button size="small" type="primary" onClick={() => navigate(`/activities/${a.id}/close`)}>結案</Button>
                  </span>
                ) : null,
              ),
            )}
            {paged.length === 0 && (
              <tr className="no-hover">
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 28 }}>
                  本學期尚無活動。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rest.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={rest.length} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        點擊列開啟預覽;點欄位標題排序,漏斗圖示篩選。
      </div>

      <PreviewModal
        a={preview}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        afterClose={() => setPreview(null)}
        onEdit={() => {
          setPreviewOpen(false)
          if (preview) navigate(`/activities/${preview.id}/edit`)
        }}
        onGoClose={() => {
          setPreviewOpen(false)
          if (preview) navigate(`/activities/${preview.id}/close`)
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
