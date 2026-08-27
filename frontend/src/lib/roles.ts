// 成員身份:標準值為 社員/幹部/副負責人/負責人;顯示詞依社團的 kind(社團/學會)推導
// (社團→社長/副社長、學會→會長/副會長;kind 為獨立欄位,
// 建立或改名時由名稱結尾自動推導,推導不到則手動指定)
export const MEMBER_KINDS = ['社員', '幹部', '副負責人', '負責人'] as const
export type MemberKind = (typeof MEMBER_KINDS)[number]

export type ClubKind = '社團' | '學會'

/** 負責人與副負責人不寫職稱:身份本身就是職稱(D-27)。
 *  後端 `_validate_member` 與遷移 `cms_import.member_kind` 是同一條規則 —— 那兩處會把填進來的字捨棄。 */
export const canHaveTitle = (kind: MemberKind): boolean =>
  kind !== '負責人' && kind !== '副負責人'

export function kindLabel(kind: MemberKind, clubKind: ClubKind | string | undefined): string {
  const noun = clubKind === '學會' ? '會' : '社'
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
