export type CellState = 'free' | 'closed' | 'fixedOnly' | 'reviewing' | 'temp' | 'fixed' | 'mine'

// 「借不到」的兩格用同一族深灰:對看圖的人是同一件事,原本不開放格畫成透明無框
// 等於畫成不存在。但只差 hover 不夠 —— 圖例把兩格並排,格子又是不可聚焦的 div、
// Tooltip 只吃 hover,同色的話觸控與鍵盤使用者永遠分不出是哪一種,所以差一階明度
const SLATE = '#9AA1AC'
const SLATE_DARK = '#6B7280'

// 場地格配色
export const CELL: Record<CellState, { label: string; bg: string }> = {
  free: { label: '可借', bg: '#EEF0F3' },
  closed: { label: '不開放', bg: SLATE_DARK },
  // 只開放固定借用的場地:這張圖是臨時借用的視角,借不到不等於場地不開放
  fixedOnly: { label: '僅固定借用', bg: `repeating-linear-gradient(45deg,#EEF0F3,#EEF0F3 5px,${SLATE} 5px,${SLATE} 9px)` },
  reviewing: { label: '審核中', bg: '#F5A623' },
  temp: { label: '臨時借用', bg: '#F0A899' },
  fixed: { label: '固定借用', bg: SLATE },
  mine: { label: '我的借用', bg: '#2E7D57' },
}

// 固定借用申請表的「不可選」底色:那張表在挑格子,「為什麼挑不了」得不 hover 就看得出來,
// 而且它的圖例把 blocked/fixed/temp 三色並排 —— 不開放不能跟固定借用同色,另給一個淺灰
export const UNAVAILABLE_BG: Record<'blocked' | 'fixed' | 'temp', string> = {
  blocked: '#E8EAEE',
  fixed: CELL.fixed.bg,
  temp: CELL.temp.bg,
}

/** 未佔用格的狀態:能臨時借就是可借;只開放固定借用的借不到,但那不是「不開放」。
 * 社團端、行政端與未登入首頁是同一張圖(features/bookings/BookingGrid.tsx),
 * 這條判定跟著只有一份。 */
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
  { max: 100, label: '額滿', bg: CELL.fixed.bg },
] as const

export type UsageStep = (typeof USAGE_SCALE)[number]

const FULL = USAGE_SCALE[USAGE_SCALE.length - 1]
const NEARLY_FULL = USAGE_SCALE[USAGE_SCALE.length - 2]

/** 佔用比例落在哪一階(上界含);額滿(與總數 0 的借不到)只看件數,不看比例 */
export function usageStep(used: number, total: number): UsageStep {
  if (total <= 0 || used >= total) return FULL
  const pct = (used / total) * 100
  return USAGE_SCALE.slice(0, -1).find((s) => pct <= s.max) ?? NEARLY_FULL
}
