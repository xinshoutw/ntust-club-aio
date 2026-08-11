// 行政端維修管理 API 層(權限鍵 amaint)。
// 列表一次抓全量(報修量級小)沿用前端排序;預設排序=後端預設(待處理→處理中→已完成,組內申請日升冪)。
// 狀態流轉走後端狀態機:僅允許單步前進(待處理→處理中→已完成),UI 也只開放下一步選項。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { fetchAllPages } from './fetchAll'

export type MaintenanceStatus = 'pending' | 'in_progress' | 'done'

/** 單步前進狀態機(與後端 _NEXT_STATUS 對齊) */
export const NEXT_STATUS: Partial<Record<MaintenanceStatus, MaintenanceStatus>> = {
  pending: 'in_progress',
  in_progress: 'done',
}

export interface EvidenceFile {
  id: string
  name: string
}

export interface MaintenanceItem {
  id: number
  club: string
  location: string
  items: string
  date: string // 申請日 YYYY/MM/DD
  status: MaintenanceStatus
  handleNote?: string
  /** 佐證照片/影片(未歸檔者;下載走 GET /files/{id}) */
  evidence: EvidenceFile[]
}

interface AdminMaintenanceOut {
  id: number
  club_name: string
  location: string
  items: string
  status: MaintenanceStatus
  handle_note: string | null
  created_at: string
  evidence: { id: string; original_name: string }[]
}

const toItem = (m: AdminMaintenanceOut): MaintenanceItem => ({
  id: m.id,
  club: m.club_name,
  location: m.location,
  items: m.items,
  date: dayjs(m.created_at).format('YYYY/MM/DD'),
  status: m.status,
  handleNote: m.handle_note ?? undefined,
  evidence: (m.evidence ?? []).map((f) => ({ id: f.id, name: f.original_name })),
})

const keys = {
  all: ['adminMaintenance'] as const,
  list: ['adminMaintenance', 'list'] as const,
}

export function useAdminMaintenance() {
  return useQuery({
    queryKey: keys.list,
    queryFn: () =>
      fetchAllPages<AdminMaintenanceOut>('/admin/maintenance').then((rows) => rows.map(toItem)),
  })
}

export function useMaintenanceStatusMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, handleNote }: { id: number; status: MaintenanceStatus; handleNote?: string }) =>
      api<AdminMaintenanceOut>(`/admin/maintenance/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, handle_note: handleNote }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
  })
}
