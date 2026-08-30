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

export const AD_LABELS: Record<AdKey, { name: string }> = {
  ad1: { name: '活動與課程申請' },
  ad2: { name: '結案照片 / 影片' },
  ad3: { name: '結案成果' },
  ad4: { name: '結案心得' },
  ad5: { name: '社員、幹部名單更新' },
  ad6: { name: '社團媒體經營' },
  ad7: { name: '負責人會議' },
  ad8: { name: '幹訓參與' },
  adj: { name: '表現優良 / 違規記點' },
}

const EXT_TYPE: Record<string, EvalFileType> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
  tif: 'image', tiff: 'image', heic: 'image', heif: 'image', avif: 'image',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc',
}

export function fileTypeOf(name: string): EvalFileType {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TYPE[ext] ?? 'other'
}
