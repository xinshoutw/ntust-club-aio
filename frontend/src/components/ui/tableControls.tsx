import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Dropdown, Pagination } from 'antd'
import { CaretDownFilled, CaretUpFilled, FilterOutlined, SwapOutlined } from '@ant-design/icons'

// 手刻表格的排序/篩選控制:點主鍵切換升降冪(無移除態,清除走 reset),
// 點其他欄位插為主鍵;漏斗圖示開多選篩選

export interface SortState<K extends string> {
  key: K
  dir: 1 | -1
}

// ---- 多欄排序(點擊的「順序」直接影響最終排序結果)----
// 規則:最後點擊的欄=最高優先,先前啟用的欄自動降為次要鍵;
// 同欄再點=升降冪互換(不提供「移除」態:表格永遠有明確排序,
// 指示器與實際生效鏈永遠一致——entries 即生效鏈,初始=頁面預設);至多 3 鍵。

export type SortEntry<K extends string> = SortState<K>

export function useMultiSort<K extends string>(defaults: readonly SortEntry<K>[] = []) {
  const [entries, setEntries] = useState<SortEntry<K>[]>([...defaults])
  const toggle = (key: K) =>
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.key === key)
      if (idx === 0) {
        // 主鍵:升降冪互換
        return [{ key, dir: (prev[0].dir === 1 ? -1 : 1) as 1 | -1 }, ...prev.slice(1)]
      }
      if (idx > 0) {
        // 已啟用的次鍵:升級為主鍵(保留方向)
        return [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)]
      }
      return [{ key, dir: 1 as const }, ...prev].slice(0, 3)
    })
  const reset = () => setEntries([...defaults])
  return { entries, toggle, reset }
}

/** 伺服器端排序參數:'-a,b' 逗號序列(後端 parse_sort 多鍵格式);空鏈回 undefined */
export function sortParam<K extends string>(entries: readonly SortEntry<K>[]): string | undefined {
  return entries.length ? entries.map((e) => `${e.dir === -1 ? '-' : ''}${e.key}`).join(',') : undefined
}

/** client-side 表:依排序鏈套用比較器(cmps 一律寫升冪版,dir 由此處翻轉) */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  entries: readonly SortEntry<K>[],
  cmps: Record<K, (a: T, b: T) => number>,
): T[] {
  if (!entries.length) return [...rows]
  return [...rows].sort((a, b) => {
    for (const e of entries) {
      const r = cmps[e.key](a, b)
      if (r !== 0) return e.dir === -1 ? -r : r
    }
    return 0
  })
}

// 排序標題鈕(多欄版):啟用時顯示方向 caret;非主鍵補優先序小字(2/3)。
// entries=生效排序鏈(useMultiSort 的 entries,含頁面預設)——指示器永遠反映實際排序
export function MultiSortButton<K extends string>({
  label,
  sortKey,
  entries,
  onToggle,
}: {
  label: string
  sortKey: K
  /** 生效中的排序鏈(useMultiSort 的 entries) */
  entries: readonly SortEntry<K>[]
  onToggle: (key: K) => void
}) {
  const idx = entries.findIndex((e) => e.key === sortKey)
  const active = idx >= 0
  const dir = active ? entries[idx].dir : null
  const dirText = dir === 1 ? '升冪' : '降冪'
  return (
    <button
      type="button"
      className="link-btn"
      style={{ padding: 0, fontWeight: 500 }}
      title={active ? `${label}:${dirText}(第 ${idx + 1} 排序鍵)` : `依${label}排序`}
      onClick={() => onToggle(sortKey)}
    >
      {label}{' '}
      {active ? (
        dir === 1 ? (
          <CaretUpFilled style={{ fontSize: 11, color: 'var(--seal)' }} />
        ) : (
          <CaretDownFilled style={{ fontSize: 11, color: 'var(--seal)' }} />
        )
      ) : (
        <SwapOutlined rotate={90} style={{ fontSize: 11 }} />
      )}
      {active && entries.length > 1 && idx > 0 && (
        <span style={{ fontSize: 10, color: 'var(--seal)', verticalAlign: 'super' }}>{idx + 1}</span>
      )}
    </button>
  )
}

/** 固定欄寬表格的 colgroup:number=px、string 直接作為 CSS 寬(如 '32%'、'auto') */
export function Cols({ widths }: { widths: readonly (number | string)[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: typeof w === 'number' ? `${w}px` : w }} />
      ))}
    </colgroup>
  )
}

// 全站統一分頁:置中、無數字頁碼鈕(simple 模式=上一頁/可輸入跳頁的「x / y」/下一頁),只有一頁也顯示
export function Pager({
  page,
  pageSize,
  total,
  onChange,
  style,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 14px', ...style }}>
      <Pagination
        simple
        current={page}
        pageSize={pageSize}
        total={Math.max(total, 1)}
        onChange={onChange}
        showSizeChanger={false}
      />
    </div>
  )
}

export function FilterButton({
  options,
  selected,
  onChange,
  label,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  label: string
}) {
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: options.map((o) => ({ key: o, label: o })),
        selectable: true,
        multiple: true,
        selectedKeys: selected,
        onSelect: ({ selectedKeys }) => onChange(selectedKeys),
        onDeselect: ({ selectedKeys }) => onChange(selectedKeys),
      }}
    >
      <button type="button" className="link-btn" aria-label={label} style={{ padding: 0 }}>
        <FilterOutlined style={{ fontSize: 11, color: selected.length ? 'var(--seal)' : 'var(--steel)' }} />
      </button>
    </Dropdown>
  )
}
