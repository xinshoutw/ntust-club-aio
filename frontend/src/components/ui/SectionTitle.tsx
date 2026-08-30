import type { CSSProperties, ReactNode } from 'react'

/** 彈窗/卡片內的分段標題:標題文字 + 一條分隔線。活動詳情、審核、結案審核共用。 */
export default function SectionTitle({
  children,
  first,
  style,
}: {
  children: ReactNode
  /** 區塊的第一個標題:不留上方間距 */
  first?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        margin: first ? '0 0 10px' : '22px 0 10px',
        paddingBottom: 6,
        borderBottom: '1px solid var(--line)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
