import { useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Input, Tooltip, Upload } from 'antd'
import { CheckCircleOutlined, RightOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { applyOverrides, computeAdScores, totalOf, type AdKey, type FinalScore } from './scoring'
import {
  AWARDS,
  EVAL_WINDOW,
  OVERRIDES,
  allPhotoHashes,
  buildScoringInput,
  closedActivities,
  resultOf,
  sha256,
  toEvalFile,
  uploadProgress,
} from './store'
import { AD_LABELS, type EvalFile } from './types'
import FilePreview from './FilePreview'

// 分數 chip:採用分(含管理員調整標示)
function ScoreChip({ s }: { s: FinalScore }) {
  const color = s.final > 0 ? { bg: '#E3F2E9', fg: '#1F6B45' } : s.final < 0 ? { bg: '#FBE9E7', fg: '#B03A2E' } : { bg: '#EEF0F3', fg: 'var(--steel)' }
  const chip = (
    <span
      className="num"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: color.bg,
        color: color.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {s.key === 'adj' && s.final > 0 ? '+' : ''}
      {s.final}
      <span style={{ fontWeight: 400, opacity: 0.75 }}>/ {s.key === 'adj' ? '+5' : s.max}</span>
    </span>
  )
  return s.overridden ? (
    <Tooltip title={`學務處調整(自動計算為 ${s.auto} 分)`}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {chip}
        <span style={{ fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>調整</span>
      </span>
    </Tooltip>
  ) : (
    chip
  )
}

function ItemRow({
  score,
  extra,
  children,
}: {
  score: FinalScore
  extra?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{AD_LABELS[score.key].name}</span>
          {extra}
        </div>
        <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 3 }}>{score.note}</div>
        {children}
      </div>
      <ScoreChip s={score} />
    </div>
  )
}

const okMark = <CheckCircleOutlined style={{ color: '#1F6B45', fontSize: 13 }} />

export default function EvalDocsPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [preview, setPreview] = useState<EvalFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const club = user?.club ?? ''
  const closed = closedActivities()
  const scores = applyOverrides(computeAdScores(buildScoringInput(club)), OVERRIDES)
  const byKey = Object.fromEntries(scores.map((s) => [s.key, s])) as Record<AdKey, FinalScore>
  const total = totalOf(scores)

  const openPreview = (f: EvalFile) => {
    setPreview(f)
    setPreviewOpen(true)
  }

  // 照片上傳:SHA-256 重複偵測(跨活動),重複即拒絕。
  // 逐張排隊處理:同一批選入兩張相同照片時,後者才能看見前者的 hash
  const photoQueue = useRef(Promise.resolve())
  const addPhoto = (activityId: string, f: File) => {
    photoQueue.current = photoQueue.current.then(async () => {
      const hash = await sha256(f)
      if (allPhotoHashes().has(hash)) {
        message.error(`「${f.name}」與已上傳的照片內容相同,已拒絕重複上傳`)
        return
      }
      resultOf(activityId).photos.push(await toEvalFile(f, hash))
      force()
    })
  }

  const fileChip = (f: EvalFile) => (
    <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px', maxWidth: 220 }}>
      <button type="button" className="link-btn" style={{ padding: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => openPreview(f)}>
        {f.name}
      </button>
    </span>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="資料總覽"
        sub={
          <>
            {club} · {EVAL_WINDOW.label} · 採計期間 <span className="num">{EVAL_WINDOW.range}</span>
          </>
        }
        extra={
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>行政資料總分</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{total}</div>
          </div>
        }
      />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        行政資料由系統依平時資料自動評分(結案始算);學務處得個別調整。五獎項競賽資料請於下方各獎項頁上傳。
      </div>

      {/* (一) 活動及社課申請 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 8px' }}>{AD_LABELS.ad1.group}</div>
        <ItemRow score={byKey.ad1} />
      </div>

      {/* (二) 活動/社課成果:各結案活動的照片/成果單/心得 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '14px 20px 8px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{AD_LABELS.ad2.group}</div>
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            照片/影片 <span className="num">{byKey.ad2.final}/{byKey.ad2.max}</span> · 成果單 <span className="num">{byKey.ad3.final}/{byKey.ad3.max}</span> · 心得回饋 <span className="num">{byKey.ad4.final}/{byKey.ad4.max}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--steel)', padding: '0 20px 8px' }}>
          成果單與心得由「活動結案」流程繳交(活動列表點等待結案的活動);照片與影片連結可於此補充。
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tb" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>結案活動</th>
                <th>照片(≥5 張)或影片連結</th>
                <th>成果單</th>
                <th>心得回饋</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((a) => {
                const r = resultOf(a.id)
                const photoOk = r.photos.length >= 5 || r.videoLink.trim() !== ''
                const large = !!(a.isLarge && a.largeApproved)
                return (
                  <tr key={a.id} className="no-hover">
                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 500 }}>
                        {a.name}
                        {large && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: '#fff', background: 'var(--seal)', borderRadius: 4, padding: '0 4px' }}>大</span>}
                      </div>
                      <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{a.date}</div>
                    </td>
                    <td style={{ verticalAlign: 'top', maxWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {r.photos.map((p) => (
                          <button key={p.id} type="button" className="link-btn" style={{ padding: 0 }} onClick={() => openPreview(p)} aria-label={`預覽 ${p.name}`}>
                            <img src={p.url} alt={p.name} style={{ width: 34, height: 26, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--line)', display: 'block' }} />
                          </button>
                        ))}
                        <Upload
                          accept="image/*"
                          multiple
                          showUploadList={false}
                          beforeUpload={(f) => {
                            addPhoto(a.id, f)
                            return false
                          }}
                        >
                          <Button size="small" icon={<UploadOutlined />}>照片</Button>
                        </Upload>
                        <span style={{ fontSize: 12, color: 'var(--steel)' }}>
                          {photoOk ? okMark : null} <span className="num">{r.photos.length}</span> 張
                        </span>
                      </div>
                      <Input
                        size="small"
                        placeholder="或貼上影片連結(YouTube 等)"
                        value={r.videoLink}
                        onChange={(e) => {
                          r.videoLink = e.target.value
                          force()
                        }}
                        style={{ marginTop: 6, maxWidth: 280 }}
                      />
                    </td>
                    {(['report', 'feedback'] as const).map((kind) => (
                      <td key={kind} style={{ verticalAlign: 'top' }}>
                        {r[kind] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {okMark}
                            {fileChip(r[kind])}
                          </div>
                        ) : (
                          <Tooltip title="由「活動結案」流程繳交">
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>未繳交</span>
                          </Tooltip>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {closed.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 24 }}>
                    採計期間內尚無已結案的活動;結案通過後即可上傳成果。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* (三) 社團資料更新 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 8px' }}>{AD_LABELS.ad5.group}</div>
        <ItemRow
          score={byKey.ad5}
          extra={
            <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--focus)', padding: 0 }} onClick={() => navigate('/members')}>
              前往成員列表 <RightOutlined style={{ fontSize: 10 }} />
            </button>
          }
        />
        <ItemRow
          score={byKey.ad6}
          extra={
            <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--focus)', padding: 0 }} onClick={() => navigate('/club-settings')}>
              前往管理項目 <RightOutlined style={{ fontSize: 10 }} />
            </button>
          }
        />
      </div>

      {/* (四) 參與會議與活動 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 8px' }}>{AD_LABELS.ad7.group}</div>
        <ItemRow
          score={byKey.ad7}
          extra={
            <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--focus)', padding: 0 }} onClick={() => navigate('/signup')}>
              前往線上報名 <RightOutlined style={{ fontSize: 10 }} />
            </button>
          }
        />
        <ItemRow score={byKey.ad8} />
      </div>

      {/* (五) 加減分 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 8px' }}>{AD_LABELS.adj.group}</div>
        <ItemRow
          score={byKey.adj}
          extra={
            <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--focus)', padding: 0 }} onClick={() => navigate('/violations')}>
              查看勸導紀錄 <RightOutlined style={{ fontSize: 10 }} />
            </button>
          }
        />
      </div>

      {/* 五獎項 */}
      <div style={{ fontSize: 15, fontWeight: 600, margin: '26px 0 4px' }}>競賽獎項資料</div>
      <div style={{ fontSize: 13, color: 'var(--steel)' }}>
        各獎項的評分項目與資料上傳;無論是否已線上報名皆可先行準備。
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {AWARDS.map((award) => {
          const p = uploadProgress(award)
          return (
            <div
              key={award.key}
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/eval/award/${award.key}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/eval/award/${award.key}`)
                }
              }}
              style={{ padding: '16px 18px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{award.name}</div>
                <RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>{award.brief}</div>
              <div style={{ fontSize: 12, marginTop: 10 }}>
                已上傳 <span className="num" style={{ fontWeight: 600 }}>{p.done}</span>
                <span className="num" style={{ color: 'var(--steel)' }}>/{p.total}</span> 項
              </div>
            </div>
          )
        })}
      </div>

      <FilePreview file={preview} open={previewOpen} onClose={() => setPreviewOpen(false)} afterClose={() => setPreview(null)} />
    </div>
  )
}
