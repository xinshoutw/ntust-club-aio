// 行政端稽核軌跡 API 層(僅 super,唯讀)。
// 後端篩選為單值參數(user_id / role / action),UI 漏斗因此為單選(再點取消);
// 動作/角色以標籤對照表轉中文顯示,未知鍵回退原始字串。
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiPaged, qs } from './client'

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
  account_password_reset: '重設帳號密碼',
  account_permissions_updated: '調整頁面權限',
  account_suspended: '停權帳號',
  account_restored: '恢復帳號',
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
}

const actionEntries = Object.entries(ACTION_LABELS)
/** 動作篩選選項(顯示詞,固定清單) */
export const ACTION_OPTIONS = actionEntries.map(([, label]) => label)
export const actionKeyOf = (label: string): string | undefined =>
  actionEntries.find(([, l]) => l === label)?.[0]

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
  actionLabel: ACTION_LABELS[l.action] ?? l.action,
  detail: l.detail,
})

export interface AuditListParams {
  page: number
  pageSize: number
  userId?: number
  role?: string
  action?: string
}

export function useAuditLogs(p: AuditListParams) {
  return useQuery({
    queryKey: ['adminAudit', 'list', p] as const,
    queryFn: () =>
      apiPaged<AuditLogOut[]>(
        `/admin/audit${qs({ page: p.page, page_size: p.pageSize, user_id: p.userId, role: p.role, action: p.action })}`,
      ).then(({ data, total }) => ({ logs: data.map(toLog), total })),
    placeholderData: keepPreviousData,
  })
}
