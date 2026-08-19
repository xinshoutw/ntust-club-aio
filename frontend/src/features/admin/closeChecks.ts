// 結案的繳交確認:承辦人逐項確認,未確認之項目評鑑以 0 分計(核准時隨 body 落庫)。
import { MIN_PHOTOS } from '../eval/scoring'

export const SUBMISSION_CHECKS = [
  { key: 'photos', label: '活動照片' },
  { key: 'report', label: '成果報告表' },
  { key: 'reflections', label: '學習心得' },
] as const

export type CheckKey = (typeof SUBMISSION_CHECKS)[number]['key']

export interface ConfirmableReport {
  videoUrl?: string
  highlights: string
  reflections: unknown[]
  photosConfirmed: boolean
  reportConfirmed: boolean
  reflectionsConfirmed: boolean
}

/** 繳交確認的預設勾選:已落庫的確認**且**內容達採計門檻才預設打勾。
 *
 * 兩邊都要看 —— 核准會用送出的三個值整組覆寫舊值,而遷移件帶的是舊系統的確認旗標,
 * 一律預設全勾等於承辦沒動它就把舊庫的「未繳」翻成「已繳」。反向也不會誤判:
 * 判定只決定預設值,承辦核實後仍可自行勾回。
 *
 * 門檻取的是各旗標實際控制的評鑑項目(ad2 照片、ad3 報告表、ad4 心得),
 * 不是結案送件的下限 —— 送件下限是社團端的事,這裡決定的是採不採計。
 */
export const defaultConfirmations = (
  report: ConfirmableReport | undefined,
  photoCount: number,
): Record<CheckKey, boolean> => ({
  photos: !!report && report.photosConfirmed && (photoCount >= MIN_PHOTOS || !!report.videoUrl),
  report: !!report?.reportConfirmed && !!report.highlights.trim(),
  reflections: !!report?.reflectionsConfirmed && report.reflections.length > 0,
})
