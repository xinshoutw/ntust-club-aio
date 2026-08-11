export type CellState = 'free' | 'closed' | 'fixedOnly' | 'reviewing' | 'temp' | 'fixed' | 'mine'

// 場地格配色:不開放不畫方框(圖例以空框呈現);固定借用深灰
export const CELL: Record<CellState, { label: string; bg: string }> = {
  free: { label: '可借', bg: '#EEF0F3' },
  closed: { label: '不開放', bg: 'transparent' },
  // 只開放固定借用的場地:這張圖是臨時借用的視角,借不到不等於場地不開放
  fixedOnly: { label: '僅固定借用', bg: 'repeating-linear-gradient(45deg,#EEF0F3,#EEF0F3 3px,#DCE0E6 3px,#DCE0E6 6px)' },
  reviewing: { label: '審核中', bg: '#F5A623' },
  temp: { label: '臨時借用', bg: '#F0A899' },
  fixed: { label: '固定借用', bg: '#9AA1AC' },
  mine: { label: '我的借用', bg: '#2E7D57' },
}
