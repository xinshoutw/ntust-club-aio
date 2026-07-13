import { useEffect, useRef, useState } from 'react'
import { PERIODS } from './mock'

interface PeriodPickerProps {
  value: string[]
  onChange: (next: string[]) => void
  size?: 'small' | 'middle'
  nowrap?: boolean
}

// 節次複選按鈕(第 1–10、A–D);支援按住拖曳批量選取/取消
export default function PeriodPicker({ value, onChange, size = 'middle', nowrap = false }: PeriodPickerProps) {
  const [dragTo, setDragTo] = useState<boolean | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    const up = () => setDragTo(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const apply = (p: string, to: boolean) => {
    const cur = valueRef.current
    const has = cur.includes(p)
    if (to && !has) onChange([...cur, p])
    if (!to && has) onChange(cur.filter((x) => x !== p))
  }

  const h = size === 'small' ? 28 : 32
  return (
    <div role="group" aria-label="節次" style={{ display: 'flex', flexWrap: nowrap ? 'nowrap' : 'wrap', overflowX: nowrap ? 'auto' : undefined, gap: 6, userSelect: 'none', paddingBottom: nowrap ? 2 : 0 }}>
      {PERIODS.map((p) => {
        const on = value.includes(p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onMouseDown={(e) => {
              e.preventDefault()
              const to = !on
              setDragTo(to)
              apply(p, to)
            }}
            onMouseEnter={() => {
              if (dragTo !== null) apply(p, dragTo)
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
              background: on ? 'var(--seal)' : '#fff',
              color: on ? '#fff' : 'var(--ink)',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
