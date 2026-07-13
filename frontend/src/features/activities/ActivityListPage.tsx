import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Dropdown, Modal, Pagination, Select } from 'antd'
import { FileImageOutlined, FileTextOutlined, FilterOutlined, SwapOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { STATUS, type StatusKey } from '../../lib/status'
import { semesterOf, semesterOptions } from '../../lib/semester'
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
  if (key === 'budget') return budgetTotals(a.budget).requested
  if (key === 'status') return STATUS[a.status].label
  return a[key] ?? ''
}

function PreviewModal({ a, open, onClose, afterClose, onEdit }: { a: Activity | null; open: boolean; onClose: () => void; afterClose: () => void; onEdit: () => void }) {
  if (!a) return null
  const t = budgetTotals(a.budget)
  const editable = a.status === 'draft' || a.status === 'rejected'
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      title={
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          {a.name} <StatusPill status={a.status} />
        </span>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>關閉</Button>
          {editable && (
            <Button type="primary" onClick={onEdit}>
              {a.status === 'rejected' ? '編輯重送' : '繼續編輯'}
            </Button>
          )}
        </div>
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

      {a.status === 'closed' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>結案成果(示意)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span><FileTextOutlined style={{ color: 'var(--steel)', marginRight: 6 }} />{a.name}_成果報告.pdf</span>
            <span><FileImageOutlined style={{ color: 'var(--steel)', marginRight: 6 }} />{a.name}_照片.zip(5 張)</span>
            <span><FileTextOutlined style={{ color: 'var(--steel)', marginRight: 6 }} />學習心得彙整(3 人).pdf</span>
          </div>
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

  const row = (a: Activity, actions: React.ReactNode) => (
    <tr key={a.id} onClick={() => { setPreview(a); setPreviewOpen(true) }} style={{ cursor: 'pointer' }}>
      <td style={{ fontWeight: 500 }}>{a.name}</td>
      <td>{a.type}{a.isLarge && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--seal)', border: '1px solid var(--seal)', borderRadius: 4, padding: '0 4px' }}>大</span>}</td>
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
                    menu={{
                      items: ['社課', '活動', '會議'].map((t) => ({ key: t, label: t })),
                      selectable: true,
                      multiple: true,
                      selectedKeys: typeFilter,
                      onSelect: ({ selectedKeys }) => setTypeFilter(selectedKeys),
                      onDeselect: ({ selectedKeys }) => setTypeFilter(selectedKeys),
                    }}
                  >
                    <FilterOutlined style={{ fontSize: 11, color: typeFilter.length ? 'var(--seal)' : 'var(--steel)', cursor: 'pointer' }} />
                  </Dropdown>
                </span>
              </th>
              <th>{sortHeader('日期', 'date')}</th>
              <th className="r">{sortHeader('經費(自籌/擬請)', 'budget')}</th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {sortHeader('狀態', 'status')}
                  <Dropdown
                    menu={{
                      items: statusKeys.map((k) => ({ key: k, label: STATUS[k].label })),
                      selectable: true,
                      multiple: true,
                      selectedKeys: statusFilter,
                      onSelect: ({ selectedKeys }) => setStatusFilter(selectedKeys as StatusKey[]),
                      onDeselect: ({ selectedKeys }) => setStatusFilter(selectedKeys as StatusKey[]),
                    }}
                  >
                    <FilterOutlined style={{ fontSize: 11, color: statusFilter.length ? 'var(--seal)' : 'var(--steel)', cursor: 'pointer' }} />
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
                  <Button size="small" type="primary" onClick={() => act('結案', a)}>結案</Button>
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
          navigate('/activities/new')
        }}
      />
    </div>
  )
}
