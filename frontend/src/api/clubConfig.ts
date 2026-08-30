// 社團端執行組態:上傳上限(依申請性質)與經費科目({name, hint})。
// 這些值一律由後端供給(system_settings 為權威),前端不再硬編碼常數。
import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface BudgetCategory {
  name: string
  hint: string
}

export interface UploadLimits {
  activityAttachmentBytes: number
  maintenanceBytes: number
  closePhotoBytes: number
  docBytes: number
  imgBytes: number
  videoBytes: number
}

export interface ClubConfig {
  uploadLimits: UploadLimits
  /** 器材借用區間上限(天,含頭含尾);後端 booking_service.MAX_LOAN_DAYS 為權威 */
  equipmentLoanMaxDays: number
  budgetCategories: BudgetCategory[]
}

interface ConfigOut {
  upload_limits: {
    activity_attachment_mb: number
    maintenance_mb: number
    close_photo_mb: number
    doc_mb: number
    img_mb: number
    video_mb: number
  }
  equipment_loan_max_days: number
  budget_categories: BudgetCategory[]
}

const MB = 1024 * 1024

const toConfig = (o: ConfigOut): ClubConfig => ({
  uploadLimits: {
    activityAttachmentBytes: o.upload_limits.activity_attachment_mb * MB,
    maintenanceBytes: o.upload_limits.maintenance_mb * MB,
    closePhotoBytes: o.upload_limits.close_photo_mb * MB,
    docBytes: o.upload_limits.doc_mb * MB,
    imgBytes: o.upload_limits.img_mb * MB,
    videoBytes: o.upload_limits.video_mb * MB,
  },
  equipmentLoanMaxDays: o.equipment_loan_max_days,
  budgetCategories: o.budget_categories,
})

export function useClubConfig() {
  return useQuery({
    queryKey: ['club', 'config'],
    queryFn: () => api<ConfigOut>('/club/config').then(toConfig),
    staleTime: 5 * 60 * 1000, // 組態變動不頻繁,快取 5 分鐘
  })
}
