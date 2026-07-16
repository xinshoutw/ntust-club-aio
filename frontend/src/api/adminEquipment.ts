// 器材主檔維護 API 層(僅 super):GET/POST/PATCH /admin/equipment。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface EquipmentItem {
  id: number
  name: string
  category: string
  totalQty: number
  needsSerial: boolean
  isActive: boolean
}

interface EquipmentOut {
  id: number
  name: string
  category: string
  total_qty: number
  needs_serial: boolean
  is_active: boolean
}

const toItem = (o: EquipmentOut): EquipmentItem => ({
  id: o.id,
  name: o.name,
  category: o.category,
  totalQty: o.total_qty,
  needsSerial: o.needs_serial,
  isActive: o.is_active,
})

export const EQUIPMENT_CATEGORIES = ['一般', '電子設備', '投影布幕', '帳篷'] as const

const keys = { all: ['adminEquipment'] as const }

export function useAdminEquipment() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => api<EquipmentOut[]>('/admin/equipment').then((rows) => rows.map(toItem)),
  })
}

export interface EquipmentInput {
  name: string
  category: string
  totalQty: number
  needsSerial: boolean
}

export function useEquipmentMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all })

  const create = useMutation({
    mutationFn: (b: EquipmentInput) =>
      api<EquipmentOut>('/admin/equipment', {
        method: 'POST',
        body: JSON.stringify({
          name: b.name,
          category: b.category,
          total_qty: b.totalQty,
          needs_serial: b.needsSerial,
        }),
      }),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<EquipmentInput & { isActive: boolean }> }) =>
      api<EquipmentOut>(`/admin/equipment/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.name != null ? { name: patch.name } : {}),
          ...(patch.category != null ? { category: patch.category } : {}),
          ...(patch.totalQty != null ? { total_qty: patch.totalQty } : {}),
          ...(patch.needsSerial != null ? { needs_serial: patch.needsSerial } : {}),
          ...(patch.isActive != null ? { is_active: patch.isActive } : {}),
        }),
      }),
    onSuccess: invalidate,
  })

  return { create, update }
}
