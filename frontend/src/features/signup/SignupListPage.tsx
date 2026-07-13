import { useNavigate } from 'react-router'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { SIGNUP_ITEMS } from './mock'
import './signup.css'

export default function SignupListPage() {
  const navigate = useNavigate()

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="線上報名" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        學務處開放報名之會議與活動;人數上限為單一社團配額。
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SIGNUP_ITEMS.map((item) => {
          const ended = item.status === 'ended'
          return (
            <div
              key={item.id}
              className="card signup-card"
              role="button"
              tabIndex={ended ? -1 : 0}
              onClick={() => !ended && navigate(`/signup/${item.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && !ended && navigate(`/signup/${item.id}`)}
              style={{ opacity: ended ? 0.72 : undefined, cursor: ended ? 'default' : 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{item.name}</div>
                  <StatusPill status={item.status} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 5, lineHeight: 1.6 }}>
                  {item.info}
                </div>
              </div>
              <div className="signup-card-side">
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>截止日</div>
                  <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{item.deadline}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
