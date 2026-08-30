import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** 可用高度放得下幾整列;至少 min 列(視窗再矮也要看得到東西,寧可讓那一塊自己捲) */
export const rowsThatFit = (available: number, rowHeight: number, min: number): number =>
  Math.max(min, Math.floor(available / rowHeight))

/** 卡片再矮也不縮到這個高度以下(約表頭 + 分頁列 + 幾列) */
const MIN_CARD_HEIGHT = 260

/** 首次渲染卡片還沒進 DOM,先用視窗高扣掉「頂欄 + 頁首 + 卡片上緣」估一次 */
const ESTIMATED_TOP = 190

export interface FitRows {
  /** 卡片高度:撐到視窗底。列數不足時卡片也不縮,分頁列因此永遠在同一個位置 */
  height: number
  /** 表格放得下幾列 */
  rows: number
}

/**
 * 把表格卡片撐到視窗底,並回報放得下幾列 —— 畫面有多高就顯示多少列,整頁不長出卷軸。
 *
 * **高度一律量 DOM**(列高、表頭、分頁列),不寫死版面常數:寫死「一列 47px、
 * 保留 165px」的那一版少算了三列,底下空一大塊,而且字級或內距一改就再錯一次。
 * 唯一的常數是 shell 的下緣留白(`shell.css` 的 `.shell-main` padding-bottom)。
 *
 * 卡片內容變動時自動重量(第一次渲染 tbody 還沒有列可量,資料到位後才量得到真正的列高)。
 */
export function useFitRows(
  cardRef: RefObject<HTMLElement | null>,
  { min = 5, bottomGutter = 64, fallbackRowHeight = 46 } = {},
): FitRows {
  const [fit, setFit] = useState<FitRows>(() => ({
    height: Math.max(MIN_CARD_HEIGHT, window.innerHeight - ESTIMATED_TOP - bottomGutter),
    rows: min,
  }))

  // 量到過的列高記著:Skeleton 期間 tbody 沒有列可量,每次都退回常數會讓列數抖一下,
  // 而列數是查詢參數 —— 抖一下就是白打一次 API
  const rowHeight = useRef(fallbackRowHeight)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const measure = () => {
      // 用文件座標而不是 viewport 座標:捲動時 rect.top 會變小 → 列數變多 → 頁面更長,自己追自己
      const top = card.getBoundingClientRect().top + window.scrollY
      const height = Math.max(MIN_CARD_HEIGHT, window.innerHeight - top - bottomGutter)
      // 一支 ref 打天下:表頭/分頁列/第一列都在這張卡裡,不為了量高度再拉三個 ref
      const h = (sel: string) => card.querySelector(sel)?.getBoundingClientRect().height ?? 0
      rowHeight.current = h('tbody tr') || rowHeight.current
      const rows = rowsThatFit(height - h('thead') - h('[data-pager]'), rowHeight.current, min)
      // 值沒變就回傳同一個物件:React 據此跳過重繪,量測 → 重繪 → 再量測的迴圈才收得住
      setFit((prev) => (prev.height === height && prev.rows === rows ? prev : { height, rows }))
    }
    measure()
    // 卡片內容換掉(Skeleton → 表格、換頁、換篩選)就重量一次:真正的列高只有列存在時量得到
    const mutations = new MutationObserver(measure)
    mutations.observe(card, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => {
      mutations.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [cardRef, min, bottomGutter, fallbackRowHeight])

  return fit
}
