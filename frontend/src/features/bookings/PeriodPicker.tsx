import { useEffect, useRef, useState } from 'react'
import { PERIODS } from '../../api/bookings'

interface PeriodPickerProps {
  value: string[]
  onChange: (next: string[]) => void
  size?: 'small' | 'middle'
  nowrap?: boolean
  /** 禁選節次(例:選「今天」時已開始的節次);拖曳掃過也不套用 */
  disabledPeriods?: string[]
}

// 節次複選按鈕(第 1–10、A–D);支援按住拖曳批量選取/取消
export default function PeriodPicker({ value, onChange, size = 'middle', nowrap = false, disabledPeriods = [] }: PeriodPickerProps) {
  const [dragTo, setDragTo] = useState<boolean | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    const up = () => setDragTo(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const apply = (p: string, to: boolean) => {
    if (disabledPeriods.includes(p)) return
    const cur = valueRef.current
    const has = cur.includes(p)
    if (to && !has) onChange([...cur, p])
    if (!to && has) onChange(cur.filter((x) => x !== p))
  }

  const h = size === 'small' ? 28 : 32
  return (
    <div role="group" aria-label="時段" style={{ display: 'flex', flexWrap: nowrap ? 'nowrap' : 'wrap', overflowX: nowrap ? 'auto' : undefined, gap: 6, userSelect: 'none', paddingBottom: nowrap ? 2 : 0 }}>
      {PERIODS.map((p) => {
        const on = value.includes(p)
        const off = disabledPeriods.includes(p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            disabled={off}
            title={off ? '該時段已開始' : undefined}
            onMouseDown={(e) => {
              e.preventDefault()
              if (off) return
              const to = !on
              setDragTo(to)
              apply(p, to)
            }}
            onMouseEnter={(e) => {
              if (dragTo === null) return
              // 在視窗外放開滑鼠收不到 mouseup;按鍵已放開就結束拖曳
              if (e.buttons === 0) {
                setDragTo(null)
                return
              }
              apply(p, dragTo)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                apply(p, !on)
              }
            }}
            className="num"
            style={{
              minWidth: 40,
              height: h,
              padding: '0 8px',
              borderRadius: 6,
              border: on ? '1px solid var(--seal)' : '1px solid var(--line)',
              background: off ? '#EEF0F3' : on ? 'var(--seal)' : '#fff',
              color: off ? 'var(--muted)' : on ? '#fff' : 'var(--ink)',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: off ? 'not-allowed' : 'pointer',
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
