import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { App, Button, Input, InputNumber, Modal, Select, Skeleton, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager, sortRows, type SortEntry } from '../../components/ui/tableControls'
import FilePreview from '../eval/FilePreview'
import type { EvalFile } from '../eval/types'
import {
  PRESENTATION_MAX,
  useClubAwardDetail,
  useSaveScore,
  useViewerAssignments,
  type AssignmentClub,
  type ClubAwardDetail,
  type ScoreSaveInput,
  type ViewerAssignment,
} from '../../api/viewer'

const PAGE_SIZE = 20

// 預設排序:未評分在前(待辦優先),組內社團名升冪;無排序 UI,固定鏈(client-side)
type ClubSortKey = 'scored' | 'club'
const CLUB_SORT: readonly SortEntry<ClubSortKey>[] = [
  { key: 'scored', dir: 1 },
  { key: 'club', dir: 1 },
]
const CLUB_CMPS: Record<ClubSortKey, (a: AssignmentClub, b: AssignmentClub) => number> = {
  scored: (a, b) => Number(a.scored) - Number(b.scored),
  club: (a, b) => a.clubName.localeCompare(b.clubName, 'zh-Hant'),
}

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** 分數顯示:去除浮點雜訊(rubric max_score 為 float) */
const fmtScore = (n: number) => Math.round(n * 100) / 100

// 評分(依獎項):選獎項分組 → 逐社團開評分彈窗;選取持久於 URL(?group=)。
// 以 group 為鍵而非 award:同一評審可能在同獎項被指派多個分組(A/B 組),award 當鍵會塌陷
export default function ViewerScorePage() {
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const assignmentsQuery = useViewerAssignments()
  const assignments = assignmentsQuery.data ?? []
  const groupParam = Number(params.get('group'))
  const award: ViewerAssignment | null =
    assignments.find((a) => a.groupId === groupParam) ?? assignments[0] ?? null

  const [page, setPage] = useState(1)
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  // 顯示序=排序後(「儲存並下一社團」的巡覽順序跟著顯示序走)
  const clubs = useMemo(() => sortRows(award?.clubs ?? [], CLUB_SORT, CLUB_CMPS), [award])
  const selectedClub = clubs.find((c) => c.clubId === selectedClubId) ?? null

  const openClub = (clubId: number) => {
    setSelectedClubId(clubId)
    setOpen(true)
  }

  // 儲存成功:next=false 關閉;next=true 切到同獎項下一個未評社團,無下一個則關閉
  const handleSaved = (next: boolean, total: number) => {
    const savedName = selectedClub?.clubName ?? ''
    if (!next) {
      message.success(`已儲存「${savedName}」評分(合計 ${fmtScore(total)} 分)`)
      setOpen(false)
      return
    }
    const idx = clubs.findIndex((c) => c.clubId === selectedClubId)
    const ordered = [...clubs.slice(idx + 1), ...clubs.slice(0, Math.max(idx, 0))]
    const nextClub = ordered.find((c) => !c.scored && c.clubId !== selectedClubId)
    if (nextClub) {
      message.success(`已儲存「${savedName}」評分,前往「${nextClub.clubName}」`)
      setSelectedClubId(nextClub.clubId)
    } else {
      message.success(`已儲存「${savedName}」評分,此獎項社團皆已完成評分`)
      setOpen(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="評分(依獎項)"
        sub={
          <Select
            size="small"
            loading={assignmentsQuery.isPending}
            value={award?.groupId}
            style={{ width: 220 }}
            onChange={(v) => {
              setParams({ group: String(v) })
              setPage(1)
            }}
            // 同獎項多分組時附分組名區辨,單一分組維持乾淨的獎項名
            options={assignments.map((a) => ({
              value: a.groupId,
              label:
                assignments.filter((x) => x.awardId === a.awardId).length > 1
                  ? `${a.awardName} · ${a.groupName}`
                  : a.awardName,
            }))}
          />
        }
      />

      {assignmentsQuery.isError ? (
        <div style={{ marginTop: 20 }}>
          <QueryError title="評分指派載入失敗" error={assignmentsQuery.error} onRetry={() => void assignmentsQuery.refetch()} />
        </div>
      ) : !assignmentsQuery.isPending && assignments.length === 0 ? (
        <div className="card" style={{ marginTop: 20, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
          尚未被指派評分
        </div>
      ) : (
        <Spin spinning={assignmentsQuery.isPending}>
          <div className="card" style={{ marginTop: 20, overflowX: 'auto', minHeight: assignmentsQuery.isPending ? 120 : undefined }}>
            <table className="tb dense fixed" style={{ minWidth: 560 }}>
              <Cols widths={['auto', 130, 90]} />
              <thead>
                <tr>
                  <th>社團</th>
                  <th>評分狀態</th>
                  <th>合計</th>
                </tr>
              </thead>
              <tbody>
                {clubs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => (
                  <tr key={c.clubId} className="click-tint" style={{ cursor: 'pointer' }} onClick={() => openClub(c.clubId)}>
                    <td
                      className="cell-clip"
                      title={c.attribute ? `${c.clubName}(${c.attribute})` : c.clubName}
                      style={{ fontWeight: 500 }}
                    >
                      {c.clubName}
                      {c.attribute && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--steel)' }}>{c.attribute}</span>}
                    </td>
                    <td style={{ fontSize: 13, color: c.scored ? '#1F6B45' : 'var(--steel)' }}>
                      {c.scored ? '已評分(可修改)' : '未評分'}
                      {c.presentationPending && (
                        <span style={{ marginLeft: 6, fontSize: 12, color: '#8A5A00' }}>簡報未評</span>
                      )}
                    </td>
                    <td className="num">{c.total != null ? fmtScore(c.total) : '—'}</td>
                  </tr>
                ))}
                {!assignmentsQuery.isPending && clubs.length === 0 && (
                  <tr className="no-hover">
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>此獎項沒有受評社團</td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager page={page} pageSize={PAGE_SIZE} total={clubs.length} onChange={setPage} />
          </div>
        </Spin>
      )}

      <ScoreModal
        award={award}
        clubId={selectedClubId}
        clubName={selectedClub?.clubName ?? ''}
        clubAttribute={selectedClub?.attribute}
        open={open}
        onClose={() => setOpen(false)}
        afterClose={() => setSelectedClubId(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}

// ---- 評分彈窗:左=受評資料(逐細項檔案,點擊就地預覽),右=評分面板 ----

function ScoreModal({
  award,
  clubId,
  clubName,
  clubAttribute,
  open,
  onClose,
  afterClose,
  onSaved,
}: {
  award: ViewerAssignment | null
  clubId: number | null
  clubName: string
  clubAttribute?: string
  open: boolean
  onClose: () => void
  afterClose: () => void
  onSaved: (next: boolean, total: number) => void
}) {
  const detailQuery = useClubAwardDetail(clubId, award?.awardId ?? '')
  const [preview, setPreview] = useState<EvalFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const openPreview = async (f: EvalFile) => {
    // docx 預覽需要原始檔內容(mammoth);伺服器檔案先抓回 blob 再開(比照 AwardDetailPage)
    if (f.type === 'doc' && !f.raw) {
      try {
        const blob = await (await fetch(f.url, { credentials: 'same-origin' })).blob()
        f = { ...f, raw: new File([blob], f.name) }
      } catch {
        // 抓取失敗:仍開啟預覽視窗,由 DocView 顯示無法預覽說明
      }
    }
    setPreview(f)
    setPreviewOpen(true)
  }

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        afterClose={afterClose}
        destroyOnHidden
        width={1000}
        footer={null}
        title={
          clubName && (
            <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}>
              <span>
                {award?.awardName} — {clubName}
              </span>
              {clubAttribute && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--steel)' }}>{clubAttribute}</span>}
            </span>
          )
        }
      >
        {detailQuery.isError ? (
          <QueryError compact title="受評資料載入失敗" error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        ) : !detailQuery.data || !award || clubId == null ? (
          // 彈窗立即開、內容 Skeleton,不等網路才開窗
          <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 8 }} />
        ) : (
          <ScorePanel
            key={clubId}
            award={award}
            clubId={clubId}
            detail={detailQuery.data}
            onSaved={onSaved}
            onPreview={(f) => void openPreview(f)}
          />
        )}
      </Modal>
      <FilePreview file={preview} open={previewOpen} onClose={() => setPreviewOpen(false)} afterClose={() => setPreview(null)} />
    </>
  )
}

// ---- 評分面板(key=club 重掛,狀態隨社團重置)----

function ScorePanel({
  award,
  clubId,
  detail,
  onSaved,
  onPreview,
}: {
  award: ViewerAssignment
  clubId: number
  detail: ClubAwardDetail
  onSaved: (next: boolean, total: number) => void
  onPreview: (f: EvalFile) => void
}) {
  const { message } = App.useApp()
  const save = useSaveScore()
  const panelRef = useRef<HTMLDivElement>(null)

  const [scores, setScores] = useState<Record<number, number | null>>(() => {
    const init: Record<number, number | null> = {}
    for (const i of detail.items) init[i.id] = detail.score?.items[i.id]?.score ?? null
    return init
  })
  const [comments, setComments] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const i of detail.items) init[i.id] = detail.score?.items[i.id]?.comment ?? ''
    return init
  })
  const [presentation, setPresentation] = useState<number | null>(detail.score?.presentationScore ?? null)
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<'save' | 'next' | null>(null)

  const itemsMax = detail.items.reduce((s, i) => s + i.maxScore, 0)
  const fullMax = itemsMax + (award.hasPresentation ? PRESENTATION_MAX : 0)
  const total =
    detail.items.reduce((s, i) => s + (scores[i.id] ?? 0), 0) + (award.hasPresentation ? (presentation ?? 0) : 0)

  const clearError = (key: string) => {
    if (!errors.has(key)) return
    setErrors((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const submit = (next: boolean) => {
    // 現場簡報選填:簡報晚於線上審查,允許先送細項分數、簡報後再補登
    const missing = detail.items.filter((i) => scores[i.id] == null).map((i) => String(i.id))
    if (missing.length) {
      setErrors(new Set(missing))
      message.error('所有評分細項皆須填寫')
      // 捲動到第一個紅框欄位(全站送出驗證慣例)
      setTimeout(() => {
        panelRef.current
          ?.querySelector('.ant-input-number-status-error')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 0)
      return
    }
    setErrors(new Set())
    setPending(next ? 'next' : 'save')
    const input: ScoreSaveInput = {
      items: detail.items.map((i) => ({
        rubricItemId: i.id,
        score: scores[i.id] as number,
        comment: comments[i.id],
      })),
      // 有簡報的獎項一律明給(清空欄位=送 null 清除);沒有的獎項省略,後端不允許帶值
      presentationScore: award.hasPresentation ? presentation : undefined,
    }
    save.mutate(
      { clubId, awardId: award.awardId, input },
      {
        // 成功後由父層決定關閉或切下一社團(切換即 key 重掛,pending 隨之重置)
        onSuccess: () => onSaved(next, total),
        onError: (e) => {
          message.error(e.message)
          setPending(null)
        },
      },
    )
  }

  return (
    <div ref={panelRef} style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
      {/* 左欄:受評資料(逐細項檔案) */}
      <div
        style={{
          flex: '1 1 45%',
          minWidth: 0,
          maxHeight: '62vh',
          overflowY: 'auto',
          paddingRight: 16,
          borderRight: '1px solid var(--line)',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 10 }}>受評資料</div>
        {detail.items.map((item, idx) => {
          const files = detail.uploads[item.id] ?? []
          const showGroup = !!item.groupLabel && item.groupLabel !== detail.items[idx - 1]?.groupLabel
          return (
            <div key={item.id} style={{ paddingTop: idx > 0 ? 12 : 0 }}>
              {showGroup && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--steel)', margin: '4px 0 6px' }}>{item.groupLabel}</div>
              )}
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
              {files.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>此項未繳交資料</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {files.map((f) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <button
                        type="button"
                        className="link-btn"
                        style={{ padding: 0, fontSize: 13, textAlign: 'left', overflowWrap: 'anywhere' }}
                        onClick={() => onPreview(f)}
                      >
                        {f.name}
                      </button>
                      <span className="num" style={{ fontSize: 12, color: 'var(--steel)', whiteSpace: 'nowrap' }}>
                        {fmtSize(f.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 右欄:評分面板 */}
      <div style={{ flex: '1 1 55%', minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '62vh' }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 4 }}>評分</div>
          {detail.items.map((item, idx) => {
            const key = String(item.id)
            const showGroup = !!item.groupLabel && item.groupLabel !== detail.items[idx - 1]?.groupLabel
            return (
              <div key={item.id} style={{ padding: '10px 0', borderTop: idx > 0 ? '1px solid var(--line)' : undefined }}>
                {showGroup && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--steel)', marginBottom: 6 }}>{item.groupLabel}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                  <InputNumber<number>
                    min={0}
                    max={item.maxScore}
                    value={scores[item.id]}
                    status={errors.has(key) ? 'error' : undefined}
                    onChange={(v) => {
                      setScores((prev) => ({ ...prev, [item.id]: v }))
                      clearError(key)
                    }}
                    style={{ width: 90 }}
                  />
                  <span className="num" style={{ fontSize: 12, color: 'var(--steel)', width: 36 }}>
                    /{fmtScore(item.maxScore)}
                  </span>
                </div>
                {item.help && (
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4, lineHeight: 1.7 }}>{item.help}</div>
                )}
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="評語(選填)"
                  value={comments[item.id] ?? ''}
                  onChange={(e) => setComments((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  style={{ marginTop: 8 }}
                />
              </div>
            )
          })}
          {award.hasPresentation && (
            <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500 }}>
                  現場簡報(<span className="num">{PRESENTATION_MAX}</span>)
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--steel)' }}>
                    選填,可於簡報後補登
                  </span>
                </div>
                <InputNumber<number>
                  min={0}
                  max={PRESENTATION_MAX}
                  precision={0}
                  value={presentation}
                  status={errors.has('presentation') ? 'error' : undefined}
                  onChange={(v) => {
                    setPresentation(v)
                    clearError('presentation')
                  }}
                  style={{ width: 90 }}
                />
                <span className="num" style={{ fontSize: 12, color: 'var(--steel)', width: 36 }}>
                  /{PRESENTATION_MAX}
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: 12,
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, fontSize: 13 }}>
            合計 <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{fmtScore(total)}</span>{' '}
            / <span className="num">{fmtScore(fullMax)}</span>
            {detail.score && (
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                上次儲存 <span className="num">{detail.score.submittedAt}</span>
              </div>
            )}
          </div>
          <Button onClick={() => submit(false)} loading={pending === 'save'} disabled={pending === 'next'}>
            儲存
          </Button>
          <Button type="primary" onClick={() => submit(true)} loading={pending === 'next'} disabled={pending === 'save'}>
            儲存並下一社團
          </Button>
        </div>
      </div>
    </div>
  )
}
