// 學期規則:上學期 8–1 月、下學期 2–7 月(民國學年)
function semesterFrom(year: number, month: number): string {
  if (month >= 8) return `${year - 1911}-1`
  if (month === 1) return `${year - 1912}-1`
  return `${year - 1912}-2`
}

export function semesterOf(dateStr: string): string {
  const [y, m] = dateStr.split('/').map(Number)
  if (!y || !m) return CURRENT_SEMESTER
  return semesterFrom(y, m)
}

// 依今日推導,跨學期時自動更新(規則之後移入 system_settings)
const today = new Date()
export const CURRENT_SEMESTER = semesterFrom(today.getFullYear(), today.getMonth() + 1)

export function semesterOptions(values: string[], withAll = false): { value: string; label: string }[] {
  const uniq = [...new Set([CURRENT_SEMESTER, ...values])].sort((a, b) => b.localeCompare(a))
  const opts = uniq.map((v) => ({ value: v, label: v }))
  return withAll ? [{ value: 'all', label: '全部學期' }, ...opts] : opts
}
