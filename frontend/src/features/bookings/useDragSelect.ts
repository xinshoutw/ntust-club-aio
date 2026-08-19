import { useEffect, useRef, useState } from 'react'

/**
 * 格子拖曳批量選取:按下的那格決定這一拖是「選取」還是「取消」,掃過的每一格都套用。
 * 節次選擇器與固定借用的每週時段表共用這一份(兩邊的手感必須一樣)。
 *
 * 滑鼠/觸控筆:pointerdown 即套用並開始拖曳,容器的 pointermove 以 `elementFromPoint`
 * 反查 `data-drag-key` 找出當下掃到哪一格(觸控的 pointermove 只送給起點元素)。
 *
 * **觸控只認 click,按下當下不套用**:兩張時段表在手機上都要橫向捲,而手指按在格子上
 * 開始捲是常態 —— 按下即套用會讓每次捲動都誤選一格,而捲動觸發的 pointercancel
 * 收得掉拖曳狀態、收不回已經套用的切換。捲動不會產生 click,單點才會。
 */
export function useDragSelect(apply: (key: string, to: boolean) => void) {
  const [dragTo, setDragTo] = useState<boolean | null>(null)
  // 這次互動是否已在 pointerdown 套用過(避免滑鼠的 click 再套用一次)
  const appliedOnDown = useRef(false)

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
      if (dragTo === null || e.pointerType === 'touch') return
      // 在視窗外放開滑鼠收不到 pointerup;按鍵已放開就結束拖曳
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        setDragTo(null)
        return
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!(el instanceof HTMLElement)) return
      // 停用的格子拖曳掃過去也不能套用:elementFromPoint 照樣看得到 disabled 的按鈕,
      // 只擋 pointerdown 的話,從別處起拖再掃過來仍然選得到
      if (el instanceof HTMLButtonElement && el.disabled) return
      const key = el.dataset.dragKey
      if (key) apply(key, dragTo)
    },
  }

  /** 掛在每一格(<button>)上;disabled 的格子只是不套用,事件仍要接以維持旗標 */
  const cellProps = (key: string, on: boolean, disabled = false) => ({
    'data-drag-key': key,
    onPointerDown: (e: React.PointerEvent) => {
      appliedOnDown.current = false
      if (disabled || e.pointerType === 'touch') return
      e.preventDefault() // 拖曳時不要選到文字
      appliedOnDown.current = true
      setDragTo(!on)
      apply(key, !on)
    },
    onClick: () => {
      // 觸控單點與鍵盤 Enter/Space 都走這裡(鍵盤沒有 pointerdown,旗標由 onKeyDown 歸零)
      if (!appliedOnDown.current && !disabled) apply(key, !on)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') appliedOnDown.current = false
    },
  })

  return { containerProps, cellProps }
}
