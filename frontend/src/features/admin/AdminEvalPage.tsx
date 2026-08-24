import { useEffect, useState } from 'react'
import { App, Button, Input, InputNumber, Modal, Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager } from '../../components/ui/tableControls'
import type { AdKey } from '../eval/scoring'
import { AD_LABELS } from '../eval/types'
import {
  EVAL_CLUBS_PAGE_SIZE,
  useAdminEvalClubs,
  useAdminEvalDetail,
  useAdminEvalMutations,
} from '../../api/adminEval'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'

// 調整彈窗三模式:手動調整分數 / 回到自動計算 / 表現優良加分(後端調整原因皆必填)
type AdjustMode =
  | { kind: 'override'; key: AdKey; max: number; current: number }
  | { kind: 'revert'; key: AdKey }
  | { kind: 'merit'; current: number }

const MODE_TITLE: Record<AdjustMode['kind'], string> = {
  override: '手動調整分數',
  revert: '回到自動計算結果',
  merit: '表現優良加分',
}

// 行政分審核:每項可手動調整分數或回到自動計算結果(即時生效,社團端同步)
export default function AdminEvalPage() {
  const { message } = App.useApp()
  const { club, clubId, setClub } = useAdminClub()
  const [clubPage, setClubPage] = useState(1)
  const clubsQuery = useAdminEvalClubs(clubPage)
  const clubs = clubsQuery.data?.rows
  const detailQuery = useAdminEvalDetail(clubId)
  const detail = detailQuery.data
  const { override, revert, merit } = useAdminEvalMutations(clubId)

  const [mode, setMode] = useState<AdjustMode | null>(null)
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  const saving = override.isPending || revert.isPending || merit.isPending

  // 換社團就關掉調整視窗:mutation 打的是「當下 context 的社團」,不是開窗那一刻的,
  // 開著換社團再送出會把分數落到另一社
  useEffect(() => setOpen(false), [clubId])

  const openAdjust = (m: AdjustMode) => {
    setMode(m)
    setScore('current' in m ? m.current : null)
    setReason('')
    setOpen(true)
  }

  const submit = () => {
    if (!mode || clubId == null) return
    if (mode.kind !== 'revert' && score == null) {
      message.error('請輸入分數')
      return
    }
    const trimmed = reason.trim()
    if (!trimmed) {
      message.error('請填寫調整原因')
      return
    }
    const done = (text: string) => () => {
      setOpen(false)
      message.success(text)
    }
    const onError = (e: Error) => message.error(e.message)
    if (mode.kind === 'override') {
      override.mutate(
        { key: mode.key, score: score as number, reason: trimmed },
        { onSuccess: done(`「${AD_LABELS[mode.key].name}」已調整為 ${score} 分`), onError },
      )
    } else if (mode.kind === 'revert') {
      revert.mutate(
        { key: mode.key, reason: trimmed },
        { onSuccess: done(`「${AD_LABELS[mode.key].name}」已回到自動計算結果`), onError },
      )
    } else {
      merit.mutate(
        { score: score as number, reason: trimmed },
        { onSuccess: done(`表現優良加分已登錄為 +${score} 分`), onError },
      )
    }
  }

  return (
    <div>
      <PageHeader
        title="評鑑行政分審核"
        sub={detail && <>{detail.year} 年社團競賽</>}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* 未分類=停社零活動的遷入舊社;下方清單只列啟用中社團,選單多出來的那疊選了也沒分數 */}
            <ClubSelect width={190} hideUnclassified />
            <div style={{ textAlign: 'right', height: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.1 }}>採用總分</div>
              <div style={{ lineHeight: 1.1 }}>
                <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{detail ? detail.total : '—'}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}> / 100</span>
              </div>
            </div>
          </div>
        }
      />

      {clubsQuery.isError || detailQuery.isError ? (
        // 核心 clubs/scores 查詢失敗:整頁主體以錯誤說明取代,避免誤呈現空表與「—」
        <div style={{ marginTop: 20 }}>
          <QueryError
            title="行政分資料載入失敗"
            error={clubsQuery.error ?? detailQuery.error}
            onRetry={() => {
              if (clubsQuery.isError) void clubsQuery.refetch()
              if (detailQuery.isError) void detailQuery.refetch()
            }}
          />
        </div>
      ) : (
      <>
      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        {/* 換社團時不沿用前一社的分數,載入期間鋪 Skeleton,不讓空表與「—」看起來像真值。
            下方的社團清單不在此範圍內:它由 clubsQuery 驅動,換社團時不該連同分頁器一起消失 */}
        <LoadingBlock pending={clubId != null && detailQuery.isPending} rows={8}>
        <table className="tb fixed" style={{ minWidth: 780 }} aria-label="行政分評分項目">
          {/* 評分項目吃剩餘寬(兩行說明允許換行);分數/動作固定 px */}
          <Cols widths={['auto', 110, 130, 300]} />
          <thead>
            <tr>
              <th scope="col">評分項目</th>
              <th scope="col" className="r">自動計算</th>
              <th scope="col" className="r">採用分數</th>
              <th scope="col">動作</th>
            </tr>
          </thead>
          <tbody>
            {(detail?.scores ?? []).map((s) => (
              <tr key={s.key} className="no-hover">
                <td>
                  <div style={{ fontWeight: 500 }}>{AD_LABELS[s.key].name}</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                    {AD_LABELS[s.key].group} · {s.note}
                  </div>
                </td>
                <td className="r num" style={{ fontSize: 13, color: 'var(--steel)' }}>
                  {s.auto} / {s.key === 'adj' ? '+5' : s.max}
                </td>
                <td className="r">
                  <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{s.final}</span>
                  {s.overridden && (
                    <Tooltip
                      title={`自動計算為 ${s.auto} 分${detail?.overrideReasons[s.key] ? `;原因:${detail.overrideReasons[s.key]}` : ''}`}
                    >
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>
                        已調整
                      </span>
                    </Tooltip>
                  )}
                </td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <Button
                      size="small"
                      onClick={() => openAdjust({ kind: 'override', key: s.key, max: s.max, current: s.final })}
                    >
                      手動調整分數
                    </Button>
                    <Button
                      size="small"
                      disabled={!s.overridden}
                      onClick={() => openAdjust({ kind: 'revert', key: s.key })}
                    >
                      回到自動計算結果
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
            {detail && (
              <tr className="no-hover">
                <td>
                  <div style={{ fontWeight: 500 }}>表現優良加分</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                    義務協助學校活動或校外性活動得獎。計入(五)加減分，最多 +5
                  </div>
                </td>
                <td className="r num" style={{ fontSize: 13, color: 'var(--steel)' }}>—</td>
                <td className="r num" style={{ fontSize: 15, fontWeight: 600 }}>+{detail.merit}</td>
                <td>
                  <Button size="small" onClick={() => openAdjust({ kind: 'merit', current: detail.merit })}>
                    登錄加分
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </LoadingBlock>
      </div>

      {/* 各社團行政分總覽:點列切換上方審核對象 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 6px' }}>各社團行政分</div>
        <LoadingBlock pending={clubsQuery.isPending} rows={8}>
        <table className="tb fixed" aria-label="各社團行政分">
          {/* 社團名吃剩餘寬並截斷;性質/總分固定 px */}
          <Cols widths={['auto', 120, 120]} />
          <thead>
            <tr>
              <th scope="col">社團</th>
              <th scope="col">性質</th>
              <th scope="col" className="r">行政分總分</th>
            </tr>
          </thead>
          <tbody>
            {(clubs ?? []).map((c) => (
              <tr
                key={c.clubId}
                onClick={() => setClub(c.clubName)}
                style={{ cursor: 'pointer', fontWeight: c.clubName === club ? 600 : undefined }}
              >
                <td className="cell-clip" title={c.clubName}>
                  <button
                    type="button"
                    className="row-open-btn"
                    aria-label={`切換審核社團為「${c.clubName || '未命名社團'}」`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setClub(c.clubName)
                    }}
                  >
                    {c.clubName}
                  </button>
                </td>
                <td>{c.attribute ?? '—'}</td>
                <td className="r num">{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </LoadingBlock>
        <Pager
          page={clubPage}
          pageSize={EVAL_CLUBS_PAGE_SIZE}
          total={clubsQuery.data?.total ?? 0}
          onChange={setClubPage}
        />
      </div>
      </>
      )}

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        afterClose={() => setMode(null)}
        onOk={submit}
        okText="儲存"
        cancelText="取消"
        confirmLoading={saving}
        width={420}
        destroyOnHidden
        title={
          mode && (
            <>
              {MODE_TITLE[mode.kind]}
              {mode.kind !== 'merit' ? ` · ${AD_LABELS[mode.key].name}` : ''}
            </>
          )
        }
      >
        {mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            {mode.kind === 'revert' ? (
              <div style={{ fontSize: 13, color: 'var(--steel)' }}>
                註銷此項的手動調整，改採系統自動計算結果
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>採用分數</div>
                <InputNumber
                  autoFocus
                  value={score}
                  onChange={setScore}
                  min={mode.kind === 'merit' ? 0 : mode.key === 'adj' ? -10 : 0}
                  max={mode.kind === 'merit' ? 5 : mode.key === 'adj' ? 5 : mode.max}
                  step={mode.kind === 'merit' ? 1 : 0.5}
                  precision={mode.kind === 'merit' ? 0 : undefined}
                  style={{ width: 120 }}
                />
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>調整原因</div>
              <Input.TextArea
                autoFocus={mode.kind === 'revert'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="簡述說明"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
