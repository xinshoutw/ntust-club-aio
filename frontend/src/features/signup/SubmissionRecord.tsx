import type { SignupItem } from './types'

const BASE_FIELDS: [string, string][] = [
  ['name', '姓名'],
  ['studentId', '學號'],
  ['dept', '系級'],
]

// 已送出報名的填寫紀錄(列表 popup 與報名子頁共用)
export default function SubmissionRecord({ item }: { item: SignupItem }) {
  const sub = item.submission
  if (!sub) return null
  const fields = [...BASE_FIELDS, ...item.fields.map((f): [string, string] => [f.key, f.label])]
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--steel)' }}>
        送出時間 <span className="num">{sub.submittedAt}</span>
      </div>
      {sub.participants.map((p, i) => (
        <div key={i} style={{ marginTop: 10, padding: '12px 14px', background: 'var(--paper)', borderRadius: 6 }}>
          {sub.participants.length > 1 && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              參加人 <span className="num">{i + 1}</span>
            </div>
          )}
          <div className="form-grid-2" style={{ gap: '10px 24px' }}>
            {fields.map(([key, label]) => (
              <div key={key}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>{label}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{p[key] || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
