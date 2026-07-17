import { useNavigate } from 'react-router'
import PageHeader from '../../components/ui/PageHeader'
import { ASSIGNMENTS, DONE_ROWS } from './mock'

// 我負責的評分(評審端基礎原型):被指派的獎項分組與進度,點卡進入該獎項評分
export default function MyReviewsPage() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader title="我負責的評分" />

      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {ASSIGNMENTS.map((a) => {
          const done = DONE_ROWS.filter((d) => d.award === a.label).length
          return (
            <div
              key={a.key}
              className="card click-tint"
              style={{ padding: 20, cursor: 'pointer' }}
              onClick={() => navigate(`/viewer/score?award=${a.key}`)}
            >
              <div style={{ fontSize: 16, fontWeight: 600 }}>{a.label}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--steel)' }}>
                評分細項 <span className="num">{a.items.length}</span> 項,滿分{' '}
                <span className="num">{a.items.reduce((s, i) => s + i.max, 0)}</span>
              </div>
              <div style={{ marginTop: 14, fontSize: 14 }}>
                已完成 <span className="num">{done}</span> / <span className="num">{a.clubs.length}</span> 社團
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
