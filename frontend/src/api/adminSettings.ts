// 系統設定 API 層(權限鍵 asetting):GET/PUT /admin/settings,欄位對照 backend schemas/settings.py。
// 日期一律 ISO 字串存 system_settings;評鑑視窗以民國年推導採計區間
// (year 116 → 2026/02/01–2027/01/31,即 start=(year+1910)-02-01、end=(year+1911)-01-31)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { keys as bookingKeys } from './adminBookings'
import type { BudgetCategory } from './clubConfig'

const DATE_FMT = 'YYYY/MM/DD'

export interface SystemSettings {
  /** 固定場地借用受理期間(YYYY/MM/DD;皆空=不開放) */
  fixedFrom?: string
  fixedUntil?: string
  loanBefore: number // 器材借用:活動前緩衝(工作天)
  loanAfter: number
  closeLockDays: number
  docMb: number
  imgMb: number
  zipMb: number
  videoMb: number
  attachmentTotalMb: number // 活動申請附件加總上限(MB)
  maintenanceTotalMb: number // 空間報修佐證加總上限(MB,含影片)
  closePhotoTotalMb: number // 活動結案照片加總上限(MB)
  perClubGib: number // 單一社團配額(GiB);系統總量改用後端實際磁碟空間
  evalYear: number // 評鑑年度(民國年)
  violItems: string[]
  budgetCats: BudgetCategory[] // 經費科目 {name, hint}
}

interface SettingsOut {
  fixed_booking_window: { open_from: string | null; open_until: string | null }
  equipment_workday_buffer: { before: number; after: number }
  close_lock_days: number
  upload_limits: { doc: number; img: number; zip: number; video: number }
  activity_attachment_total_mb: number
  maintenance_total_mb: number
  close_photo_total_mb: number
  storage_limits: { per_club_gib: number }
  eval_window: { year: number; start: string; end: string }
  violation_items: string[]
  budget_categories: BudgetCategory[]
}

const toSettings = (s: SettingsOut): SystemSettings => ({
  fixedFrom: s.fixed_booking_window.open_from
    ? dayjs(s.fixed_booking_window.open_from).format(DATE_FMT)
    : undefined,
  fixedUntil: s.fixed_booking_window.open_until
    ? dayjs(s.fixed_booking_window.open_until).format(DATE_FMT)
    : undefined,
  loanBefore: s.equipment_workday_buffer.before,
  loanAfter: s.equipment_workday_buffer.after,
  closeLockDays: s.close_lock_days,
  docMb: s.upload_limits.doc,
  imgMb: s.upload_limits.img,
  zipMb: s.upload_limits.zip,
  videoMb: s.upload_limits.video,
  attachmentTotalMb: s.activity_attachment_total_mb,
  maintenanceTotalMb: s.maintenance_total_mb,
  closePhotoTotalMb: s.close_photo_total_mb,
  perClubGib: s.storage_limits.per_club_gib,
  evalYear: s.eval_window.year,
  violItems: s.violation_items,
  budgetCats: s.budget_categories,
})

/** 民國年 → 評鑑採計區間(2/1 起算一年):116 → 2026-02-01 ~ 2027-01-31 */
export const evalWindowOf = (year: number): { start: string; end: string } => ({
  start: `${year + 1910}-02-01`,
  end: `${year + 1911}-01-31`,
})

/** 評鑑年度下拉的顯示文字 */
export const evalYearLabel = (year: number): string => {
  const { start, end } = evalWindowOf(year)
  return `${year} 年(採計 ${dayjs(start).format(DATE_FMT)} – ${dayjs(end).format(DATE_FMT)})`
}

const toIsoDate = (display: string): string => dayjs(display, DATE_FMT).format('YYYY-MM-DD')

const keys = { all: ['adminSettings'] as const }

export function useSystemSettings() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => api<SettingsOut>('/admin/settings').then(toSettings),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: SystemSettings) =>
      api<SettingsOut>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          fixed_booking_window: {
            open_from: v.fixedFrom ? toIsoDate(v.fixedFrom) : null,
            open_until: v.fixedUntil ? toIsoDate(v.fixedUntil) : null,
          },
          equipment_workday_buffer: { before: v.loanBefore, after: v.loanAfter },
          close_lock_days: v.closeLockDays,
          upload_limits: { doc: v.docMb, img: v.imgMb, zip: v.zipMb, video: v.videoMb },
          activity_attachment_total_mb: v.attachmentTotalMb,
          maintenance_total_mb: v.maintenanceTotalMb,
          close_photo_total_mb: v.closePhotoTotalMb,
          storage_limits: { per_club_gib: v.perClubGib },
          eval_window: { year: v.evalYear, ...evalWindowOf(v.evalYear) },
          violation_items: v.violItems,
          budget_categories: v.budgetCats,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all })
      // 受理期間也決定側欄「固定場地借用」是否反灰,那份開放窗查詢另屬借用 domain
      void qc.invalidateQueries({ queryKey: bookingKeys.fixedWindow })
    },
  })
}
