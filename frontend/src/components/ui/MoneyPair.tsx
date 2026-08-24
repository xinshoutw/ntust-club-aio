// 金額欄的「自籌 / 核定」:兩個數字各自靠右佔一個固定寬的盒子,中間夾一個固定寬的斜線 ——
// 表頭與內容才對得起來(`.tb.dense` 的 th 是 12px、td 是 13px,`ch` 在兩邊不等寬,
// 只能用 px)。68px 放得下 `$999,999`;用 minWidth 讓破六位數的自己撐開。
// 社團端活動列表與行政端所有活動共用同一份,否則兩張表的欄位對不齊
const MONEY_BOX: React.CSSProperties = { display: 'inline-block', minWidth: 68, textAlign: 'right' }
const MONEY_SEP: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  textAlign: 'center',
  color: 'var(--steel)',
}

export default function MoneyPair({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <>
      <span style={MONEY_BOX}>{left}</span>
      <span style={MONEY_SEP}>/</span>
      <span style={MONEY_BOX}>{right}</span>
    </>
  )
}
