import type { MemberKind } from '../../lib/roles'

export interface Member {
  id: number
  name: string
  studentId: string
  kind: MemberKind
  title?: string
  semester: string
  updatedAt: string
}

export const MEMBERS: Member[] = [
  { id: 1, name: '顏志明', studentId: 'B11200001', kind: '負責人', semester: '114-2', updatedAt: '2026/06/01 09:12' },
  { id: 2, name: '林小芳', studentId: 'B11200002', kind: '副負責人', semester: '114-2', updatedAt: '2026/06/01 09:12' },
  { id: 3, name: '陳大文', studentId: 'B11200003', kind: '幹部', title: '總務', semester: '114-2', updatedAt: '2026/06/01 09:15' },
  { id: 4, name: '張晉安', studentId: 'B11200104', kind: '社員', semester: '114-1', updatedAt: '2026/06/12 14:30' },
  { id: 5, name: '王思晴', studentId: 'B11200105', kind: '社員', semester: '114-2', updatedAt: '2026/06/12 14:30' },
]
