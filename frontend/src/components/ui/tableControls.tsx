import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Dropdown, Pagination } from 'antd'
import { FilterOutlined, SwapOutlined } from '@ant-design/icons'

// 手刻表格的排序/篩選控制:點標題切換 升冪→降冪→無;漏斗圖示開多選篩選
// (ReviewPage 首創的模式,抽出共用)

export interface SortState<K extends string> {
  key: K
  dir: 1 | -1
}

export function useSort<K extends string>(initial: SortState<K> | null = null) {
  const [sort, setSort] = useState<SortState<K> | null>(initial)
  const toggle = (key: K) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  return { sort, toggle }
}

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
