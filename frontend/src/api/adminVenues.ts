// 場地主檔維護 API 層(讀取限 abooking、寫入限 super):GET/POST/PATCH /admin/venues。
// 形狀與器材主檔(adminEquipment)一致;停用不刪列,既有借用單與不開放規則的外鍵才不會斷。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from './client'
import { keys as bookingKeys } from './adminBookings'

/** 場地類別(後端 VenueCategory 列舉,值即顯示詞) */
export const VENUE_CATEGORIES = ['教室', '練習空間', '廣場戶外', '宿舍區'] as const
export type VenueCategory = (typeof VENUE_CATEGORIES)[number]

export interface VenueItem {
  id: number
  name: string
  capacity?: number
  category: VenueCategory
  allowFixed: boolean
  allowTemp: boolean
  isActive: boolean
}

interface VenueMasterOut {
  id: number
  name: string
  capacity: number | null
  category: VenueCategory
  allow_fixed: boolean
  allow_temp: boolean
  is_active: boolean
}

const toItem = (v: VenueMasterOut): VenueItem => ({
  id: v.id,
  name: v.name,
  capacity: v.capacity ?? undefined,
  category: v.category,
  allowFixed: v.allow_fixed,
  allowTemp: v.allow_temp,
  isActive: v.is_active,
})

const keys = { all: ['adminVenues'] as const }

/** 主檔維護視角:含已停用的場地(場況圖那份預設只回啟用中) */
export function useAdminVenues() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () =>
      api<VenueMasterOut[]>(`/admin/venues${qs({ include_inactive: true })}`).then((rows) =>
        rows.map(toItem),
      ),
  })
}

export interface VenueInput {
  name: string
  capacity?: number | null
  category: VenueCategory
  allowFixed: boolean
  allowTemp: boolean
}

export function useVenueMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.all })
    // 場況圖與手動借用的場地列首同源,改主檔後兩邊都要跟著換
    void qc.invalidateQueries({ queryKey: bookingKeys.all })
  }

  const create = useMutation({
    mutationFn: (b: VenueInput) =>
      api<VenueMasterOut>('/admin/venues', {
        method: 'POST',
        body: JSON.stringify({
          name: b.name,
          capacity: b.capacity ?? null,
          category: b.category,
          allow_fixed: b.allowFixed,
          allow_temp: b.allowTemp,
        }),
      }),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<VenueInput & { isActive: boolean }> }) =>
      api<VenueMasterOut>(`/admin/venues/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.name != null ? { name: patch.name } : {}),
          ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
          ...(patch.category != null ? { category: patch.category } : {}),
          ...(patch.allowFixed != null ? { allow_fixed: patch.allowFixed } : {}),
          ...(patch.allowTemp != null ? { allow_temp: patch.allowTemp } : {}),
          ...(patch.isActive != null ? { is_active: patch.isActive } : {}),
        }),
      }),
    onSuccess: invalidate,
  })

  return { create, update }
}
