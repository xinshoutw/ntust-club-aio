import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// 未存檔守衛:頁面註冊 dirty 狀態,shell(側欄/頂欄)導航前查詢並彈確認;
// 關閉分頁/重新整理由 beforeunload 攔截。SPA 內部其餘導航(react-router 宣告式
// router 不支援 useBlocker)之後接資料 router 再收斂。
type GuardRef = RefObject<boolean>

const UnsavedContext = createContext<GuardRef | null>(null)

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const ref = useRef(false)
  return <UnsavedContext.Provider value={ref}>{children}</UnsavedContext.Provider>
}

// 頁面端:註冊「目前是否有未儲存變更」;並在 dirty 時攔截關閉分頁
export function useUnsavedGuard(isDirty: boolean): void {
  const ref = useContext(UnsavedContext)
  useEffect(() => {
    if (!ref) return
    ref.current = isDirty
    return () => {
      ref.current = false
    }
  }, [ref, isDirty])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Safari 以 returnValue 為準
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])
}

/** AntD Form 版:掛上 onValuesChange 即可,送出成功後(頁面不離開時)呼叫 clear。
 *
 * extraDirty 給 Form 之外的輸入(時段選取、待上傳附件這類 local state)—— 那些
 * 往往才是離開後救不回來的東西,onValuesChange 看不到。 */
export function useFormUnsavedGuard(extraDirty = false): {
  onValuesChange: () => void
  clear: () => void
} {
  const [dirty, setDirty] = useState(false)
  useUnsavedGuard(dirty || extraDirty)
  return {
    onValuesChange: useCallback(() => setDirty(true), []),
    clear: useCallback(() => setDirty(false), []),
  }
}

// shell 端:導航前查詢是否需要確認
export function useHasUnsaved(): () => boolean {
  const ref = useContext(UnsavedContext)
  return useCallback(() => !!ref?.current, [ref])
}
