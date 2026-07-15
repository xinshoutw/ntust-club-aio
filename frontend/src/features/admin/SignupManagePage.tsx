import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Checkbox, InputNumber, Tooltip } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { SIGNUP_ITEMS } from '../signup/mock'

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
}

const LEADER_SESSIONS_TOTAL = 4

export default function SignupManagePage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>('cadre-training')

  return (
    <div>
      <PageHeader
        title="報名管理"
        extra={
          <Button type="primary" style={{ height: 36 }} onClick={() => navigate('/admin/signup-items/new')}>
            + 報名活動建立
          </Button>
        }
      />

      {/* 報名時間窗已移至「系統設定」頁 */}
      {SIGNUP_ITEMS.map((item) => {
        const regs = REGISTRATIONS[item.id] ?? []
        const open = expanded === item.id
        return (
          <div className="card" key={item.id} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{item.name}</div>
              <StatusPill status={item.status} />
              <div style={{ fontSize: 13, color: 'var(--steel)' }}>
                截止 <span className="num">{item.deadline}</span> · 已報名{' '}
                <span className="num">{regs.length}</span> 社團
              </div>
              <div style={{ flex: 1 }} />
              <button type="button" className="link-btn" onClick={() => setExpanded(open ? null : item.id)}>
                {open ? '收合' : '展開名單'}
              </button>
            </div>
            {open &&
              (regs.length ? (
                regs.map((r) => (
                  <div
                    key={r.club}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}
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
                ))
              ) : (
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--steel)' }}>
                  尚無社團報名。
                </div>
              ))}
          </div>
        )
      })}
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
        社團評鑑僅採計「簽到」:活動結束後在此登錄,僅報名未簽到不計分。
      </div>
    </div>
  )
}
