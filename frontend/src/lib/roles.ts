// 成員身份:標準值為 社員/幹部/副負責人/負責人;顯示時依社團名稱末字推導
// (「…社」→社長/副社長、「…會」→會長/副會長;社團名稱強制以「社」或「會」結尾,無例外)
export const MEMBER_KINDS = ['社員', '幹部', '副負責人', '負責人'] as const
export type MemberKind = (typeof MEMBER_KINDS)[number]

export function kindLabel(kind: MemberKind, club: string | undefined): string {
  const noun = club?.endsWith('會') ? '會' : '社'
  if (kind === '負責人') return `${noun}長`
  if (kind === '副負責人') return `副${noun}長`
  return kind
}

// CSV 匯入等外部輸入:接受顯示詞與標準值;「社長／會長」等模糊複合形式已廢除
const KIND_ALIASES: Record<string, MemberKind> = {
  社員: '社員',
  幹部: '幹部',
  負責人: '負責人',
  社長: '負責人',
  會長: '負責人',
  副負責人: '副負責人',
  副社長: '副負責人',
  副會長: '副負責人',
}

export function parseKind(raw: string): MemberKind | null {
  return KIND_ALIASES[raw.trim()] ?? null
}
