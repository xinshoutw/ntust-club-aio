import { useState } from 'react'
import { App, Button, Checkbox, Input, Modal } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'

interface PendingClose {
  id: string
  club: string
  name: string
  date: string
  submittedAt: string
  approvedBudget: number // 核定補助
  expense: number // 實際支出
  photos: number
  videoLink?: string
  actualLocation: string
  actualAttendees: number
  highlights: string // 活動重點
  goals: string // 達成目標
  others?: string // 其他成果
  reflections: { name: string; dept: string; text: string }[]
  reviewMeeting?: { date: string; attendees: number; topics: string; conclusion: string }
}

const PENDING: PendingClose[] = [
  {
    id: 'ACT-114-0014',
    club: '攝影社',
    name: '期末影展',
    date: '2026/06/10',
    submittedAt: '2026/06/18 20:41',
    approvedBudget: 20000,
    expense: 19500,
    photos: 8,
    videoLink: 'https://youtu.be/demo114',
    actualLocation: '學生活動中心',
    actualAttendees: 96,
    highlights: '展出 42 件社員作品,含期末專題「城市光影」系列;開幕導覽 2 場。',
    goals: '參觀人次 96(目標 80);社員全數完成至少 1 件參展作品。',
    others: '與美術社合辦閉幕座談,建立跨社合作管道。',
    reflections: [
      { name: '陳予恩', dept: '資工三', text: '第一次負責佈展動線,學會用觀眾視角規劃展場,也體會到燈光對作品呈現的影響。' },
      { name: '林詠晴', dept: '企管二', text: '售票與導覽的排班讓我練習到跨組協調,若能提前一週彩排會更從容。' },
      { name: '張佑群', dept: '資工三', text: '負責攝影紀錄,學到活動紀實與作品拍攝的差異,下次想嘗試短片形式。' },
    ],
    reviewMeeting: { date: '2026/06/12', attendees: 9, topics: '動線與售票流程檢討', conclusion: '入場改雙櫃台,明年提前兩週宣傳' },
  },
  {
    id: 'ACT-114-0016',
    club: '國際志工社',
    name: '社區服務日',
    date: '2026/06/08',
    submittedAt: '2026/06/20 09:12',
    approvedBudget: 6000,
    expense: 6200,
    photos: 4,
    actualLocation: '古亭社區活動中心',
    actualAttendees: 25,
    highlights: '為社區長者舉辦手機教學與健康量測,服務 25 位長者。',
    goals: '完成 3 小時服務時數;建立與里辦公室的長期合作。',
    reflections: [
      { name: '王思晴', dept: '化工二', text: '教長輩用通訊軟體比想像中需要耐心,拆步驟講解才有效。' },
      { name: '李承翰', dept: '機械三', text: '量測站的動線一開始混亂,調整成單向排隊後順很多。' },
      { name: '張晉安', dept: '資工二', text: '第一次全程用台語服務,發現語言親近感對長輩很重要。' },
      { name: '陳雅婷', dept: '應外一', text: '準備的教材字體太小,現場臨時放大重印,學到受眾優先。' },
    ],
  },
]

const LOCKED = [
  { id: 'ACT-114-0012', club: '資工系學會', name: '程式設計工作坊', deadline: '2026/05/12' },
]

const detailLabel: React.CSSProperties = { color: 'var(--steel)' }

// 繳交確認:輔導老師逐項確認;未確認之項目評鑑以 0 分計(原型規則)
const SUBMISSION_CHECKS = [
  { key: 'photos', label: '活動照片' },
  { key: 'report', label: '成果報告表' },
  { key: 'reflections', label: '學習心得' },
] as const
type CheckKey = (typeof SUBMISSION_CHECKS)[number]['key']

// 結案審核彈窗:輔導老師單關;成果概況+繳交確認,核准或退回(退回原因必填)
function CloseReviewModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: PendingClose
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({ photos: true, report: true, reflections: true })

  const closeReject = () => {
    setRejectOpen(false)
    setReason('')
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.error('退回原因為必填。')
      return
    }
    message.success(`已退回「${item.name}」結案(通知社團補正)`)
    closeReject()
    onClose()
  }

  const overBudget = item.expense > item.approvedBudget
  const photoShort = item.photos < 5 && !item.videoLink

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={640}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <StatusPill status="closing_pending_advisor" />
        </div>
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <Button danger style={{ height: 38 }} onClick={() => setRejectOpen(true)}>退回</Button>
          <Button
            type="primary"
            autoFocus
            style={{ height: 38 }}
            onClick={() => {
              const missing = SUBMISSION_CHECKS.filter((c) => !checks[c.key]).map((c) => c.label)
              message.success(
                missing.length
                  ? `已核准「${item.name}」結案(${missing.join('、')}未繳,該項以 0 分計)`
                  : `已核准「${item.name}」結案`,
              )
              onClose()
            }}
          >
            核准結案
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13, marginTop: 4 }}>
        <div style={detailLabel}>社團</div><div>{item.club}</div>
        <div style={detailLabel}>活動日期</div><div className="num">{item.date}</div>
        <div style={detailLabel}>實際地點</div><div>{item.actualLocation}</div>
        <div style={detailLabel}>實際人數</div><div className="num">{item.actualAttendees} 人</div>
        <div style={detailLabel}>送件</div><div className="num">{item.submittedAt}</div>
        <div style={detailLabel}>經費</div>
        <div>
          核定 <span className="num">${item.approvedBudget.toLocaleString()}</span> · 實支{' '}
          <span className="num" style={overBudget ? { color: '#B03A2E', fontWeight: 500 } : undefined}>
            ${item.expense.toLocaleString()}
          </span>
          {overBudget && <span style={{ color: '#B03A2E', fontSize: 12 }}>(超出核定)</span>}
        </div>
        <div style={detailLabel}>成果</div>
        <div>
          照片 <span className="num" style={photoShort ? { color: '#B03A2E' } : undefined}>{item.photos}</span> 張
          {item.videoLink ? (
            <>
              {' '}·{' '}
              <a href={item.videoLink} target="_blank" rel="noopener noreferrer">影片連結</a>
            </>
          ) : (
            ' · 無影片連結'
          )}
          {' '}· 心得 <span className="num">{item.reflections.length}</span> 人
          {photoShort && <div style={{ color: '#B03A2E', fontSize: 12 }}>照片未達 5 張且無影片連結,成果照片項不計分</div>}
        </div>
        <div style={detailLabel}>活動重點</div><div style={{ lineHeight: 1.7 }}>{item.highlights}</div>
        <div style={detailLabel}>達成目標</div><div style={{ lineHeight: 1.7 }}>{item.goals}</div>
        {item.others && (
          <>
            <div style={detailLabel}>其他成果</div><div style={{ lineHeight: 1.7 }}>{item.others}</div>
          </>
        )}
        {item.reviewMeeting && (
          <>
            <div style={detailLabel}>檢討會議</div>
            <div style={{ lineHeight: 1.7 }}>
              <span className="num">{item.reviewMeeting.date}</span> · 與會{' '}
              <span className="num">{item.reviewMeeting.attendees}</span> 人
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>討論:{item.reviewMeeting.topics}</div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>決議:{item.reviewMeeting.conclusion}</div>
            </div>
          </>
        )}
      </div>

      {/* 學習心得全文:審核者須核實內容 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>學習心得</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
          {item.reflections.map((r) => (
            <div key={`${r.name}-${r.dept}`} style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <span style={{ color: 'var(--steel)', fontSize: 12 }}>({r.dept})</span>
              <div style={{ lineHeight: 1.7, marginTop: 2 }}>{r.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 繳交確認:未勾選之項目評鑑以 0 分計 */}
      <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--paper)', borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>繳交確認(未確認項目評鑑以 0 分計)</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {SUBMISSION_CHECKS.map((c) => (
            <Checkbox
              key={c.key}
              checked={checks[c.key]}
              onChange={(e) => setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))}
            >
              {c.label}
            </Checkbox>
          ))}
        </div>
      </div>

      <Modal
        open={rejectOpen}
        title="退回結案"
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
          placeholder="例:成果照片不足 5 張且未附影片連結"
        />
      </Modal>
    </Modal>
  )
}

export default function CloseReviewPage() {
  const { message } = App.useApp()
  const [selected, setSelected] = useState<PendingClose | null>(null)
  const [open, setOpen] = useState(false)

  const openItem = (p: PendingClose) => {
    setSelected(p)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="結案審核"
        sub={
          <>
            待審 <span className="num">{PENDING.length}</span> 件 · 逾期鎖定 <span className="num">{LOCKED.length}</span> 件
          </>
        }
      />

      {/* 待審佇列:送件早的在前 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 6px' }}>待審結案</div>
        {[...PENDING]
          .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
          .map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => openItem(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openItem(p)
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
                ...(selected?.id === p.id && open ? { background: 'var(--seal-tint)' } : {}),
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                  {p.club} · 活動 <span className="num">{p.date}</span> · 送件 <span className="num">{p.submittedAt}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>成果</div>
                <div className="num" style={{ fontSize: 13, marginTop: 2 }}>
                  照片 {p.photos} · 心得 {p.reflections.length}
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 84 }}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>實際支出</div>
                <div className="num" style={{ fontSize: 13, marginTop: 2 }}>${p.expense.toLocaleString()}</div>
              </div>
              <Button
                type="primary"
                size="small"
                style={{ height: 30 }}
                onClick={(e) => {
                  e.stopPropagation()
                  openItem(p)
                }}
              >
                審核
              </Button>
            </div>
          ))}
        {PENDING.length === 0 && (
          <div style={{ padding: '20px 20px 24px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
            目前沒有待審結案。
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未結案(已鎖定)</div>
        <table className="tb dense" style={{ minWidth: 640 }}>
          <tbody>
            {LOCKED.map((l) => (
              <tr key={l.id} className="no-hover">
                <td>{l.club}</td>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                  結案期限 <span className="num">{l.deadline}</span>
                </td>
                <td style={{ width: 110 }}><StatusPill status="locked" /></td>
                <td className="r" style={{ width: 90 }}>
                  <Button size="small" style={{ height: 28 }} onClick={() => message.success(`已解鎖「${l.name}」,社團可補送結案`)}>
                    解鎖
                  </Button>
                </td>
              </tr>
            ))}
            {LOCKED.length === 0 && (
              <tr className="no-hover">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>沒有逾期鎖定的活動。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <CloseReviewModal
          key={selected.id}
          item={selected}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
