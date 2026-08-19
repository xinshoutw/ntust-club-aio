import { useNavigate } from 'react-router'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { PRESENTATION_MAX, useViewerAssignments, type ViewerAssignment } from '../../api/viewer'
import { clickableProps } from '../../lib/clickable'

const itemsMax = (a: ViewerAssignment): number => a.items.reduce((s, i) => s + i.maxScore, 0)

// 我負責的評分:被指派的獎項分組與進度,點卡進入該獎項評分
export default function MyReviewsPage() {
  const navigate = useNavigate()
  const query = useViewerAssignments()
  const assignments = query.data ?? []

  return (
    <div>
      <PageHeader title="我負責的評分" />

      {query.isError ? (
        <div style={{ marginTop: 20 }}>
          <QueryError title="評分指派載入失敗" error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <LoadingBlock pending={query.isPending}>
          {!query.isPending && assignments.length === 0 ? (
            <div className="card" style={{ marginTop: 20, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
              尚未被指派評分
            </div>
          ) : (
            <div
              style={{
                marginTop: 20,
                minHeight: query.isPending ? 120 : undefined,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {assignments.map((a) => {
                const done = a.clubs.filter((c) => c.scored).length
                const max = itemsMax(a) + (a.hasPresentation ? PRESENTATION_MAX : 0)
                return (
                  <div
                    key={a.groupId}
                    className="card click-tint"
                    style={{ padding: 20, cursor: 'pointer' }}
                    {...clickableProps(() => navigate(`/viewer/score?group=${a.groupId}`))}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{a.awardName}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--steel)' }}>{a.groupName}</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--steel)' }}>
                      評分細項 <span className="num">{a.items.length}</span> 項,滿分{' '}
                      <span className="num">{max}</span>
                      {a.hasPresentation && (
                        <>
                          (含現場簡報 <span className="num">{PRESENTATION_MAX}</span>)
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: 14, fontSize: 14 }}>
                      已完成 <span className="num">{done}</span> / <span className="num">{a.clubs.length}</span> 社團
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </LoadingBlock>
      )}
    </div>
  )
}
