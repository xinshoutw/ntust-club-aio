import dayjs from 'dayjs'

export type StatusKey =
  | 'draft'
  | 'pending_advisor'
  | 'pending_chief'
  | 'pending_dean'
  | 'approved'
  | 'closing_pending_advisor'
  | 'closed'
  | 'rejected'
  | 'locked'
  | 'unlocked'
  | 'in_progress'
  | 'pending'
  | 'closing_due'
  | 'open'
  | 'ended'
  | 'registered'
  | 'suspended'
  | 'cancelled'
  | 'checked_out'
  | 'returned'
  | 'overdue'
  | 'done'
  | 'processing'
  | 'completed'
  | 'violation_open'
  | 'violation_resolved'

export interface StatusStyle {
  label: string
  fg: string
  bg: string
  border?: string
  withLock?: boolean
}

export const STATUS: Record<StatusKey, StatusStyle> = {
  draft: { label: '草稿', fg: '#5B6472', bg: '#EEF0F3' },
  cancelled: { label: '已取消', fg: '#5B6472', bg: '#EEF0F3' },
  pending: { label: '待審核', fg: '#8A5A00', bg: '#FFF3D6' },
  closing_due: { label: '待結案', fg: '#8A5A00', bg: '#FFF3D6' },
  // 社團端不顯示審核關卡,三關統一「申請待審核」
  pending_advisor: { label: '待審核', fg: '#8A5A00', bg: '#FFF3D6' },
  pending_chief: { label: '待審核', fg: '#8A5A00', bg: '#FFF3D6' },
  pending_dean: { label: '待審核', fg: '#8A5A00', bg: '#FFF3D6' },
  approved: { label: '已核准', fg: '#1F6B45', bg: '#E3F2E9', border: 'rgba(31,107,69,.4)' },
  closing_pending_advisor: { label: '待審核', fg: '#8A5A00', bg: '#FFF3D6' },
  closed: { label: '已結案', fg: '#FFFFFF', bg: '#2E7D57' },
  rejected: { label: '已退回', fg: '#B03A2E', bg: '#FBE9E7' },
  locked: { label: '已逾期', fg: '#A3341F', bg: '#F9E4DE', withLock: true },
  // 逾期未結案但管理員已解鎖(結案審核頁逾期表):社團可補送結案,行政待其行動
  unlocked: { label: '已解鎖', fg: '#1D5A9E', bg: '#E8F0FB' },
  in_progress: { label: '處理中', fg: '#1D5A9E', bg: '#E8F0FB' },
  // 幹部證明/郵局帳戶異動:審核中 → 處理中 → 請洽學務處
  processing: { label: '處理中', fg: '#1D5A9E', bg: '#E8F0FB' },
  completed: { label: '請洽學務處', fg: '#1F6B45', bg: '#E3F2E9', border: 'rgba(31,107,69,.4)' },
  open: { label: '開放中', fg: '#1F6B45', bg: '#E3F2E9', border: 'rgba(31,107,69,.4)' },
  ended: { label: '已截止', fg: '#3A3F4A', bg: '#E8EAEE' },
  registered: { label: '已報名', fg: '#1D5A9E', bg: '#E8F0FB' },
  suspended: { label: '停權', fg: '#3A3F4A', bg: '#E8EAEE' },
  checked_out: { label: '已借出', fg: '#1D5A9E', bg: '#E8F0FB' },
  returned: { label: '已歸還', fg: '#FFFFFF', bg: '#2E7D57' },
  overdue: { label: '已逾期', fg: '#A3341F', bg: '#F9E4DE', withLock: true },
  done: { label: '已完成', fg: '#FFFFFF', bg: '#2E7D57' },
  violation_open: { label: '未銷案', fg: '#B03A2E', bg: '#FBE9E7' },
  violation_resolved: { label: '已銷案', fg: '#1F6B45', bg: '#E3F2E9', border: 'rgba(31,107,69,.4)' },
}

/**
 * 社團停權中(含到期當日)。解除停權是把 `suspended_until` 清成 null,
 * 但過期未清的殘留值不該顯示成停權中 —— 與後端攔截同界(`suspended_until >= today`)。
 */
export const suspendedNow = (until: string | null | undefined): boolean =>
  !!until && !dayjs(until, 'YYYY/MM/DD').isBefore(dayjs(), 'day')
