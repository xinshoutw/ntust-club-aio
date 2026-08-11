// 行政端線上申請管理 API 層(權限鍵 aapply):幹部證明/郵局帳戶異動。
// 列表一次抓全量(量級小)沿用前端排序;狀態流轉走後端狀態機:
// 僅允許單步前進(審核中→處理中→請洽學務處),UI 也只開放下一步選項。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { fetchAllPages } from './fetchAll'

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
  accountName: string
  accountNumber: string
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
  account_name: string
  account_number: string
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
  accountName: p.account_name,
  accountNumber: p.account_number,
  newAgentName: p.new_agent_name ?? undefined,
  newAgentPhone: p.new_agent_phone ?? undefined,
  date: dayjs(p.created_at).format('YYYY/MM/DD'),
  status: p.status,
  passbook: (p.passbook ?? []).map((f) => ({ id: f.id, name: f.original_name })),
})

const keys = {
  all: ['adminApplications'] as const,
  certs: ['adminApplications', 'certs'] as const,
  postal: ['adminApplications', 'postal'] as const,
}

export function useAdminOfficerCerts() {
  return useQuery({
    queryKey: keys.certs,
    queryFn: () =>
      fetchAllPages<AdminOfficerCertOut>('/admin/officer-certificates').then((rows) =>
        rows.map(toCertRow),
      ),
  })
}

export function useAdminPostalChanges() {
  return useQuery({
    queryKey: keys.postal,
    queryFn: () =>
      fetchAllPages<AdminPostalChangeOut>('/admin/postal-changes').then((rows) =>
        rows.map(toPostalRow),
      ),
  })
}

export type ApplicationKind = 'cert' | 'postal'

const STATUS_PATH: Record<ApplicationKind, string> = {
  cert: '/admin/officer-certificates',
  postal: '/admin/postal-changes',
}

export function useApplicationStatusMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, status }: { kind: ApplicationKind; id: number; status: ApplicationStatus }) =>
      api(`${STATUS_PATH[kind]}/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
  })
}
