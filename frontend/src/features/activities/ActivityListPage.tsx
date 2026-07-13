import { Fragment } from 'react'
import { useNavigate } from 'react-router'
import { App, Button } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAuth } from '../../app/auth'
import { CLUB_ACTIVITIES } from './mock'
import { budgetTotals, fmtMoney, type Activity } from './types'

// 依狀態決定列動作(結案/退回為列表內動作與狀態,無獨立頁)
function rowActions(a: Activity, act: (label: string, a: Activity) => void) {
  switch (a.status) {
    case 'draft':
      return (
        <>
          <button type="button" className="link-btn primary" onClick={() => act('送出', a)}>送出</button>
          <button type="button" className="link-btn" onClick={() => act('編輯', a)}>編輯</button>
          <button type="button" className="link-btn" onClick={() => act('刪除', a)}>刪除</button>
        </>
      )
    case 'rejected':
      return (
        <>
          <button type="button" className="link-btn primary" onClick={() => act('編輯重送', a)}>編輯重送</button>
          <button type="button" className="link-btn" onClick={() => act('查看', a)}>查看</button>
        </>
      )
    case 'approved':
      return (
        <>
          <button type="button" className="link-btn primary" onClick={() => act('結案', a)}>結案</button>
          <button type="button" className="link-btn" onClick={() => act('查看', a)}>查看</button>
        </>
      )
    default:
      return (
        <button type="button" className="link-btn" onClick={() => act('查看', a)}>查看</button>
      )
  }
}

function RejectReasonBox({ a, compact }: { a: Activity; compact?: boolean }) {
  if (!a.rejectReason) return null
  return (
    <div
      style={{
        background: 'var(--paper)',
        borderRadius: 6,
        padding: compact ? '8px 12px' : '10px 14px',
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <span style={{ fontWeight: 500, color: '#B03A2E' }}>退回原因</span>
      <span style={{ color: 'var(--steel)' }}>
        {' '}— {a.rejectReason.by} · <span className="num">{a.rejectReason.date}</span>:
      </span>
      {a.rejectReason.text}
    </div>
  )
}

export default function ActivityListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { message } = App.useApp()

  const act = (label: string, a: Activity) => {
    if (label === '編輯' || label === '編輯重送') {
      navigate('/activities/new')
      return
    }
    message.info(`「${label}」尚未接上後端(${a.id})`)
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader
        title="活動列表"
        sub={
          <>
            {user?.club} · 共 <span className="num">{CLUB_ACTIVITIES.length}</span> 件
          </>
        }
        extra={
          <span className="desktop-only">
            <Button type="primary" style={{ height: 36 }} onClick={() => navigate('/activities/new')}>
              + 活動申請
            </Button>
          </span>
        }
      />

      {/* 桌面:表格 */}
      <div className="desktop-only">
        <div className="card" style={{ marginTop: 20, overflow: 'hidden' }}>
          <table className="tb">
            <thead>
              <tr>
                <th>單號</th>
                <th>名稱</th>
                <th>類型</th>
                <th>日期</th>
                <th className="r">經費(自籌/擬請)</th>
                <th>狀態</th>
                <th className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {CLUB_ACTIVITIES.map((a) => {
                const totals = budgetTotals(a.budget)
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{a.id}</td>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td>{a.type}</td>
                      <td className="num" style={{ fontSize: 13 }}>{a.date}</td>
                      <td className="r num" style={{ fontSize: 13 }}>
                        {fmtMoney(totals.self)} / {fmtMoney(totals.requested)}
                      </td>
                      <td><StatusPill status={a.status} /></td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>{rowActions(a, act)}</td>
                    </tr>
                    {a.rejectReason && (
                      <tr className="no-hover">
                        <td colSpan={7} style={{ padding: '0 16px 14px' }}>
                          <RejectReasonBox a={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)' }}>
          「已退回」列展開顯示退回原因;逾期鎖定活動請洽課外活動指導組解鎖後結案。
        </div>
      </div>

      {/* 手機:卡片 */}
      <div className="mobile-only">
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button type="primary" style={{ height: 44 }} onClick={() => navigate('/activities/new')}>
            + 活動申請
          </Button>
          {CLUB_ACTIVITIES.map((a) => {
            const totals = budgetTotals(a.budget)
            return (
              <div className="card" key={a.id} style={{ padding: '14px 16px', boxShadow: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{a.name}</div>
                  <StatusPill status={a.status} />
                </div>
                <div className="num" style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                  {a.id} · {a.date}
                </div>
                {a.status === 'pending_dean' && (
                  <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 4 }}>
                    {a.type} · 自籌 <span className="num">{fmtMoney(totals.self)}</span> · 擬請{' '}
                    <span className="num">{fmtMoney(totals.requested)}</span>
                  </div>
                )}
                {a.status === 'approved' && a.closeDeadline && (
                  <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 4 }}>
                    結案期限 <span className="num">{a.closeDeadline}</span>(剩{' '}
                    <span className="num">{a.closeDaysLeft}</span> 天)
                  </div>
                )}
                {a.status === 'locked' && a.closeDeadline && (
                  <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 4 }}>
                    應於 <span className="num">{a.closeDeadline}</span> 前結案,請洽課外組解鎖
                  </div>
                )}
                {a.rejectReason && (
                  <div style={{ marginTop: 10 }}>
                    <RejectReasonBox a={a} compact />
                  </div>
                )}
                {(a.status === 'draft' || a.status === 'rejected' || a.status === 'approved') && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      marginTop: 10,
                      borderTop: '1px solid var(--line)',
                      paddingTop: 6,
                    }}
                  >
                    {rowActions(a, act)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
