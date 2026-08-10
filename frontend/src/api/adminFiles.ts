// 行政端檔案管理 API 層(權限鍵 afiles)。
// - 空間彙總 GET /admin/files/usage:模組分段(有報修檔案時 repair 排第一)+「文字內容」= pg_database_size
// - 報修檔案抓全量(全數列於頁面、可直接刪除);大型檔案取單頁 50 筆(預設依大小降冪)
//   「全部模組」= 不帶 module 參數後前端排除報修(後端 module 為單值參數,無「除報修外」選項)
// - 下載走通用 GET /files/{id}(admin 全通);已歸檔檔案已離盤(410),前端停用下載
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { API_BASE, api, apiPaged, qs } from './client'
import { fetchAllPages } from './fetchAll'

export type ModuleKey = 'close' | 'eval' | 'apply' | 'apps' | 'repair'

const toMb = (bytes: number): number => bytes / 1024 / 1024

export interface UsageModule {
  key: ModuleKey
  label: string
  sizeMb: number
  count: number
}

export interface FileUsage {
  modules: UsageModule[] // 順序由後端決定(有報修檔案時 repair 第一)
  dbSizeMb: number // 「文字內容」:整個 DB 的估算大小
  totalMb: number // 檔案 + DB(系統自身佔用)
  // 實際磁碟空間:diskTotal ≠ total + diskFree,差額是 OS 與同機其他程式的佔用
  diskTotalMb: number
  diskFreeMb: number
}

interface FileUsageOut {
  modules: { key: ModuleKey; label: string; size: number; count: number }[]
  db_size: number
  total_size: number
  disk_total: number
  disk_free: number
}

export interface StoredFile {
  id: string // uuid
  name: string
  module: ModuleKey
  club: string
  sizeMb: number
  date: string // 上傳日 YYYY/MM/DD
  archived: boolean // 已歸檔=行政備份後已離盤
}

interface AdminFileOut {
  id: string
  original_name: string
  module: ModuleKey
  club_name: string | null
  size: number
  mime: string
  created_at: string
  archived: boolean
}

const toFile = (f: AdminFileOut): StoredFile => ({
  id: f.id,
  name: f.original_name,
  module: f.module,
  club: f.club_name ?? '—',
  sizeMb: toMb(f.size),
  date: dayjs(f.created_at).format('YYYY/MM/DD'),
  archived: f.archived,
})

/** 通用下載端點(admin 對全部檔案可讀) */
export const fileDownloadUrl = (id: string): string => `${API_BASE}/files/${id}`

const keys = {
  all: ['adminFiles'] as const,
  usage: ['adminFiles', 'usage'] as const,
  repair: ['adminFiles', 'repair'] as const,
  large: (module: string, sort?: string) => ['adminFiles', 'large', module, sort ?? ''] as const,
}

export function useFileUsage() {
  return useQuery({
    queryKey: keys.usage,
    queryFn: () =>
      api<FileUsageOut>('/admin/files/usage').then(
        (u): FileUsage => ({
          modules: u.modules.map((m) => ({ key: m.key, label: m.label, sizeMb: toMb(m.size), count: m.count })),
          dbSizeMb: toMb(u.db_size),
          totalMb: toMb(u.total_size),
          diskTotalMb: toMb(u.disk_total),
          diskFreeMb: toMb(u.disk_free),
        }),
      ),
  })
}

/** 空間報修檔案:全數列出(檔案大、迭代快,清理空間的主要對象) */
export function useRepairFiles() {
  return useQuery({
    queryKey: keys.repair,
    queryFn: () =>
      fetchAllPages<AdminFileOut>('/admin/files', { module: 'repair' }).then((rows) => rows.map(toFile)),
  })
}

const LARGE_PAGE_SIZE = 50

/** 大型檔案:單頁 50 筆(sort 走後端白名單 size/created_at,未帶=後端預設依大小降冪);
 * 'all' 前端排除報修(報修有專屬區) */
export function useLargeFiles(module: Exclude<ModuleKey, 'repair'> | 'all', sort?: string) {
  return useQuery({
    queryKey: keys.large(module, sort),
    queryFn: () =>
      apiPaged<AdminFileOut[]>(
        `/admin/files${qs({ module: module === 'all' ? undefined : module, sort, page: 1, page_size: LARGE_PAGE_SIZE })}`,
      ).then(({ data }) => data.map(toFile).filter((f) => f.module !== 'repair')),
  })
}

/** 刪除檔案(後端僅允許 repair 模組) */
export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/admin/files/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
  })
}
