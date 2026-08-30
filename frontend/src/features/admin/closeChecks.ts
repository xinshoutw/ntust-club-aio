// 結案的繳交確認:承辦人逐項確認,未確認之項目評鑑以 0 分計(核准時隨 body 落庫)。
import { MIN_PHOTOS, MIN_REFLECTIONS } from '../activities/types'

export const SUBMISSION_CHECKS = [
  { key: 'photos', label: '活動照片' },
  { key: 'report', label: '成果報告表' },
  { key: 'reflections', label: '學習心得' },
] as const

export type CheckKey = (typeof SUBMISSION_CHECKS)[number]['key']

export interface ConfirmableReport {
  videoUrl?: string
  reflections: unknown[]
  photosConfirmed: boolean
  reportConfirmed: boolean
  reflectionsConfirmed: boolean
}

/** 繳交確認的預設勾選:已落庫的確認**且**內容達門檻才預設打勾。
 *
 * 評鑑的 ad2–ad4 完全以送出去的勾選狀態為準(decisions.md D-14),所以這裡算的
 * 只是初值:承辦核實後勾回去就算數,社團交紙本也是走這條。
 *
 * 兩邊都要看 —— 核准會用送出的三個值整組覆寫舊值,而遷移件帶的是舊系統的確認旗標,
 * 一律預設全勾等於承辦沒動它就把舊庫的「未繳」翻成「已繳」。
 *
 * 門檻:照片 ≥5 張或有影片(彈窗紅字提示的那條)、報告表這一列存在、心得達送出下限 3 篇。
 */
export const defaultConfirmations = (
  report: ConfirmableReport | undefined,
  photoCount: number,
): Record<CheckKey, boolean> => ({
  photos: !!report && report.photosConfirmed && (photoCount >= MIN_PHOTOS || !!report.videoUrl),
  report: !!report?.reportConfirmed,
  reflections: !!report?.reflectionsConfirmed && report.reflections.length >= MIN_REFLECTIONS,
})
