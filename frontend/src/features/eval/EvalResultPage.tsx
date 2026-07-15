import PageHeader from '../../components/ui/PageHeader'

interface AwardResult {
  award: string
  score: number
  grade: string
  comments: { judge: string; text: string }[]
  released: boolean
}

const RESULTS: AwardResult[] = [
  {
    award: '最佳社團獎',
    score: 82.4,
    grade: 'A',
    released: true,
    comments: [
      { judge: '評審A', text: '章程完整、交接清楚;財報清楚、器材管理佳。SDGs 連結可再深化。' },
      { judge: '評審B', text: '規劃管理佳、財務透明;建議補充退費規範,活動創新度高。' },
    ],
  },
  {
    award: '最佳活動獎',
    score: 0,
    grade: '—',
    released: false,
    comments: [],
  },
]

function gradePill(grade: string) {
  const on = grade === 'A+' || grade === 'A'
  return (
    <span
      className="num"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: on ? '#E3F2E9' : '#EEF0F3',
        color: on ? '#1F6B45' : 'var(--steel)',
      }}
    >
      {grade}
    </span>
  )
}

export default function EvalResultPage() {
  return (
    <div>
      <PageHeader title="評鑑結果" sub={`114 學年`} />

      {RESULTS.map((r) => (
        <div className="card" key={r.award} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 12px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{r.award}</div>
            {r.released ? (
              <>
                <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{r.score}</span>
                {gradePill(r.grade)}
              </>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--steel)' }}>成績尚未公布</span>
            )}
          </div>
          {r.released &&
            r.comments.map((c) => (
              <div key={c.judge} style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--steel)' }}>{c.judge}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, marginTop: 4 }}>{c.text}</div>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
