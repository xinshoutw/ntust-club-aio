import { PERIODS } from './mock'

interface PeriodPickerProps {
  value: string[]
  onChange: (next: string[]) => void
}

// 節次複選按鈕(第 1–10、A–D)
export default function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const toggle = (p: string) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p])

  return (
    <div role="group" aria-label="節次" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {PERIODS.map((p) => {
        const on = value.includes(p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(p)}
            className="num"
            style={{
              minWidth: 42,
              height: 32,
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
