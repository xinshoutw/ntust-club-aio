export type FieldType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'select'

export interface SignupField {
  key: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
}

export interface SignupSubmission {
  submittedAt: string
  participants: Record<string, string>[]
}

// 評鑑對幹訓/負責人會議有特別規範,報名活動需標記類型
export type SignupKind = 'normal' | 'cadre_training' | 'leader_meeting'

export const SIGNUP_KIND_BADGE: Record<Exclude<SignupKind, 'normal'>, { label: string; fg: string; bg: string }> = {
  cadre_training: { label: '幹訓', fg: '#6B4FA3', bg: '#F0EBF9' },
  leader_meeting: { label: '社團負責人會議', fg: '#0F5E5A', bg: '#DFF1EF' },
}

export interface SignupItem {
  id: string
  name: string
  status: 'open' | 'ended'
  kind: SignupKind
  semester: string
  info: string
  description?: string
  deadline: string
  time?: string
  place?: string
  maxParticipants: number
  fields: SignupField[]
  hasDraft?: boolean
  submission?: SignupSubmission
  // 管理員於活動結束後登錄之簽到場次數(本社);評鑑僅採計簽到,僅報名不計分
  attendedSessions?: number
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: '單行文字',
  textarea: '多行文字',
  radio: '單選',
  checkbox: '複選',
  select: '下拉選單',
}
