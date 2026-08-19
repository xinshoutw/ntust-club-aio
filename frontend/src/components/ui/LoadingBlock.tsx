import type { ReactNode } from 'react'
import { Skeleton } from 'antd'

// 首次載入的佔位(design-guide §6「載入用 Skeleton,不用整頁 spinner」)。
// pending 一律傳 isPending —— 手上一筆資料都沒有時才鋪 Skeleton;
// 翻頁與背景重抓靠 placeholderData 留住舊資料,不經過這裡(閃成 Skeleton 反而比舊資料難讀)。
export default function LoadingBlock({
  pending,
  rows = 4,
  children,
}: {
  pending: boolean
  rows?: number
  children?: ReactNode
}) {
  if (pending) return <Skeleton active paragraph={{ rows }} style={{ padding: 20 }} />
  return <>{children}</>
}
