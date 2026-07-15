import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Checkbox, InputNumber, Modal, Tooltip } from 'antd'
import { DownloadOutlined, RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { downloadCsv } from '../../lib/csv'
import KindBadge from '../signup/KindBadge'
import { SIGNUP_ITEMS } from '../signup/mock'
import type { SignupItem } from '../signup/types'

// 簽到:活動結束後由管理員登錄,評鑑僅採計簽到(僅報名不計分)
// 負責人會議為場次制(每學期 2 場、全學年 4 場),登錄已出席場次數
interface Registration {
  club: string
  count: number
  confirmed: boolean
  attended?: boolean
  attendedSessions?: number
}

const REGISTRATIONS: Record<string, Registration[]> = {
  'cadre-training': [
    { club: '資工系學會', count: 2, confirmed: true },
    { club: '電機系學會', count: 3, confirmed: false },
  ],
  'leader-meeting': [{ club: '電機系學會', count: 1, confirmed: true, attendedSessions: 2 }],
  evaluation: [{ club: '電機系學會', count: 1, confirmed: true }],
  'cadre-camp': [{ club: '資工系學會', count: 2, confirmed: true, attended: true }],
}

const LEADER_SESSIONS_TOTAL = 4

// 單一報名活動的管理彈窗:名單、報名確認、簽到登錄、匯出
function ManageModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: SignupItem
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const regs = REGISTRATIONS[item.id] ?? []
  const totalPeople = regs.reduce((s, r) => s + r.count, 0)

  const exportCsv = () => {
    if (!regs.length) {
      message.error('尚無報名名單可匯出')
      return
    }
    downloadCsv(`報名名單_${item.name}.csv`, [
      ['社團', '人數', '狀態'],
      ...regs.map((r) => [r.club, String(r.count), r.confirmed ? '已確認' : '待確認']),
    ])
    message.success(`已匯出 ${regs.length} 筆報名`)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={620}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <KindBadge kind={item.kind} />
          <StatusPill status={item.status} />
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--steel)', marginTop: 4, flexWrap: 'wrap' }}>
        <span>
          截止 <span className="num">{item.deadline}</span>
        </span>
        <span>
          已報名 <span className="num">{regs.length}</span> 社團 · <span className="num">{totalPeople}</span> 人
        </span>
        <span>
          每社上限 <span className="num">{item.maxParticipants}</span> 人
        </span>
        <span style={{ flex: 1 }} />
        <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv}>
          匯出名單
        </Button>
      </div>

      <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {regs.map((r) => (
          <div
            key={r.club}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', marginTop: -1 }}
          >
            <div style={{ fontSize: 14, flex: 1, minWidth: 140 }}>{r.club}</div>
            <div className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{r.count} 人</div>
            {/* 簽到:評鑑僅採計簽到;負責人會議登錄出席場次 */}
            {item.kind === 'leader_meeting' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--steel)' }}>
                簽到
                <InputNumber
                  size="small"
                  min={0}
                  max={LEADER_SESSIONS_TOTAL}
                  precision={0}
                  defaultValue={r.attendedSessions ?? 0}
                  style={{ width: 56 }}
                  aria-label={`${r.club} 簽到場次`}
                  onChange={(v) => message.success(`已登錄 ${r.club} 簽到 ${v ?? 0} 場`)}
                />
                / {LEADER_SESSIONS_TOTAL} 場
              </span>
            ) : item.status === 'ended' ? (
              <Checkbox
                defaultChecked={r.attended}
                onChange={(e) => message.success(`${r.club} ${e.target.checked ? '已簽到' : '取消簽到'}`)}
              >
                簽到
              </Checkbox>
            ) : (
              <Tooltip title="活動結束後開放登錄簽到">
                <Checkbox disabled>簽到</Checkbox>
              </Tooltip>
            )}
            {r.confirmed ? (
              <StatusPill status="approved" />
            ) : (
              <Button size="small" style={{ height: 28 }} onClick={() => message.success(`已確認 ${r.club} 報名`)}>
                確認報名
              </Button>
            )}
          </div>
        ))}
        {regs.length === 0 && (
          <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--steel)' }}>尚無社團報名。</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        評鑑僅採計「簽到」:活動結束後在此登錄,僅報名未簽到不計分。
      </div>
    </Modal>
  )
}

export default function SignupManagePage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<SignupItem | null>(null)
  const [open, setOpen] = useState(false)

  const openItem = (item: SignupItem) => {
    setSelected(item)
    setOpen(true)
  }

  const openCount = SIGNUP_ITEMS.filter((i) => i.status === 'open').length

  return (
    <div>
      <PageHeader
        title="報名管理"
        sub={
          <>
            開放中 <span className="num">{openCount}</span> 項
          </>
        }
        extra={
          <Button type="primary" style={{ height: 36 }} onClick={() => navigate('/admin/signup-items/new')}>
            + 報名活動建立
          </Button>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>活動</th>
              <th>截止</th>
              <th className="r">已報名</th>
              <th className="r">每社上限</th>
              <th>狀態</th>
              <th aria-label="開啟" style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {SIGNUP_ITEMS.map((item) => {
              const regs = REGISTRATIONS[item.id] ?? []
              const pendingConfirm = regs.filter((r) => !r.confirmed).length
              return (
                <tr key={item.id} onClick={() => openItem(item)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <KindBadge kind={item.kind} />
                    </span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{item.deadline}</td>
                  <td className="r num">
                    {regs.length} 社團
                    {pendingConfirm > 0 && (
                      <span style={{ color: '#8A5A00', fontSize: 12 }}>(待確認 {pendingConfirm})</span>
                    )}
                  </td>
                  <td className="r num">{item.maxParticipants} 人</td>
                  <td style={{ width: 90 }}><StatusPill status={item.status} /></td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <ManageModal
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
