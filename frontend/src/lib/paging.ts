/** 頁碼收斂到清單實際的頁數。
 *
 * 清單縮短(送出/刪除後重抓)時,停在後面那幾頁的卡片會只剩標題、內容全空 ——
 * 而空狀態只在「一筆都沒有」時才出現,看不出原因也回不去。
 * 對合法頁碼回傳原值,可安全地在 render 或 effect 裡直接套用。
 */
export const clampPage = (page: number, total: number, size: number): number =>
  Math.min(page, Math.max(1, Math.ceil(total / size)))
