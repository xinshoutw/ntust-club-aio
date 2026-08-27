// 行政端線上申請管理 API 層(權限鍵 aapply):幹部證明/郵局帳戶異動。
// 兩張表各自伺服器端分頁(排序由後端固定);狀態流轉走後端狀態機:
// 僅允許單步前進(審核中→處理中→已完成),UI 也只開放下一步選項。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { useInvalidateBadges } from './badges'

export type ApplicationStatus = 'pending' | 'processing' | 'completed'

/** 單步前進狀態機(與後端 _NEXT_STATUS 對齊) */
export const NEXT_STATUS: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  pending: 'processing',
  processing: 'completed',
}

export interface OfficerCertRow {
  id: number
  club: string
  term: string
  position: string
  applicant: string
  date: string // 申請日 YYYY/MM/DD
  status: ApplicationStatus
}

export interface PostalChangeRow {
  id: number
  club: string
  reasons: string[]
  /** 事由以外全部選填(decisions.md D-07) */
  accountName?: string
  accountNumber?: string
  newAgentName?: string
  newAgentPhone?: string
  date: string
  status: ApplicationStatus
  /** 存簿影本(未歸檔者;下載走 GET /files/{id}) */
  passbook: { id: string; name: string }[]
}

interface AdminOfficerCertOut {
  id: number
  club_name: string
  term: string
  position: string
  applicant_name: string
  status: ApplicationStatus
  created_at: string
}

interface AdminPostalChangeOut {
  id: number
  club_name: string
  reasons: string[]
  account_name: string | null
  account_number: string | null
  new_agent_name: string | null
  new_agent_phone: string | null
  status: ApplicationStatus
  created_at: string
  passbook: { id: string; original_name: string }[]
}

const toCertRow = (c: AdminOfficerCertOut): OfficerCertRow => ({
  id: c.id,
  club: c.club_name,
  term: c.term,
  position: c.position,
  applicant: c.applicant_name,
  date: dayjs(c.created_at).format('YYYY/MM/DD'),
  status: c.status,
})

const toPostalRow = (p: AdminPostalChangeOut): PostalChangeRow => ({
  id: p.id,
  club: p.club_name,
  reasons: p.reasons,
  accountName: p.account_name ?? undefined,
  accountNumber: p.account_number ?? undefined,
  newAgentName: p.new_agent_name ?? undefined,
  newAgentPhone: p.new_agent_phone ?? undefined,
  date: dayjs(p.created_at).format('YYYY/MM/DD'),
  status: p.status,
  passbook: (p.passbook ?? []).map((f) => ({ id: f.id, name: f.original_name })),
})

const keys = {
  all: ['adminApplications'] as const,
  certs: (page: number) => ['adminApplications', 'certs', page] as const,
  postal: (page: number) => ['adminApplications', 'postal', page] as const,
  pendingTotal: (kind: ApplicationKind) => ['adminApplications', 'pendingTotal', kind] as const,
}

export const APPLICATIONS_PAGE_SIZE = 50

export type ApplicationKind = 'cert' | 'postal'

const KIND_PATH: Record<ApplicationKind, string> = {
  cert: '/admin/officer-certificates',
  postal: '/admin/postal-changes',
}

const pagePath = (kind: ApplicationKind, page: number) =>
  `${KIND_PATH[kind]}${qs({ page, page_size: APPLICATIONS_PAGE_SIZE })}`

/** 兩張表皆為後端固定排序(審核中→處理中→完成,組內申請日升冪),無 sort 參數 */
export function useAdminOfficerCerts(page: number) {
  return useQuery({
    queryKey: keys.certs(page),
    queryFn: () =>
      apiPaged<AdminOfficerCertOut[]>(pagePath('cert', page)).then(({ data, total }) => ({
        rows: data.map(toCertRow),
        total,
      })),
  })
}

export function useAdminPostalChanges(page: number) {
  return useQuery({
    queryKey: keys.postal(page),
    queryFn: () =>
      apiPaged<AdminPostalChangeOut[]>(pagePath('postal', page)).then(({ data, total }) => ({
        rows: data.map(toPostalRow),
        total,
      })),
  })
}

/** 單類待處理件數(page_size=1 只取 meta.total;分頁後算不出全域數字)。
 *  拆頁之後兩頁各算各的 —— 合計會讓只有一把鍵的承辦看到自己讀不到的那類件數 */
function usePendingTotal(kind: ApplicationKind) {
  return useQuery({
    queryKey: keys.pendingTotal(kind),
    queryFn: async () =>
      (await apiPaged<unknown[]>(`${KIND_PATH[kind]}${qs({ status: 'pending', page_size: 1 })}`))
        .total,
  })
}

export const usePendingCertTotal = () => usePendingTotal('cert')
export const usePendingPostalTotal = () => usePendingTotal('postal')

export function useApplicationStatusMutation() {
  const qc = useQueryClient()
  const invalidateBadges = useInvalidateBadges()
  return useMutation({
    mutationFn: ({ kind, id, status }: { kind: ApplicationKind; id: number; status: ApplicationStatus }) =>
      api(`${KIND_PATH[kind]}/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all })
      invalidateBadges()
    },
  })
}
