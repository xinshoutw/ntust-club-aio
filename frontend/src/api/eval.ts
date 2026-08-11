// 社團評鑑 API 層(/club/eval):snake_case ↔ camelCase 與日期轉換集中在此,頁面只碰 camelCase;
// 行政分各項分數/依據/調整標示由後端算好(services/scoring.py),前端 features/eval/scoring.ts 僅剩型別/展示用途;
// 檔案轉 EvalFile 的做法比照 api/activities.ts(fileUrl + mime 推導預覽型別)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { fileUrl } from './activities'
import { AD_MAX, type AdKey, type FinalScore } from '../features/eval/scoring'
import { fileTypeOf, type EvalFile, type EvalFileType } from '../features/eval/types'

// ---- 後端 schema(backend/app/schemas/eval.py)----

export interface AdScoreOut {
  key: string
  auto: number
  max: number
  note: string
  final: number
  overridden: boolean
}

interface AwardProgressOut {
  id: string
  name: string
  kind: string
  has_presentation: boolean
  is_weighted: boolean
  filled: number
  total: number
}

interface EvalOverviewOut {
  year: number
  window_start: string
  window_end: string
  scores: AdScoreOut[]
  total: number
  awards: AwardProgressOut[]
}

interface EvalFileOut {
  id: number // eval_uploads.id
  file_id: string
  original_name: string
  size: number
  mime: string
  created_at: string
}

interface RubricItemOut {
  id: number
  item_key: string
  name: string
  max_score: number
  help: string
  group_label: string | null
  group_weight: number | null
  is_admin_item: boolean
  sort: number
  uploads: EvalFileOut[]
}

interface AwardDetailOut {
  id: string
  name: string
  kind: string
  has_presentation: boolean
  is_weighted: boolean
  year: number
  items: RubricItemOut[]
}

// ---- 前端型別 ----

export interface AwardProgress {
  id: string
  name: string
  filled: number
  total: number
}

export interface EvalOverview {
  year: number
  windowLabel: string // 「116 年社團競賽」
  windowRange: string // 「YYYY/MM/DD – YYYY/MM/DD」
  scores: FinalScore[]
  total: number
  awards: AwardProgress[]
}

/** 上傳槽位檔案:EvalFile(FilePreview 可直接吃)+ 刪除用的上傳紀錄 id */
export interface AwardUploadFile extends EvalFile {
  uploadId: number
}

export interface AwardRubricItem {
  id: number
  itemKey: string
  name: string
  maxScore: number
  help: string
  groupLabel: string // group_label + group_weight 組好的顯示字串
  isAdminItem: boolean // ad1–ad8:自動採計,無上傳槽位
  uploads: AwardUploadFile[]
}

export interface AwardDetail {
  id: string
  name: string
  year: number
  items: AwardRubricItem[]
}

// ---- 轉換 ----

const slashDate = (iso: string): string => dayjs(iso).format('YYYY/MM/DD')

const isAdKey = (k: string): k is AdKey => k in AD_MAX

const toFinalScore = (s: AdScoreOut): FinalScore => ({
  key: s.key as AdKey,
  auto: s.auto,
  max: s.max,
  note: s.note,
  final: s.final,
  overridden: s.overridden,
})

/** 後端 AdScoreOut → FinalScore(僅保留已知 ad 鍵;admin 端共用) */
export const toFinalScores = (rows: AdScoreOut[]): FinalScore[] =>
  rows.filter((s) => isAdKey(s.key)).map(toFinalScore)

const toOverview = (o: EvalOverviewOut): EvalOverview => ({
  year: o.year,
  windowLabel: `${o.year} 年社團競賽`,
  windowRange: `${slashDate(o.window_start)} – ${slashDate(o.window_end)}`,
  scores: toFinalScores(o.scores),
  total: o.total,
  awards: o.awards.map((a) => ({ id: a.id, name: a.name, filled: a.filled, total: a.total })),
})

const typeFromMime = (mime: string, name: string): EvalFileType => {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('msword') || mime.includes('wordprocessingml')) return 'doc'
  return fileTypeOf(name)
}

const toUploadFile = (f: EvalFileOut): AwardUploadFile => ({
  uploadId: f.id,
  id: f.file_id,
  name: f.original_name,
  type: typeFromMime(f.mime, f.original_name),
  size: f.size,
  url: fileUrl(f.file_id),
  uploadedAt: slashDate(f.created_at),
})

const groupLabelOf = (i: RubricItemOut): string => {
  if (!i.group_label) return ''
  const weight = i.group_weight != null ? ` ${Math.round(i.group_weight * 100)}%` : ''
  return `${i.group_label}${weight}`
}

const toAwardDetail = (a: AwardDetailOut): AwardDetail => ({
  id: a.id,
  name: a.name,
  year: a.year,
  items: a.items.map((i) => ({
    id: i.id,
    itemKey: i.item_key,
    name: i.name,
    maxScore: i.max_score,
    help: i.help,
    groupLabel: groupLabelOf(i),
    isAdminItem: i.is_admin_item,
    uploads: i.uploads.map(toUploadFile),
  })),
})

// ---- 查詢 ----

const keys = {
  all: ['eval'] as const,
  overview: ['eval', 'overview'] as const,
  award: (id: string) => ['eval', 'award', id] as const,
}

export const evalKeys = keys

export function useEvalOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => api<EvalOverviewOut>('/club/eval/overview').then(toOverview),
  })
}

export function useAwardDetail(awardId: string | undefined) {
  return useQuery({
    queryKey: keys.award(awardId ?? ''),
    enabled: !!awardId,
    queryFn: () => api<AwardDetailOut>(`/club/eval/awards/${awardId}`).then(toAwardDetail),
    retry: false, // 真的不存在(404)不必重試;失敗由頁面給重試鈕(AwardDetailPage)
  })
}

// ---- 上傳/刪除(上傳走 FormData,client.ts 已處理 boundary 與 CSRF)----

export function useEvalUploadMutations(awardId: string) {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })
  const upload = useMutation({
    mutationFn: ({ itemId, file }: { itemId: number; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return api<EvalFileOut>(`/club/eval/awards/${awardId}/items/${itemId}/files`, {
        method: 'POST',
        body: fd,
      }).then(toUploadFile)
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: ({ itemId, uploadId }: { itemId: number; uploadId: number }) =>
      api<null>(`/club/eval/awards/${awardId}/items/${itemId}/files/${uploadId}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  })
  return { upload, remove }
}
