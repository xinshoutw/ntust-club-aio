// 學期規則:上學期 8–1 月、下學期 2–7 月(民國學年)
export function semesterOf(dateStr: string): string {
  const [y, m] = dateStr.split('/').map(Number)
  if (!y || !m) return CURRENT_SEMESTER
  if (m >= 8) return `${y - 1911}-1`
  if (m === 1) return `${y - 1912}-1`
  return `${y - 1912}-2`
}

export const CURRENT_SEMESTER = '114-2'

export function semesterOptions(values: string[], withAll = false): { value: string; label: string }[] {
  const uniq = [...new Set([CURRENT_SEMESTER, ...values])].sort((a, b) => b.localeCompare(a))
  const opts = uniq.map((v) => ({ value: v, label: v }))
  return withAll ? [{ value: 'all', label: '全部學期' }, ...opts] : opts
}
