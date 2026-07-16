import type { SignupItemDetail } from '../../api/signups'

// 已送出報名的填寫紀錄(列表 popup 與報名子頁共用);欄位順序照管理員定義
export default function SubmissionRecord({ item }: { item: SignupItemDetail }) {
  const sub = item.mySignup
  if (!sub) return null
  const display = (value: unknown): string => {
    if (Array.isArray(value)) return value.length ? value.join('、') : '—'
    const text = value == null ? '' : String(value)
    return text || '—'
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--steel)' }}>
        送出時間 <span className="num">{sub.submittedAt}</span>
        {item.requiresConfirmation && !sub.confirmed && <span>(待管理員確認)</span>}
      </div>
      {sub.participants.map((p, i) => (
        <div key={i} style={{ marginTop: 10, padding: '12px 14px', background: 'var(--paper)', borderRadius: 6 }}>
          {sub.participants.length > 1 && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              參加人 <span className="num">{i + 1}</span>
            </div>
          )}
          <div className="form-grid-2" style={{ gap: '10px 24px' }}>
            {item.fields.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>{f.label}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{display(p[f.key])}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
