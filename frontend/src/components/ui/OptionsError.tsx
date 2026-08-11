import { Button } from 'antd'

// 選項查詢失敗的行內標記:放在選擇器旁邊(或整個取代它)。
// 與 lib/selectOptions.notFoundText 分工 —— 那支管「選單是空的」,
// 這支管「選單看起來正常但其實不完整」:例如學期選項一定會補上當學期,
// 查詢掛掉時畫面只少了所有歷史學期,不說出來根本看不出來。
export default function OptionsError({
  what,
  error,
  onRetry,
}: {
  /** 載不到的東西,例:'學期清單' */
  what: string
  error?: Error | null
  onRetry: () => void
}) {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#C13B34' }}
      // 403 與網路中斷長得一樣,原因掛在 title 上(版面留給選擇器)
      title={error?.message}
    >
      {what}載入失敗
      <Button size="small" onClick={onRetry}>重試</Button>
    </span>
  )
}
