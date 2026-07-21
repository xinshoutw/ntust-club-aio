// 評審端 API 層(/viewer):snake_case ↔ camelCase 與日期轉換集中在此,頁面只碰 camelCase;
// 受評社團上傳檔轉 EvalFile(FilePreview 可直接吃),做法比照 api/eval.ts(fileUrl + 副檔名推導預覽型別)
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { fileUrl } from './activities'
import { fileTypeOf, type EvalFile } from '../features/eval/types'

/** 現場簡報固定配分(awards.has_presentation;非 rubric item,存 ReviewScore.presentation_score) */
export const PRESENTATION_MAX = 20

// ---- 後端 schema(backend viewer router)----

interface ViewerRubricItemOut {
  id: number
  item_key: string
  name: string
  max_score: number
  help: string
  group_label: string | null
  group_weight: number | null
  sort: number
}

interface AssignmentClubOut {
  club_id: number
  club_name: string
  attribute: string | null
  scored: boolean
  total: number | null
  submitted_at: string | null
}

interface AssignmentOut {
  award_id: string
  award_name: string
  has_presentation: boolean
  group_id: number
  group_name: string
  year: number
  items: ViewerRubricItemOut[]
  clubs: AssignmentClubOut[]
}

interface ViewerUploadOut {
  id: string // file id(組下載/預覽 URL)
  name: string
  size: number
}

interface ScoreItemOut {
  score: number
  comment: string
}

interface ScoreOut {
  items: Record<string, ScoreItemOut> // key = rubric_item_id
  presentation_score: number | null
  submitted_at: string
}

interface ClubAwardDetailOut {
  club: { id: number; name: string; attribute: string | null; kind: string }
  items: ViewerRubricItemOut[]
  uploads: Record<string, ViewerUploadOut[]> // key = rubric_item_id
  score: ScoreOut | null
}

interface DoneRowOut {
  award_id: string
  award_name: string
  club_id: number
  club_name: string
  total: number
  submitted_at: string
}

// ---- 前端型別 ----

export interface ViewerRubricItem {
  id: number
  itemKey: string
  name: string
  maxScore: number
  help: string
  groupLabel: string // group_label + group_weight 組好的顯示字串;無分組為 ''
  sort: number
}

export interface AssignmentClub {
  clubId: number
  clubName: string
  attribute?: string
  scored: boolean
  total?: number
  submittedAt?: string // YYYY/MM/DD HH:mm
}

export interface ViewerAssignment {
  awardId: string
  awardName: string
  hasPresentation: boolean
  groupId: number
  groupName: string
  year: number
  items: ViewerRubricItem[]
  clubs: AssignmentClub[]
}

export interface ViewerScoreItem {
  score: number
  comment: string
}

export interface ViewerScore {
  items: Record<number, ViewerScoreItem>
  presentationScore?: number
  submittedAt: string // YYYY/MM/DD HH:mm
}

export interface ClubAwardDetail {
  club: { id: number; name: string; attribute?: string; kind: string }
  items: ViewerRubricItem[]
  uploads: Record<number, EvalFile[]> // key = rubric item id
  score: ViewerScore | null
}

export interface DoneRow {
  awardId: string
  awardName: string
  clubId: number
  clubName: string
  total: number
  submittedAt: string // YYYY/MM/DD HH:mm
}

// ---- 轉換 ----

const dateTime = (iso: string): string => dayjs(iso).format('YYYY/MM/DD HH:mm')

const groupLabelOf = (i: ViewerRubricItemOut): string => {
  if (!i.group_label) return ''
  const weight = i.group_weight != null ? ` ${Math.round(i.group_weight * 100)}%` : ''
  return `${i.group_label}${weight}`
}

const toRubricItem = (i: ViewerRubricItemOut): ViewerRubricItem => ({
  id: i.id,
  itemKey: i.item_key,
  name: i.name,
  maxScore: i.max_score,
  help: i.help,
  groupLabel: groupLabelOf(i),
  sort: i.sort,
})

const toAssignmentClub = (c: AssignmentClubOut): AssignmentClub => ({
  clubId: c.club_id,
  clubName: c.club_name,
  attribute: c.attribute ?? undefined,
  scored: c.scored,
  total: c.total ?? undefined,
  submittedAt: c.submitted_at ? dateTime(c.submitted_at) : undefined,
})

const toAssignment = (a: AssignmentOut): ViewerAssignment => ({
  awardId: a.award_id,
  awardName: a.award_name,
  hasPresentation: a.has_presentation,
  groupId: a.group_id,
  groupName: a.group_name,
  year: a.year,
  items: a.items.map(toRubricItem),
  clubs: a.clubs.map(toAssignmentClub),
})

// 上傳檔 → EvalFile:型別以副檔名推導(後端未附 mime);上傳時間後端未附,留空(FilePreview 標題自動省略)
const toUploadFile = (f: ViewerUploadOut): EvalFile => ({
  id: f.id,
  name: f.name,
  type: fileTypeOf(f.name),
  size: f.size,
  url: fileUrl(f.id),
  uploadedAt: '',
})

const toScore = (s: ScoreOut): ViewerScore => {
  const items: Record<number, ViewerScoreItem> = {}
  for (const [id, v] of Object.entries(s.items)) items[Number(id)] = { score: v.score, comment: v.comment }
  return {
    items,
    presentationScore: s.presentation_score ?? undefined,
    submittedAt: dateTime(s.submitted_at),
  }
}

const toDetail = (d: ClubAwardDetailOut): ClubAwardDetail => {
  const uploads: Record<number, EvalFile[]> = {}
  for (const [id, files] of Object.entries(d.uploads)) uploads[Number(id)] = files.map(toUploadFile)
  return {
    club: {
      id: d.club.id,
      name: d.club.name,
      attribute: d.club.attribute ?? undefined,
      kind: d.club.kind,
    },
    items: d.items.map(toRubricItem),
    uploads,
    score: d.score ? toScore(d.score) : null,
  }
}

const toDoneRow = (r: DoneRowOut): DoneRow => ({
  awardId: r.award_id,
  awardName: r.award_name,
  clubId: r.club_id,
  clubName: r.club_name,
  total: r.total,
  submittedAt: dateTime(r.submitted_at),
})

// ---- 查詢 ----

export interface DoneListParams {
  sort?: string // 白名單:submitted_at/total/club/award(- 前綴=降冪);未帶=後端預設 -submitted_at
  page: number
  pageSize: number
}

const keys = {
  all: ['viewer'] as const,
  assignments: ['viewer', 'assignments'] as const,
  clubAward: (clubId: number | null, awardId: string) => ['viewer', 'club-award', clubId, awardId] as const,
  done: (p: DoneListParams) => ['viewer', 'done', p] as const,
}

export const viewerKeys = keys

export function useViewerAssignments() {
  return useQuery({
    queryKey: keys.assignments,
    queryFn: () => api<AssignmentOut[]>('/viewer/assignments').then((rows) => rows.map(toAssignment)),
  })
}

export function useClubAwardDetail(clubId: number | null, awardId: string) {
  return useQuery({
    queryKey: keys.clubAward(clubId, awardId),
    enabled: clubId != null && !!awardId,
    queryFn: () => api<ClubAwardDetailOut>(`/viewer/clubs/${clubId}/awards/${awardId}`).then(toDetail),
    // 評分面板以載入資料初始化本地草稿(key=club 重掛):彈窗關閉即丟棄快取,
    // 下次開啟必為 isPending → Skeleton → 以最新資料重掛,避免以儲存前的舊快取初始化
    gcTime: 0,
  })
}

export function useViewerDone(p: DoneListParams) {
  return useQuery({
    queryKey: keys.done(p),
    queryFn: () =>
      apiPaged<DoneRowOut[]>(`/viewer/done${qs({ sort: p.sort, page: p.page, page_size: p.pageSize })}`).then(
        ({ data, total }) => ({ rows: data.map(toDoneRow), total }),
      ),
    placeholderData: keepPreviousData,
  })
}

// ---- 儲存評分(upsert,可重複修改)----

export interface ScoreSaveInput {
  /** 必須整份涵蓋該獎項全部細項 */
  items: { rubricItemId: number; score: number; comment?: string }[]
  /** 僅 has_presentation 獎項 */
  presentationScore?: number
}

export function useSaveScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clubId, awardId, input }: { clubId: number; awardId: string; input: ScoreSaveInput }) =>
      api<ScoreOut>(`/viewer/clubs/${clubId}/awards/${awardId}/score`, {
        method: 'PUT',
        body: JSON.stringify({
          items: input.items.map((i) => ({
            rubric_item_id: i.rubricItemId,
            score: i.score,
            // 空評語不送(JSON.stringify 丟棄 undefined 鍵)
            comment: i.comment?.trim() || undefined,
          })),
          presentation_score: input.presentationScore,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
  })
}
