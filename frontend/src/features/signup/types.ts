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

export interface SignupItem {
  id: string
  name: string
  status: 'open' | 'ended'
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
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: '單行文字',
  textarea: '多行文字',
  radio: '單選',
  checkbox: '複選',
  select: '下拉選單',
}
