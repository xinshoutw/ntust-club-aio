import { useEffect, useRef } from 'react'

// 確認型彈窗開啟即聚焦確認鈕(Enter 直接送出)。
// 不用原生 autoFocus:它會把 footer 捲入視野,彈窗比視窗高時標題會被捲走。
// focus({ preventScroll: true }) 聚焦但維持捲動在彈窗頂端。
export function useModalAutoFocus(open: boolean) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!open) return
    // rAF 等 Modal 內容掛載/進場動畫起始後再聚焦
    const raf = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(raf)
  }, [open])
  return ref
}
