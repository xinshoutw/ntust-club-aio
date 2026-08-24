import { useNavigate } from 'react-router'
import { Tooltip } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { useEvalOverview } from '../../api/eval'
import type { AdKey, FinalScore } from './scoring'
import { AD_LABELS } from './types'
import { clickableProps } from '../../lib/clickable'

// 各項分數的資料來源頁:點字卡跳轉(如網頁經營 → 管理項目)
const AD_ROUTES: Record<AdKey, string> = {
  ad1: '/activities',
  ad2: '/activities/close',
  ad3: '/activities/close',
  ad4: '/activities/close',
  ad5: '/members',
  ad6: '/club-settings',
  ad7: '/signup',
  ad8: '/signup',
  adj: '/violations',
}

function ScoreValue({ s }: { s: FinalScore }) {
  const color = s.final > 0 ? '#1F6B45' : s.final < 0 ? '#C13B34' : 'var(--steel)'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span className="num" style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1 }}>
        {s.key === 'adj' && s.final > 0 ? '+' : ''}
        {s.final}
      </span>
      <span className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>/ {s.key === 'adj' ? '+5' : s.max}</span>
    </div>
  )
}

// 資料總覽:行政資料各項分數(唯讀,後端自動計算+管理員調整)+ 五獎項資料入口
export default function EvalDocsPage() {
  const navigate = useNavigate()
  const overviewQuery = useEvalOverview()
  const { data, error } = overviewQuery

  const go = (path: string) => navigate(path)

  return (
    <div>
      <PageHeader
        title="資料總覽"
        sub={
          data && (
            <>
              {data.windowLabel} · 採計期間 <span className="num">{data.windowRange}</span>
            </>
          )
        }
        extra={
          <div style={{ textAlign: 'right', height: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.1 }}>行政資料總分</div>
            <div style={{ lineHeight: 1.1 }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{data ? data.total : '—'}</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--steel)' }}> / 100</span>
            </div>
          </div>
        }
      />

      {error && (
        <div style={{ marginTop: 20 }}>
          <QueryError
            title="評鑑資料載入失敗"
            error={error}
            onRetry={() => void overviewQuery.refetch()}
          />
        </div>
      )}

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {(data?.scores ?? []).map((s) => (
          <div
            key={s.key}
            className="card click-tint"
            {...clickableProps(() => go(AD_ROUTES[s.key]))}
            style={{ padding: '14px 18px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{AD_LABELS[s.key].name}</div>
              {s.overridden && (
                <Tooltip title={`學務處調整(自動計算為 ${s.auto} 分)`}>
                  <span style={{ fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>調整</span>
                </Tooltip>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <ScoreValue s={s} />
            </div>
          </div>
        ))}
      </div>

      {/* 五獎項 */}
      <div style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 4px' }}>競賽獎項資料</div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {(data?.awards ?? []).map((award) => (
          <div
            key={award.id}
            className="card click-tint"
            {...clickableProps(() => navigate(`/eval/award/${award.id}`))}
            style={{ padding: '16px 18px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{award.name}</div>
              <RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
            </div>
            <div style={{ fontSize: 12, marginTop: 10 }}>
              已上傳 <span className="num" style={{ fontWeight: 600 }}>{award.filled}</span>
              <span className="num" style={{ color: 'var(--steel)' }}> / {award.total}</span> 項
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
