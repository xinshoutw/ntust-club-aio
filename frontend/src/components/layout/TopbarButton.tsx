import { Button, type ButtonProps } from 'antd'

/** topbar 的文字鈕。
 *
 *  手機上收成圖示鈕(`shell.css` 的 `.topbar-cta`):頁名加上兩三顆四字鈕在 320px
 *  的一列裡擠不下,頁名會先被截成「社團…」。**整顆不隱藏** —— 這些入口在抽屜的
 *  側欄裡沒有一份,藏掉等於手機上到不了(`aria-label` 留著,圖示鈕仍念得出名字)。 */
export default function TopbarButton({
  label,
  className,
  ...rest
}: { label: string } & ButtonProps) {
  return (
    // className 要合併不是被蓋掉:呼叫端傳一個自己的 class 就會靜靜地把手機收合弄丟
    <Button className={['topbar-cta', className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
      {/* 只藏自己那顆 span,不要去猜 AntD 的內部結構:圖示包在 `.ant-btn-icon` 裡
          而不是 `.anticon`,用 `:not(.anticon)` 會把圖示一起藏掉,剩一顆空按鈕 */}
      <span className="topbar-cta-label">{label}</span>
    </Button>
  )
}
