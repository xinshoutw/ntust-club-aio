// 行政端行政分審核 API 層(/admin/eval,權限鍵 aeval):
// 分數計算/調整套用皆在後端,前端只讀 FinalScore;調整留痕於 eval_adjustments(revert=註銷不硬刪)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { toFinalScores, type AdScoreOut } from './eval'
import type { AdKey, FinalScore } from '../features/eval/scoring'

// ---- 後端 shape(backend/app/api/v1/admin_eval.py)----

// 總覽只回總分:逐項明細各社 9 列 × 全校社團數,清單頁一列也用不到
interface AdminEvalClubOut {
  club_id: number
  club_name: string
  attribute: string | null
  year: number
  total: number
}

interface AdjustmentOut {
  id: number
  kind: string // admin_score_override / merit_bonus
  value: Record<string, unknown> // {key, score} 或 {score}
  reason: string
  revoked: boolean
  created_at: string
}

interface AdminEvalDetailOut {
  club_id: number
  club_name: string
  year: number
  total: number
  scores: AdScoreOut[]
  adjustments: AdjustmentOut[]
}

// ---- 前端型別 ----

export interface AdminEvalClub {
  clubId: number
  clubName: string
  attribute: string | null
  year: number
  total: number
}

export interface EvalAdjustment {
  id: number
  kind: 'admin_score_override' | 'merit_bonus'
  key?: AdKey
  score: number
  reason: string
  revoked: boolean
  createdAt: string
}

export interface AdminEvalDetail {
  clubId: number
  clubName: string
  year: number
  total: number
  scores: FinalScore[]
  adjustments: EvalAdjustment[]
  /** 現行表現優良加分(最新未註銷 merit_bonus;無則 0) */
  merit: number
  /** 各項現行調整的原因(tooltip 用;鍵=已調整的 ad key) */
  overrideReasons: Partial<Record<AdKey, string>>
}

// ---- 轉換 ----

const toAdjustment = (a: AdjustmentOut): EvalAdjustment => ({
  id: a.id,
  kind: a.kind as EvalAdjustment['kind'],
  key: typeof a.value.key === 'string' ? (a.value.key as AdKey) : undefined,
  score: typeof a.value.score === 'number' ? a.value.score : 0,
  reason: a.reason,
  revoked: a.revoked,
  createdAt: dayjs(a.created_at).format('YYYY/MM/DD HH:mm'),
})

const toClub = (c: AdminEvalClubOut): AdminEvalClub => ({
  clubId: c.club_id,
  clubName: c.club_name,
  attribute: c.attribute,
  year: c.year,
  total: c.total,
})

const toDetail = (d: AdminEvalDetailOut): AdminEvalDetail => {
  // 後端依 id 降冪回傳:第一筆未註銷者即現行值
  const adjustments = d.adjustments.map(toAdjustment)
  const merit = adjustments.find((a) => a.kind === 'merit_bonus' && !a.revoked)?.score ?? 0
  const overrideReasons: Partial<Record<AdKey, string>> = {}
  for (const a of adjustments) {
    if (a.kind === 'admin_score_override' && !a.revoked && a.key && !(a.key in overrideReasons)) {
      overrideReasons[a.key] = a.reason
    }
  }
  return {
    clubId: d.club_id,
    clubName: d.club_name,
    year: d.year,
    total: d.total,
    scores: toFinalScores(d.scores),
    adjustments,
    merit,
    overrideReasons,
  }
}

// ---- 查詢 ----

const keys = {
  all: ['adminEval'] as const,
  clubs: (page: number) => ['adminEval', 'clubs', page] as const,
  detail: (clubId: number) => ['adminEval', 'detail', clubId] as const,
}

export const adminEvalKeys = keys

export const EVAL_CLUBS_PAGE_SIZE = 20

/** 各社行政分:伺服器端分頁(分數只算這一頁,社團名升冪由後端排) */
export function useAdminEvalClubs(page: number) {
  return useQuery({
    queryKey: keys.clubs(page),
    queryFn: () =>
      apiPaged<AdminEvalClubOut[]>(
        `/admin/eval/clubs${qs({ page, page_size: EVAL_CLUBS_PAGE_SIZE })}`,
      ).then(({ data, total }) => ({ rows: data.map(toClub), total })),
  })
}

export function useAdminEvalDetail(clubId: number | null) {
  return useQuery({
    queryKey: keys.detail(clubId ?? 0),
    enabled: clubId != null,
    // 不留前一社的資料:這份查詢只以 clubId 為鍵,沿用舊值等於把 A 社的分數
    // 攤在 B 社的彈窗上,而彈窗的調整動作照樣可按
    queryFn: () => api<AdminEvalDetailOut>(`/admin/eval/clubs/${clubId}`).then(toDetail),
  })
}

// ---- 調整(override/revert/merit;reason 後端必填)----

export interface OverrideInput {
  key: AdKey
  score: number
  reason: string
}

export interface RevertInput {
  key: AdKey
  reason: string
}

export interface MeritInput {
  score: number
  reason: string
}

export function useAdminEvalMutations(clubId: number | null) {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const post = (path: string, body: Record<string, unknown>) =>
    api<{ total: number; scores: AdScoreOut[] }>(`/admin/eval/clubs/${clubId}/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  const override = useMutation({
    mutationFn: (v: OverrideInput) => post('override', { key: v.key, score: v.score, reason: v.reason }),
    onSuccess: invalidate,
  })
  const revert = useMutation({
    mutationFn: (v: RevertInput) => post('revert', { key: v.key, reason: v.reason }),
    onSuccess: invalidate,
  })
  const merit = useMutation({
    mutationFn: (v: MeritInput) => post('merit', { score: v.score, reason: v.reason }),
    onSuccess: invalidate,
  })
  return { override, revert, merit }
}
