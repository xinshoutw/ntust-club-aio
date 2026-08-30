export type CellState = 'free' | 'closed' | 'fixedOnly' | 'reviewing' | 'temp' | 'fixed' | 'mine'

// 場地格配色:不開放不畫方框(圖例以空框呈現);固定借用深灰
export const CELL: Record<CellState, { label: string; bg: string }> = {
  free: { label: '可借', bg: '#EEF0F3' },
  closed: { label: '不開放', bg: 'transparent' },
  // 只開放固定借用的場地:這張圖是臨時借用的視角,借不到不等於場地不開放
  fixedOnly: { label: '僅固定借用', bg: 'repeating-linear-gradient(45deg,#EEF0F3,#EEF0F3 5px,#9AA1AC 5px,#9AA1AC 9px)' },
  reviewing: { label: '審核中', bg: '#F5A623' },
  temp: { label: '臨時借用', bg: '#F0A899' },
  fixed: { label: '固定借用', bg: '#9AA1AC' },
  mine: { label: '我的借用', bg: '#2E7D57' },
}

// 固定借用申請表的「不可選」底色:那張表沒有圖例式的空框,不開放格用 transparent
// 會與可選格長得一模一樣(白卡片上看不出差別),必須給一個看得見的灰
export const UNAVAILABLE_BG: Record<'blocked' | 'fixed' | 'temp', string> = {
  blocked: '#E8EAEE',
  fixed: CELL.fixed.bg,
  temp: CELL.temp.bg,
}

/** 未佔用格的狀態:能臨時借就是可借;只開放固定借用的借不到,但那不是「不開放」。
 * 社團端與行政端的場況圖共用這條判定,兩邊的空格才不會講不同的話。 */
export const emptyCellState = (venue: { allowFixed: boolean; allowTemp: boolean }): CellState =>
  venue.allowTemp ? 'free' : venue.allowFixed ? 'fixedOnly' : 'closed'

// 器材借用程度色階(借用總覽的器材檢視):以**上界**判定 —— 預設色只留給完全沒借用,
// 只要借出去一件就進黃色。借滿與固定借用同色。
// 場地是「借了沒」的二元狀態,器材是同一品項借掉幾成,兩張圖的圖例各一份
export const USAGE_SCALE = [
  { max: 0, label: '未借用', bg: CELL.free.bg },
  { max: 30, label: '30%', bg: '#F2C744' },
  { max: 50, label: '50%', bg: '#E8833A' },
  { max: 70, label: '70%', bg: '#C13B34' },
  { max: 99, label: '99%', bg: '#7B4EA3' },
  { max: 100, label: '額滿', bg: CELL.fixed.bg },
] as const

export type UsageStep = (typeof USAGE_SCALE)[number]

const FULL = USAGE_SCALE[USAGE_SCALE.length - 1]
const NEARLY_FULL = USAGE_SCALE[USAGE_SCALE.length - 2]

/** 佔用比例落在哪一階(上界含);借滿(與總數 0 的借不到)先判,其餘依比例 */
export function usageStep(used: number, total: number): UsageStep {
  if (total <= 0 || used >= total) return FULL
  const pct = (used / total) * 100
  // 99%~100% 之間(總數上百才有)還沒借滿,歸最後一個未滿階
  return USAGE_SCALE.slice(0, -1).find((s) => pct <= s.max) ?? NEARLY_FULL
}
