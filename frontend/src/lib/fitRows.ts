import { useLayoutEffect, useState, type RefObject } from 'react'

/** 可用高度放得下幾列;至少 min 列(視窗再矮也要看得到東西,寧可讓那一頁自己捲) */
export const rowsThatFit = (available: number, rowHeight: number, min: number): number =>
  Math.max(min, Math.floor(available / rowHeight))

interface FitRowsOptions {
  /** 一列的高度(含 padding 與分隔線) */
  rowHeight: number
  /** 表格以外還要留給誰:表頭 + 分頁列 + shell 下緣留白 */
  reserved: number
  min?: number
  /** 首次渲染時容器還沒進 DOM,先用這個估容器上緣(shell 頂欄 + 頁首) */
  estimatedTop?: number
}

/**
 * 讓每頁筆數跟著視窗高度走:畫面有多高就顯示多少列,整頁不長出垂直卷軸。
 *
 * `ref` 指到表格所在的卡片。可用高度 = 視窗高 − 卡片在**文件**中的上緣 − `reserved`;
 * 用文件座標而不是 `getBoundingClientRect().top`,否則捲動時量到的上緣會變小、
 * 列數變多、頁面又變長,自己追自己。
 *
 * 首次以視窗高估一次,估中的話查詢只會發一次 —— 直接從固定值起跳的話,
 * 每次進頁都必然多打一次 API。
 */
export function useFitRows(
  ref: RefObject<HTMLElement | null>,
  { rowHeight, reserved, min = 5, estimatedTop = 190 }: FitRowsOptions,
): number {
  const [rows, setRows] = useState(() =>
    rowsThatFit(window.innerHeight - estimatedTop - reserved, rowHeight, min),
  )
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setRows(rowsThatFit(window.innerHeight - top - reserved, rowHeight, min))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [ref, rowHeight, reserved, min])
  return rows
}
