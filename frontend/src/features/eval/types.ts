import type { AdKey } from './scoring'

export type EvalFileType = 'image' | 'pdf' | 'doc' | 'other'

export interface EvalFile {
  id: string
  name: string
  type: EvalFileType
  size: number
  url: string // objectURL 或 data URL;mock 示意檔可為空字串
  hash?: string // SHA-256,照片重複偵測用
  uploadedAt: string
  raw?: File // 本次 session 上傳的原始檔(docx 預覽用)
}

// 每個結案活動的成果上傳(行政分 ad2–ad4 依此計算)
export interface ActivityResult {
  activityId: string
  photos: EvalFile[]
  videoLink: string
  report: EvalFile | null
  feedback: EvalFile | null
}

// 與 data-model awards.slug 對齊:club/finance/activity/result/leader
export type AwardKey = 'club' | 'finance' | 'activity' | 'result' | 'leader'

export interface AwardSlot {
  key: string
  group: string
  name: string
  weight: string
  hints: string[]
  auto?: string // 非上傳槽位(自動採計/現場評分)的說明
}

export interface AwardDef {
  key: AwardKey
  name: string
  brief: string
  slots: AwardSlot[]
}

export const AD_LABELS: Record<AdKey, { group: string; name: string }> = {
  ad1: { group: '(一) 活動及社課申請 15%', name: '活動申請' },
  ad2: { group: '(二) 活動/社課成果 60%', name: '照片/影片' },
  ad3: { group: '(二) 活動/社課成果 60%', name: '成果單' },
  ad4: { group: '(二) 活動/社課成果 60%', name: '心得回饋' },
  ad5: { group: '(三) 社團資料更新狀況 15%', name: '社員、幹部名單更新' },
  ad6: { group: '(三) 社團資料更新狀況 15%', name: '社團網頁經營' },
  ad7: { group: '(四) 參與會議與活動 10%', name: '負責人會議' },
  ad8: { group: '(四) 參與會議與活動 10%', name: '幹訓' },
  adj: { group: '(五) 加減分', name: '表現優良/違規記點' },
}

const EXT_TYPE: Record<string, EvalFileType> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc',
}

export function fileTypeOf(name: string): EvalFileType {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TYPE[ext] ?? 'other'
}
