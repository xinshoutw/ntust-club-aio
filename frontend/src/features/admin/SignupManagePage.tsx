import { useState } from 'react'
import { Link } from 'react-router'
import { App, Button, DatePicker } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { SIGNUP_ITEMS } from '../signup/mock'

const REGISTRATIONS: Record<string, { club: string; count: number; confirmed: boolean }[]> = {
  'cadre-training': [
    { club: '資工系學會', count: 2, confirmed: true },
    { club: '電機系學會', count: 3, confirmed: false },
  ],
  'leader-meeting': [{ club: '電機系學會', count: 1, confirmed: true }],
  evaluation: [{ club: '電機系學會', count: 1, confirmed: true }],
}

export default function SignupManagePage() {
  const { message } = App.useApp()
  const [expanded, setExpanded] = useState<string | null>('cadre-training')

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="報名管理"
        extra={
          <Link to="/admin/signup-items/new">
            <Button type="primary" style={{ height: 36 }}>+ 報名活動建立</Button>
          </Link>
        }
      />

      <div className="card" style={{ marginTop: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>報名時間窗</div>
        <DatePicker.RangePicker format="YYYY/MM/DD" />
        <Button style={{ height: 34 }} onClick={() => message.success('已儲存報名時間')}>儲存</Button>
        <div style={{ fontSize: 12, color: 'var(--steel)' }}>窗外時間社團無法送出報名。</div>
      </div>

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
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderTop: '1px solid var(--line)' }}
                  >
                    <div style={{ fontSize: 14, flex: 1 }}>{r.club}</div>
                    <div className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{r.count} 人</div>
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
    </div>
  )
}
