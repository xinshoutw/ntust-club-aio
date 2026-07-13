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
  | 'in_progress'
  | 'pending'
  | 'open'
  | 'ended'
  | 'suspended'

export interface StatusStyle {
  label: string
  fg: string
  bg: string
  border?: string
  withLock?: boolean
}

export const STATUS: Record<StatusKey, StatusStyle> = {
  draft: { label: '草稿', fg: '#5B6472', bg: '#EEF0F3' },
  pending: { label: '待審', fg: '#8A5A00', bg: '#FFF3D6' },
  pending_advisor: { label: '待輔導老師審核', fg: '#8A5A00', bg: '#FFF3D6' },
  pending_chief: { label: '待組長審核', fg: '#1D5A9E', bg: '#E8F0FB' },
  pending_dean: { label: '待學務長審核', fg: '#6B4FA3', bg: '#F0EBF9' },
  approved: { label: '已核准', fg: '#1F6B45', bg: '#E3F2E9', border: 'rgba(31,107,69,.4)' },
  closing_pending_advisor: { label: '結案待輔導老師審核', fg: '#8A5A00', bg: '#FFF3D6' },
  closed: { label: '已結案', fg: '#FFFFFF', bg: '#2E7D57' },
  rejected: { label: '已退回', fg: '#B03A2E', bg: '#FBE9E7' },
  locked: { label: '逾期鎖定', fg: '#A3341F', bg: '#F9E4DE', withLock: true },
  in_progress: { label: '處理中', fg: '#1D5A9E', bg: '#E8F0FB' },
  open: { label: '開放中', fg: '#1F6B45', bg: '#E3F2E9', border: 'rgba(31,107,69,.4)' },
  ended: { label: '已截止', fg: '#3A3F4A', bg: '#E8EAEE' },
  suspended: { label: '停權', fg: '#3A3F4A', bg: '#E8EAEE' },
}
