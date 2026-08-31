/**
 * 捲動行為:OS 關閉動畫(Windows「視覺效果 → 動畫效果」)時不要平滑捲動。
 *
 * 這件事 CSS 管不到 —— 依 CSSOM-View,JS 明寫的 `behavior` 勝過 `scroll-behavior`,
 * 所以 index.css 的 prefers-reduced-motion 區塊蓋不掉 scrollIntoView,只能在呼叫端判斷。
 */
export const scrollBehavior = (): ScrollBehavior =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
