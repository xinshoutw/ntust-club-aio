// 器材主檔維護 API 層(僅 super):GET/POST/PATCH /admin/equipment。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface EquipmentItem {
  id: number
  name: string
  totalQty: number
  needsSerial: boolean // False=一般、True=依序點交
  isActive: boolean
}

interface EquipmentOut {
  id: number
  name: string
  total_qty: number
  needs_serial: boolean
  is_active: boolean
}

const toItem = (o: EquipmentOut): EquipmentItem => ({
  id: o.id,
  name: o.name,
  totalQty: o.total_qty,
  needsSerial: o.needs_serial,
  isActive: o.is_active,
})

// 點交方式(取代原「類別」;2026-07-17):一般 / 依序點交(needs_serial)
export const HANDOVER_OPTIONS = [
  { value: false, label: '一般' },
  { value: true, label: '依序點交' },
]

const keys = { all: ['adminEquipment'] as const }

export function useAdminEquipment() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => api<EquipmentOut[]>('/admin/equipment').then((rows) => rows.map(toItem)),
  })
}

export interface EquipmentInput {
  name: string
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
          ...(patch.totalQty != null ? { total_qty: patch.totalQty } : {}),
          ...(patch.needsSerial != null ? { needs_serial: patch.needsSerial } : {}),
          ...(patch.isActive != null ? { is_active: patch.isActive } : {}),
        }),
      }),
    onSuccess: invalidate,
  })

  return { create, update }
}
