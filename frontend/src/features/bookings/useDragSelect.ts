import { useEffect, useState } from 'react'

/**
 * 格子拖曳批量選取:按下的那格決定這一拖是「選取」還是「取消」,掃過的每一格都套用。
 * 節次選擇器與固定借用的每週時段表共用這一份(兩邊的手感必須一樣)。
 *
 * 用 pointer 事件而非 mouse:滑鼠與觸控筆走同一條路徑,瀏覽器開始捲動時的 `pointercancel`
 * 也能乾淨地結束拖曳。移動一律掛在容器上 —— 觸控的 pointermove 只會送給起點元素
 * (implicit pointer capture),所以當下在哪一格要靠 `elementFromPoint` 反查 `data-drag-key`。
 *
 * ponytail: 觸控不設 `touch-action: none`,拖曳讓位給捲動 —— 兩張表在手機上都要橫向捲才看得完,
 * 擋掉捲動換來批量選取並不划算;觸控維持逐格點選。真要在手機拖曳再改成長按啟動。
 */
export function useDragSelect(apply: (key: string, to: boolean) => void) {
  const [dragTo, setDragTo] = useState<boolean | null>(null)

  useEffect(() => {
    const stop = () => setDragTo(null)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  /** 掛在格子容器上 */
  const containerProps = {
    onPointerMove: (e: React.PointerEvent) => {
      if (dragTo === null) return
      // 在視窗外放開滑鼠收不到 pointerup;按鍵已放開就結束拖曳
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        setDragTo(null)
        return
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const key = el instanceof HTMLElement ? el.dataset.dragKey : undefined
      if (key) apply(key, dragTo)
    },
  }

  /** 掛在每一格上(格子另外要帶 `data-drag-key`) */
  const start = (key: string, to: boolean) => {
    setDragTo(to)
    apply(key, to)
  }

  return { containerProps, start }
}
