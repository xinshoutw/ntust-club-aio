import { useNavigate } from 'react-router'
import { Button } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { SIGNUP_ITEMS } from './mock'
import './signup.css'

export default function SignupListPage() {
  const navigate = useNavigate()

  return (
    <div style={{ maxWidth: 1000 }}>
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
              style={{ opacity: ended ? 0.72 : undefined }}
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
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>報名截止</div>
                  <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{item.deadline}</div>
                </div>
                <Button
                  style={{ height: 36 }}
                  disabled={ended}
                  onClick={() => navigate(`/signup/${item.id}`)}
                >
                  {ended ? '已截止' : '前往報名'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
