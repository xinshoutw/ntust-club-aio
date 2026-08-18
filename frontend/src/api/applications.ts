// 線上申請 API 層:空間報修/郵局帳戶異動/幹部證明
// snake↔camel、日期(ISO↔YYYY/MM/DD)與 enum 值映射集中在此,頁面只碰 camelCase 型別
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { fetchAllPages } from './fetchAll'
import type { MemberKind } from '../lib/roles'
import type { StatusKey } from '../lib/status'

/** 「最近申請」區塊固定只顯示這幾筆(已完成者) */
export const RECENT_LIMIT = 5

// 各申請頁「最近申請」固定近 5 筆

interface FileOut {
  id: string
  original_name: string
  size: number
  mime: string
}

/** multipart 單檔上傳(欄位名 file,對應 FastAPI UploadFile) */
const uploadFile = (path: string, file: File): Promise<FileOut> => {
  const body = new FormData()
  body.append('file', file)
  return api<FileOut>(path, { method: 'POST', body })
}

const keys = {
  maintenance: ['maintenance'] as const,
  postal: ['postal-changes'] as const,
  certificates: ['officer-certificates'] as const,
}

// ---- 空間報修 ----

export interface MaintenanceRecord {
  id: number
  location: string
  items: string
  date: string
  status: StatusKey
  handleNote?: string
}

interface MaintenanceOut {
  id: number
  location: string
  items: string
  status: 'pending' | 'in_progress' | 'done'
  handle_note: string | null
  created_at: string
}

const toMaintenance = (m: MaintenanceOut): MaintenanceRecord => ({
  id: m.id,
  location: m.location,
  items: m.items,
  date: dayjs(m.created_at).format('YYYY/MM/DD'),
  status: m.status,
  handleNote: m.handle_note ?? undefined,
})

/** 未完成的報修(不限長度,全部列出);狀態由後端篩 */
export function useMaintenanceList() {
  return useQuery({
    queryKey: [...keys.maintenance, 'list'],
    queryFn: () =>
      fetchAllPages<MaintenanceOut>('/club/maintenance', {
        status: ['pending', 'in_progress'],
      }).then((rows) => ({ records: rows.map(toMaintenance) })),
  })
}

/** 最近完成的報修:只要第一頁的 RECENT_LIMIT 筆(id 降冪由後端排) */
export function useRecentMaintenance() {
  return useQuery({
    queryKey: [...keys.maintenance, 'recent'],
    queryFn: () =>
      apiPaged<MaintenanceOut[]>(
        `/club/maintenance${qs({ status: 'done', page_size: RECENT_LIMIT })}`,
      ).then(({ data }) => data.map(toMaintenance)),
  })
}

export interface MaintenanceInput {
  location: string
  items: string
  files: File[]
}

export function useMaintenanceMutations() {
  const qc = useQueryClient()
  const submit = useMutation({
    mutationFn: async ({ location, items, files }: MaintenanceInput) => {
      const row = await api<MaintenanceOut>('/club/maintenance', {
        method: 'POST',
        body: JSON.stringify({ location, items }),
      })
      try {
        for (const f of files) {
          await uploadFile(`/club/maintenance/${row.id}/evidence`, f)
        }
      } catch (e) {
        // 主體已建立、佐證失敗:讓使用者知道不需重送報修單
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`報修單已建立,但佐證上傳失敗:${msg}`)
      }
      return row
    },
    // 主體建立後不論佐證成敗,列表都已變動
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.maintenance }),
  })
  return { submit }
}

// ---- 郵局帳戶異動 ----

// 前端顯示詞 ↔ 後端 PostalReason enum 值
const REASON_TO_API: Record<string, string> = {
  更換郵局存簿代理人: '更換代理人',
  新開戶: '新開戶',
  帳戶印鑑章變更: '印鑑變更',
  帳簿遺失: '帳簿遺失',
  存簿密碼異動: '存簿密碼異動',
  結清銷戶: '結清銷戶',
}
const REASON_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(REASON_TO_API).map(([label, value]) => [value, label]),
)

export interface PostalRecord {
  id: number
  reasons: string[]
  accountName?: string
  accountNumber?: string
  date: string
  status: StatusKey
}

interface PostalChangeOut {
  id: number
  reasons: string[]
  account_name: string | null
  account_number: string | null
  new_agent_name: string | null
  new_agent_phone: string | null
  status: 'pending' | 'processing' | 'completed'
  created_at: string
}

const toPostal = (p: PostalChangeOut): PostalRecord => ({
  id: p.id,
  reasons: p.reasons.map((r) => REASON_TO_LABEL[r] ?? r),
  accountName: p.account_name ?? undefined,
  accountNumber: p.account_number ?? undefined,
  date: dayjs(p.created_at).format('YYYY/MM/DD'),
  status: p.status,
})

/** 未完成的郵局異動(不限長度);狀態由後端篩 */
export function usePostalList() {
  return useQuery({
    queryKey: [...keys.postal, 'list'],
    queryFn: () =>
      fetchAllPages<PostalChangeOut>('/club/postal-changes', {
        status: ['pending', 'processing'],
      }).then((rows) => ({ records: rows.map(toPostal) })),
  })
}

/** 最近完成的郵局異動:只要第一頁的 RECENT_LIMIT 筆 */
export function useRecentPostal() {
  return useQuery({
    queryKey: [...keys.postal, 'recent'],
    queryFn: () =>
      apiPaged<PostalChangeOut[]>(
        `/club/postal-changes${qs({ status: 'completed', page_size: RECENT_LIMIT })}`,
      ).then(({ data }) => data.map(toPostal)),
  })
}

export interface PostalInput {
  reasons: string[]
  /** 事由以外全部選填(decisions.md D-07) */
  accountName?: string
  accountNumber?: string
  agentName?: string
  agentPhone?: string
  /** 原存簿影本/新開戶申請表(單檔) */
  passbook: File
}

export function usePostalMutations() {
  const qc = useQueryClient()
  const submit = useMutation({
    mutationFn: async (b: PostalInput) => {
      const row = await api<PostalChangeOut>('/club/postal-changes', {
        method: 'POST',
        body: JSON.stringify({
          reasons: b.reasons.map((r) => REASON_TO_API[r] ?? r),
          account_name: b.accountName || undefined,
          account_number: b.accountNumber || undefined,
          new_agent_name: b.agentName || undefined,
          new_agent_phone: b.agentPhone || undefined,
        }),
      })
      try {
        await uploadFile(`/club/postal-changes/${row.id}/passbook`, b.passbook)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`申請已建立,但附件上傳失敗:${msg}`)
      }
      return row
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.postal }),
  })
  return { submit }
}

// ---- 幹部證明 ----

/** 可申請證明的職位(標準身份值)↔ 後端 CertPosition enum 值 */
const POSITION_TO_API: Record<string, string> = {
  負責人: '社長或會長',
  副負責人: '副社長或副會長',
}
const POSITION_TO_KIND: Record<string, MemberKind> = {
  社長或會長: '負責人',
  副社長或副會長: '副負責人',
}

/** 學年期顯示詞:114 → 114 學年度、114-1 → 114 學年度第 1 學期 */
export function termLabel(term: string): string {
  const [year, sem] = term.split('-')
  return sem ? `${year} 學年度第 ${sem} 學期` : `${year} 學年度`
}

/** 幹部證明的學年期選項:以名單實際有資料的學期為準 —— 後端逐字比對
 *  `club_members.semester`,名單裡沒有的學年期選了也只會拿到「找不到該職位的幹部」。
 *  整學年(如 114)含該學年兩學期。 */
export function termOptions(semesters: string[]): { value: string; label: string }[] {
  const years = [...new Set(semesters.map((s) => s.split('-')[0]))].sort((a, b) => b.localeCompare(a))
  return years
    .flatMap((year) => [year, ...semesters.filter((s) => s.startsWith(`${year}-`)).sort()])
    .map((value) => ({ value, label: termLabel(value) }))
}

export interface CertificateRecord {
  id: number
  term: string
  position: MemberKind
  applicantName: string
  date: string
  status: StatusKey
}

interface OfficerCertOut {
  id: number
  term: string
  position: string
  applicant_name: string
  status: 'pending' | 'processing' | 'completed'
  created_at: string
}

const toCertificate = (c: OfficerCertOut): CertificateRecord => ({
  id: c.id,
  term: c.term,
  position: POSITION_TO_KIND[c.position] ?? '負責人',
  applicantName: c.applicant_name,
  date: dayjs(c.created_at).format('YYYY/MM/DD'),
  status: c.status,
})

/** 未完成的幹部證明(不限長度);狀態由後端篩 */
export function useCertificates() {
  return useQuery({
    queryKey: [...keys.certificates, 'list'],
    queryFn: () =>
      fetchAllPages<OfficerCertOut>('/club/officer-certificates', {
        status: ['pending', 'processing'],
      }).then((rows) => ({ records: rows.map(toCertificate) })),
  })
}

export function useCertificateMutations() {
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: ({ term, position }: { term: string; position: MemberKind }) =>
      api<OfficerCertOut>('/club/officer-certificates', {
        method: 'POST',
        body: JSON.stringify({ term, position: POSITION_TO_API[position] ?? position }),
      }).then(toCertificate),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.certificates }),
  })
  return { create }
}

/** 最近完成的幹部證明:只要第一頁的 RECENT_LIMIT 筆 */
export function useRecentCertificates() {
  return useQuery({
    queryKey: [...keys.certificates, 'recent'],
    queryFn: () =>
      apiPaged<OfficerCertOut[]>(
        `/club/officer-certificates${qs({ status: 'completed', page_size: RECENT_LIMIT })}`,
      ).then(({ data }) => data.map(toCertificate)),
  })
}

interface MemberNameOut {
  name: string
}

async function officerNames(semester: string, kind: MemberKind): Promise<string[]> {
  // 逐頁抓齊:負責人只會有一位,但幹部證明也走這裡,截在第一頁會靜默漏人
  const rows = await fetchAllPages<MemberNameOut>('/club/members', { semester, kind: [kind] })
  return rows.map((m) => m.name)
}

/** 姓名預覽:依學年期+職位查成員名單(整學年=兩學期聯集);送出時後端再驗證一次 */
export function useOfficerNames(term: string | undefined, position: MemberKind | undefined) {
  return useQuery({
    // 掛 members 前綴:資料來自 /club/members,改名單時 useMemberMutations 一併刷新
    queryKey: ['members', 'officer-names', term, position],
    queryFn: async () => {
      const semesters = term!.includes('-') ? [term!] : [`${term}-1`, `${term}-2`]
      const names = await Promise.all(semesters.map((s) => officerNames(s, position!)))
      return [...new Set(names.flat())]
    },
    enabled: !!term && !!position,
  })
}
