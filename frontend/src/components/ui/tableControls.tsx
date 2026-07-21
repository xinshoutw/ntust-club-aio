import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Dropdown, Pagination } from 'antd'
import { CaretDownFilled, CaretUpFilled, FilterOutlined, SwapOutlined } from '@ant-design/icons'

// 手刻表格的排序/篩選控制:點標題切換 升冪→降冪→無;漏斗圖示開多選篩選
// (ReviewPage 首創的模式,抽出共用)

export interface SortState<K extends string> {
  key: K
  dir: 1 | -1
}

/** @deprecated 全站改用 useMultiSort(單欄是它的退化情形);待所有頁面遷移後移除 */
export function useSort<K extends string>(initial: SortState<K> | null = null) {
  const [sort, setSort] = useState<SortState<K> | null>(initial)
  const toggle = (key: K) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  return { sort, toggle }
}

/** @deprecated 全站改用 MultiSortButton;待所有頁面遷移後移除 */
export function SortButton<K extends string>({
  label,
  sortKey,
  sort,
  onToggle,
}: {
  label: string
  sortKey: K
  sort: SortState<K> | null
  onToggle: (key: K) => void
}) {
  return (
    <button type="button" className="link-btn" style={{ padding: 0, fontWeight: 500 }} onClick={() => onToggle(sortKey)}>
      {label} <SwapOutlined rotate={90} style={{ fontSize: 11, color: sort?.key === sortKey ? 'var(--seal)' : undefined }} />
    </button>
  )
}

// ---- 多欄排序(2026-07-21 需求方:點擊的「順序」直接影響最終排序結果)----
// 規則:最後點擊的欄=最高優先,先前啟用的欄自動降為次要鍵;
// 同欄再點:升冪→降冪→移除(移除後回落到次鍵,全空則回頁面預設鏈);至多 3 鍵。

export type SortEntry<K extends string> = SortState<K>

export function useMultiSort<K extends string>(defaults: readonly SortEntry<K>[] = []) {
  const [stack, setStack] = useState<SortEntry<K>[]>([])
  const toggle = (key: K) =>
    setStack((prev) => {
      const idx = prev.findIndex((e) => e.key === key)
      if (idx === 0) {
        // 主鍵:升冪→降冪→移除
        return prev[0].dir === 1 ? [{ key, dir: -1 as const }, ...prev.slice(1)] : prev.slice(1)
      }
      if (idx > 0) {
        // 已啟用的次鍵:升級為主鍵(保留方向)
        return [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)]
      }
      return [{ key, dir: 1 as const }, ...prev].slice(0, 3)
    })
  const clear = () => setStack([])
  // stack=使用者點出的排序;entries=實際生效鏈(空 stack 回落頁面預設)
  const entries = stack.length ? stack : [...defaults]
  return { entries, stack, toggle, clear }
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

// 排序標題鈕(多欄版):啟用時顯示方向 caret;非主鍵補優先序小字(2/3)
export function MultiSortButton<K extends string>({
  label,
  sortKey,
  stack,
  onToggle,
}: {
  label: string
  sortKey: K
  /** 使用者點出的排序鏈(useMultiSort 的 stack,不含頁面預設) */
  stack: readonly SortEntry<K>[]
  onToggle: (key: K) => void
}) {
  const idx = stack.findIndex((e) => e.key === sortKey)
  const active = idx >= 0
  const dir = active ? stack[idx].dir : null
  return (
    <button
      type="button"
      className="link-btn"
      style={{ padding: 0, fontWeight: 500 }}
      aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : undefined}
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
      {active && stack.length > 1 && idx > 0 && (
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
