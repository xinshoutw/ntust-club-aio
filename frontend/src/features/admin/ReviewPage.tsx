import { useMemo, useState } from 'react'
import { App, Button, Checkbox, Input, InputNumber, Modal } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import LargeBadge from '../../components/ui/LargeBadge'
import StampTrail, { type StampStage } from '../../components/ui/StampTrail'
import { FilterButton, SortButton, useSort } from '../../components/ui/tableControls'
import { STATUS } from '../../lib/status'
import { fmtMoney } from '../activities/types'
import { REVIEW_ITEMS, type ReviewItem } from './reviewMock'

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 章軌由單據狀態推導;登入者(mock)為輔導老師,僅本關可簽核
function stagesOf(status: ReviewItem['status']): StampStage[] {
  const mk = (advisor: StampStage['state'], chief: StampStage['state'], dean: StampStage['state']): StampStage[] => [
    { char: '輔', label: '輔導老師', state: advisor, note: noteOf(advisor) },
    { char: '組', label: '組長', state: chief, note: noteOf(chief) },
    { char: '長', label: '學務長', state: dean, note: noteOf(dean) },
  ]
  switch (status) {
    case 'pending_advisor':
      return mk('current', 'todo', 'todo')
    case 'pending_chief':
      return mk('done', 'current', 'todo')
    case 'pending_dean':
      return mk('done', 'done', 'current')
    case 'approved':
    case 'closed':
      return mk('done', 'done', 'done')
    case 'rejected':
      return mk('rejected', 'todo', 'todo')
    default:
      return mk('todo', 'todo', 'todo')
  }
}

function noteOf(state: StampStage['state']): string | undefined {
  switch (state) {
    case 'current':
      return '審核中'
    case 'todo':
      return '未到關'
    case 'done':
      return '已核'
    case 'rejected':
      return '已退回'
  }
}

// 類型的篩選/排序值:有「大」標記者(申請中或已認可)視為大型活動;
// 申請被否准(largeApproved===false)以一般活動計 — 解讀待需求方確認
const typeKey = (item: ReviewItem): string =>
  item.type === '活動' && (item.largeApproved === true || (item.isLarge && item.largeApproved !== false))
    ? '大型活動'
    : item.type
const TYPE_OPTIONS = ['社課', '會議', '活動', '大型活動']

function DetailModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: ReviewItem
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  // 大型活動:社團申請或管理員逕行核定;認可後行政分才享 ×3 加權
  const [largeApproved, setLargeApproved] = useState(item.largeApproved ?? !!item.isLarge)
  const d = item.detail
  // 核定金額:controlled,依預算列 id 管理
  const [approvals, setApprovals] = useState<Record<number, number>>(() =>
    Object.fromEntries((d?.budget ?? []).map((b) => [b.id, b.approved])),
  )

  const canReview = item.status === 'pending_advisor'
  const requestedTotal = d?.budget.reduce((s, b) => s + b.requested, 0) ?? 0
  const approvedTotal = d?.budget.reduce((s, b) => s + (approvals[b.id] ?? 0), 0) ?? 0

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填。')
      return
    }
    message.success(`已退回「${item.name}」(通知社團修正重送)`)
    closeReject()
    onClose()
  }

  const hasBudget = !!d && d.budget.length > 0

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={hasBudget ? 880 : 620}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          {/* 本關可簽核時,徽章即時反映下方「認可為大型活動」勾選 */}
          <LargeBadge applied={item.isLarge} approved={canReview ? largeApproved : item.largeApproved} />
          <StatusPill status={item.status} />
          <span style={{ flex: 1 }} />
          <StampTrail stages={stagesOf(item.status)} />
        </div>
      }
      footer={
        canReview ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>
              退回
            </Button>
            <Button
              type="primary"
              autoFocus
              style={{ height: 38 }}
              onClick={() => {
                const largeNote = item.type === '活動' ? `(大型活動${largeApproved ? '已認可' : '未認可'})` : ''
                message.success(`已核准「${item.name}」${largeNote},送組長關`)
                onClose()
              }}
            >
              核准,送組長關
            </Button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            {item.status === 'rejected' ? '此申請已退回社團修正。' : '非本關卡待審單據,僅供查看。'}
          </div>
        )
      }
    >
      {/* 有經費才走雙欄:左=基本資料,右=經費逐項核定 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasBudget ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          gap: '8px 28px',
          marginTop: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>基本資料</div>
          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <div style={detailLabel}>社團</div><div>{item.club}</div>
            <div style={detailLabel}>類型</div><div>{item.type}</div>
            <div style={detailLabel}>日期時間</div><div className="num">{d?.timeRange ?? item.date}</div>
            <div style={detailLabel}>地點</div><div>{d?.location ?? '—'}</div>
            <div style={detailLabel}>參加人數</div>
            <div>
              校內 <span className="num">{d?.participantsIn ?? '—'}</span> · 校外{' '}
              <span className="num">{d?.participantsOut ?? '—'}</span>
            </div>
            <div style={detailLabel}>送件</div>
            <div>
              <span className="num">{d?.submittedAt ?? '—'}</span>
              {d?.submittedBy ? ` · ${d.submittedBy}` : ''}
            </div>
            <div style={detailLabel}>附件</div>
            <div>
              {d?.attachments.length
                ? d.attachments.map((f, i) => (
                    <span key={f}>
                      {i > 0 && ' · '}
                      <button type="button" className="link-btn" style={{ color: 'var(--focus)', padding: 0 }}>
                        {f}
                      </button>
                    </span>
                  ))
                : '—'}
            </div>
          </div>

          {item.type === '活動' && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 6 }}>
              <Checkbox
                checked={largeApproved}
                disabled={!canReview}
                onChange={(e) => setLargeApproved(e.target.checked)}
              >
                認可為大型活動(評鑑行政分 ×3 加權)
              </Checkbox>
              {item.isLarge && (
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>社團已申請認定為大型活動。</div>
              )}
            </div>
          )}
        </div>

        {hasBudget && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>經費明細 — 逐項核定</div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                {canReview ? '核定金額由本關填寫' : '核定金額(唯讀)'}
              </div>
            </div>
            <table className="tb dense">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 0 }}>摘要</th>
                  <th className="r">自籌</th>
                  <th className="r">擬請</th>
                  <th className="r" style={{ width: 96, paddingRight: 0 }}>核定</th>
                </tr>
              </thead>
              <tbody>
                {d.budget.map((b) => (
                  <tr key={b.id} className="no-hover">
                    <td style={{ paddingLeft: 0 }}>
                      <div style={{ whiteSpace: 'nowrap' }}>{b.category}</div>
                      <div style={{ fontSize: 12, color: 'var(--steel)' }}>{b.description}</div>
                    </td>
                    <td className="r num">{b.selfFund.toLocaleString()}</td>
                    <td className="r num">{b.requested.toLocaleString()}</td>
                    <td style={{ paddingRight: 0 }}>
                      {canReview ? (
                        <InputNumber
                          size="small"
                          style={{ width: '100%' }}
                          min={0}
                          max={b.requested}
                          precision={0}
                          value={approvals[b.id]}
                          onChange={(v) => setApprovals((prev) => ({ ...prev, [b.id]: v ?? 0 }))}
                          controls={false}
                        />
                      ) : (
                        <div className="r num" style={{ textAlign: 'right' }}>{(approvals[b.id] ?? 0).toLocaleString()}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ borderBottom: 'none', padding: '10px 8px 0 0', fontSize: 12, color: 'var(--steel)', textAlign: 'right' }}>
                    擬請合計 <span className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{fmtMoney(requestedTotal)}</span>
                  </td>
                  <td colSpan={2} style={{ borderBottom: 'none', padding: '10px 0 0', textAlign: 'right', fontSize: 12, color: 'var(--steel)' }}>
                    核定合計 <span className="num" style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{fmtMoney(approvedTotal)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={rejectOpen}
        title="退回申請"
        okText="確認退回"
        destroyOnHidden
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={submitReject}
        onCancel={closeReject}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>
          退回原因(必填,將顯示於社團的活動列表)
        </div>
        <Input.TextArea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例:經費明細第 3 項未附估價單"
        />
      </Modal>
    </Modal>
  )
}

type SortKey = 'club' | 'name' | 'type' | 'date' | 'status'

function sortValue(item: ReviewItem, key: SortKey): string {
  if (key === 'type') return typeKey(item)
  if (key === 'status') return STATUS[item.status].label
  return item[key]
}

export default function ReviewPage() {
  const [current, setCurrent] = useState<ReviewItem | null>(null)
  const [open, setOpen] = useState(false)
  const { sort, toggle } = useSort<SortKey>()
  const [clubFilter, setClubFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])

  const openItem = (item: ReviewItem) => {
    setCurrent(item)
    setOpen(true)
  }

  // 待本關(輔導老師)簽核的佇列:送件早的在前
  const queue = useMemo(
    () =>
      REVIEW_ITEMS.filter((i) => i.status === 'pending_advisor').sort((a, b) =>
        (a.detail?.submittedAt ?? a.date).localeCompare(b.detail?.submittedAt ?? b.date),
      ),
    [],
  )
  const others = REVIEW_ITEMS.filter((i) => i.status !== 'pending_advisor')

  const clubOptions = [...new Set(others.map((i) => i.club))]
  const statusOptions = [...new Set(others.map((i) => STATUS[i.status].label))]

  const rows = useMemo(() => {
    let list = others
    if (clubFilter.length) list = list.filter((i) => clubFilter.includes(i.club))
    if (typeFilter.length) list = list.filter((i) => typeFilter.includes(typeKey(i)))
    if (statusFilter.length) list = list.filter((i) => statusFilter.includes(STATUS[i.status].label))
    if (sort) {
      list = [...list].sort(
        (a, b) => sort.dir * String(sortValue(a, sort.key)).localeCompare(String(sortValue(b, sort.key)), 'zh-Hant'),
      )
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubFilter, typeFilter, statusFilter, sort])

  return (
    <div>
      <PageHeader
        title="活動申請審核"
        sub={
          <>
            待本關 <span className="num">{queue.length}</span> 件
          </>
        }
      />

      {/* 待審佇列:本關可簽核的單據,送件早的在前 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 6px' }}>待審佇列</div>
        {queue.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => openItem(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openItem(item)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '13px 20px',
              borderTop: '1px solid var(--line)',
              cursor: 'pointer',
              flexWrap: 'wrap',
              ...(current?.id === item.id && open ? { background: 'var(--seal-tint)' } : {}),
            }}
          >
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                <LargeBadge applied={item.isLarge} approved={item.largeApproved} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                {item.club} · {item.type}
                {item.detail?.submittedAt && (
                  <>
                    {' '}· 送件 <span className="num">{item.detail.submittedAt}</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>活動日期</div>
              <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{item.date}</div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 84 }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>擬請補助</div>
              <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{fmtMoney(item.requested)}</div>
            </div>
            <Button
              type="primary"
              size="small"
              style={{ height: 30 }}
              onClick={(e) => {
                e.stopPropagation()
                openItem(item)
              }}
            >
              審核
            </Button>
          </div>
        ))}
        {queue.length === 0 && (
          <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
            沒有待本關簽核的申請。
          </div>
        )}
      </div>

      {/* 其他狀態(他關審核中/已核准/已退回):供查閱與追蹤 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>其他狀態</div>
        <table className="tb dense" style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <SortButton label="社團" sortKey="club" sort={sort} onToggle={toggle} />
                  <FilterButton options={clubOptions} selected={clubFilter} onChange={setClubFilter} label="篩選社團" />
                </span>
              </th>
              <th><SortButton label="活動名稱" sortKey="name" sort={sort} onToggle={toggle} /></th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <SortButton label="類型" sortKey="type" sort={sort} onToggle={toggle} />
                  <FilterButton options={TYPE_OPTIONS} selected={typeFilter} onChange={setTypeFilter} label="篩選類型" />
                </span>
              </th>
              <th><SortButton label="活動日期" sortKey="date" sort={sort} onToggle={toggle} /></th>
              <th className="r">擬請補助</th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <SortButton label="狀態" sortKey="status" sort={sort} onToggle={toggle} />
                  <FilterButton options={statusOptions} selected={statusFilter} onChange={setStatusFilter} label="篩選狀態" />
                </span>
              </th>
              <th aria-label="開啟" style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                onClick={() => openItem(item)}
                style={{ cursor: 'pointer', ...(current?.id === item.id && open ? { background: 'var(--seal-tint)' } : {}) }}
              >
                <td>{item.club}</td>
                <td style={{ fontWeight: 500 }}>{item.name}</td>
                <td>
                  {item.type}
                  <LargeBadge applied={item.isLarge} approved={item.largeApproved} />
                </td>
                <td className="num">{item.date}</td>
                <td className="r num">{fmtMoney(item.requested)}</td>
                <td><StatusPill status={item.status} /></td>
                <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無符合篩選條件的申請。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 常駐待關閉動畫結束(afterClose)才卸載;key 依單據重掛,核定金額與退回原因不殘留 */}
      {current && (
        <DetailModal
          key={current.id}
          item={current}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setCurrent(null)}
        />
      )}
    </div>
  )
}
