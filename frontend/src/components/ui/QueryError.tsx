import { Button } from 'antd'

// 查詢失敗的統一呈現(設計指南:錯誤要說「發生什麼、如何處理」):
// 卡片區塊用預設樣式;表格列內用 compact(由呼叫端包 <td colSpan>)
export default function QueryError({
  error,
  onRetry,
  title = '資料載入失敗',
  compact = false,
  retrying = false,
}: {
  error?: unknown
  onRetry?: () => void
  title?: string
  compact?: boolean
  /** 重試進行中:鈕轉圈並擋重複點擊(沒有回饋的話使用者會連按十幾次,每次都真的發請求) */
  retrying?: boolean
}) {
  const detail = error instanceof Error && error.message ? error.message : '請稍後再試'
  const body = (
    <>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>{detail}</div>
      {onRetry && (
        <Button size="small" style={{ marginTop: 12 }} loading={retrying} disabled={retrying} onClick={onRetry}>
          重試
        </Button>
      )}
    </>
  )
  if (compact) return <div style={{ textAlign: 'center', padding: 12 }}>{body}</div>
  return <div className="card" style={{ padding: 24, textAlign: 'center' }}>{body}</div>
}
