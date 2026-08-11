// 行政端稽核軌跡 API 層(僅 super,唯讀)。
// 後端篩選為單值參數(user_id / role / action),UI 漏斗因此為單選(再點取消);
// 動作/角色以標籤對照表轉中文顯示,未知鍵回退原始字串。
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api, apiPaged, qs } from './client'
import { fetchAllPages } from './fetchAll'

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理員',
  staff: '工讀生',
  club: '社團',
  viewer: '評審',
}

// 後端 audit.record 的 action 鍵 → 顯示詞(未知鍵顯示原字串)
export const ACTION_LABELS: Record<string, string> = {
  login: '登入',
  logout: '登出',
  login_failed: '登入失敗',
  login_locked: '帳號鎖定',
  password_changed: '變更密碼',
  account_created: '新增帳號',
  account_deleted: '刪除帳號',
  account_restored: '恢復帳號',
  account_password_reset: '重設帳號密碼',
  account_permissions_updated: '調整頁面權限',
  account_suspended: '停權帳號',
  activity_submitted: '送出活動申請',
  activity_approved: '核准活動申請',
  activity_rejected: '退回活動申請',
  activity_close_submitted: '送出結案',
  activity_close_approved: '核准結案',
  activity_close_rejected: '退回結案',
  activity_close_unlocked: '解鎖逾期結案',
  announcement_created: '發布公告',
  announcement_deleted: '刪除公告',
  announcement_takeover_updated: '調整公告蓋板',
  club_updated: '更新社團主檔',
  club_profile_updated: '更新社團資料',
  club_password_reset: '重設社團密碼',
  club_suspended: '停權社團',
  club_suspension_lifted: '解除社團停權',
  room_booking_submitted: '送出固定借用',
  room_booking_approved: '核准固定借用',
  room_booking_rejected: '退回固定借用',
  venue_booking_submitted: '送出臨時借用',
  venue_booking_approved: '核准臨時借用',
  venue_booking_rejected: '退回臨時借用',
  equipment_loan_submitted: '送出器材借用',
  equipment_loan_approved: '核准器材借用',
  equipment_loan_rejected: '退回器材借用',
  equipment_loan_reminded: '器材逾期提醒',
  equipment_checked_out: '器材借出點交',
  equipment_checked_in: '器材歸還點交',
  eval_score_overridden: '調整行政分',
  eval_score_reverted: '恢復自動評分',
  eval_merit_set: '登錄表現優良加分',
  maintenance_submitted: '送出空間報修',
  maintenance_status_updated: '更新報修狀態',
  officer_cert_submitted: '申請幹部證明',
  postal_change_submitted: '申請郵局帳戶異動',
  repair_file_deleted: '刪除報修檔案',
  settings_updated: '調整系統設定',
  signup_item_created: '建立報名活動',
  signup_submitted: '送出線上報名',
  signup_confirmed: '確認報名',
  signup_attendance_marked: '登錄報名簽到',
  violation_filed: '開立違規勸導',
  violation_resolved: '違規銷案',
  club_account_created: '建立社團帳號',
  member_created: '新增成員',
  member_updated: '修改成員',
  member_deleted: '刪除成員',
  members_imported: '匯入成員名單',
  equipment_created: '新增器材',
  equipment_updated: '更新器材',
  equipment_loan_cancelled: '取消器材借用',
  equipment_loan_revoked: '撤銷器材借用',
  manual_equipment_loan_created: '手動建立器材借用',
  manual_venue_booking_created: '手動建立場地借用',
  room_booking_cancelled: '取消固定借用',
  room_booking_revoked: '撤銷固定借用',
  venue_booking_cancelled: '取消臨時借用',
  venue_booking_revoked: '撤銷臨時借用',
  venue_rule_created: '新增場地不開放規則',
  venue_rule_deleted: '刪除場地不開放規則',
  signup_session_created: '新增報名場次',
  signup_session_deleted: '刪除報名場次',
  officer_cert_status_updated: '更新幹部證明狀態',
  postal_change_status_updated: '更新郵局異動狀態',
  review_score_saved: '儲存評審評分',
  eval_file_deleted: '刪除評鑑檔案',
  activity_deleted: '刪除活動草稿',
  activity_photo_deleted: '刪除結案照片',
  activity_attachment_deleted: '刪除活動附件',
}

/** 動作顯示詞;沒對照到就顯示原始鍵(後端新加的動作不會因此消失) */
export const actionLabelOf = (key: string): string => ACTION_LABELS[key] ?? key
export const actionKeyOf = (label: string): string | undefined =>
  Object.entries(ACTION_LABELS).find(([, l]) => l === label)?.[0] ?? label

const roleEntries = Object.entries(ROLE_LABELS)
export const ROLE_OPTIONS = roleEntries.map(([, label]) => label)
export const roleKeyOf = (label: string): string | undefined =>
  roleEntries.find(([, l]) => l === label)?.[0]

export interface AuditLog {
  id: number
  time: string // YYYY/MM/DD HH:mm
  userId: number | null
  who: string
  roleLabel: string
  actionLabel: string
  detail: string
  ip: string | null
}

interface AuditLogOut {
  id: number
  user_id: number | null
  user_name: string | null
  role: string | null
  action: string
  detail: string
  ip: string | null
  created_at: string
}

const toLog = (l: AuditLogOut): AuditLog => ({
  id: l.id,
  time: dayjs(l.created_at).format('YYYY/MM/DD HH:mm'),
  userId: l.user_id,
  who: l.user_name ?? '(已刪除帳號)',
  roleLabel: l.role ? (ROLE_LABELS[l.role] ?? l.role) : '—',
  actionLabel: actionLabelOf(l.action),
  detail: l.detail,
  ip: l.ip,
})

export interface AuditFilters {
  userId?: number
  role?: string
  action?: string
  /** YYYY-MM-DD;含頭含尾,後端以台北日界切 */
  dateFrom?: string
  dateTo?: string
}

export interface AuditListParams extends AuditFilters {
  page: number
  pageSize: number
}

const listUrl = (p: AuditListParams): string =>
  `/admin/audit${qs({
    page: p.page,
    page_size: p.pageSize,
    user_id: p.userId,
    role: p.role,
    action: p.action,
    date_from: p.dateFrom,
    date_to: p.dateTo,
  })}`

export function useAuditLogs(p: AuditListParams) {
  return useQuery({
    queryKey: ['adminAudit', 'list', p] as const,
    queryFn: () =>
      apiPaged<AuditLogOut[]>(listUrl(p)).then(({ data, total }) => ({
        logs: data.map(toLog),
        total,
      })),
    placeholderData: keepPreviousData,
  })
}

/** 匯出用:依當前篩選逐頁抓完整結果(稽核只有 super 看得到,不另設上限) */
export async function fetchAllAuditLogs(filters: AuditFilters): Promise<AuditLog[]> {
  const rows = await fetchAllPages<AuditLogOut>('/admin/audit', {
    user_id: filters.userId,
    role: filters.role,
    action: filters.action,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  })
  // 抓取期間有人登入就會往最前面插列,後面的頁會重覆回傳前一頁尾端 —— 以 id 去重
  return [...new Map(rows.map((l) => [l.id, toLog(l)])).values()]
}

// ---- 篩選選項(取自實際留下的紀錄,不是已載入的那幾頁)----

interface Operator {
  id: number
  name: string
  username: string
}

interface AuditOptionsOut {
  operators: Operator[]
  actions: string[]
}

/** 同名者附帳號區辨(校內同名不罕見);漏斗只收字串,label 必須唯一才篩得準 */
const operatorLabel = (o: Operator, all: Operator[]): string =>
  all.filter((x) => x.name === o.name).length > 1 ? `${o.name}(${o.username})` : o.name

export function useAuditOptions() {
  return useQuery({
    queryKey: ['adminAudit', 'options'] as const,
    queryFn: () =>
      api<AuditOptionsOut>('/admin/audit/options').then((o) => ({
        operators: new Map(o.operators.map((x) => [operatorLabel(x, o.operators), x.id])),
        actionLabels: o.actions.map(actionLabelOf),
      })),
    staleTime: 5 * 60_000, // 選項變動很慢,不必每次進頁都掃一次全表
  })
}
