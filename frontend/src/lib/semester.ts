// 學期規則:上學期 8–1 月、下學期 2–7 月(民國學年)
function semesterFrom(year: number, month: number): string {
  if (month >= 8) return `${year - 1911}-1`
  if (month === 1) return `${year - 1912}-1`
  return `${year - 1912}-2`
}

export function semesterOf(dateStr: string): string {
  const [y, m] = dateStr.split('/').map(Number)
  if (!y || !m) return currentSemester()
  return semesterFrom(y, m)
}

// 每次呼叫重讀時鐘:分頁開著跨過學期邊界時,畫面上的學期要跟著換
// (規則之後移入 system_settings)
export function currentSemester(): string {
  const today = new Date()
  return semesterFrom(today.getFullYear(), today.getMonth() + 1)
}

export function semesterOptions(values: string[], withAll = false): { value: string; label: string }[] {
  const uniq = [...new Set([currentSemester(), ...values])].sort((a, b) => b.localeCompare(a))
  const opts = uniq.map((v) => ({ value: v, label: v }))
  return withAll ? [{ value: 'all', label: '全部學期' }, ...opts] : opts
}
