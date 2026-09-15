import { useState, type CSSProperties } from 'react'

/** 招生狀態徽章的樣式鍵。字卡與詳細頁共用一份 —— 兩份遲早一份漏改。 */
export const BADGE_CLASS: Record<string, string> = {
  歡迎加入: 'welcome',
  暫不開放: 'closed',
  額滿: 'full',
}

/** 沒上傳形象圖的社團要有東西可看,否則導覽頁是一整面灰卡。
 *
 *  用社團 id 當種子產色,每社固定拿到同一張:不存檔、不佔配額、不必後端出圖,
 *  換社團也不會換圖。畫在 CSS 漸層上而不是 canvas —— 導覽頁一次要掛六十幾張,
 *  每張 canvas 都是一塊 backing store 加一輪主執行緒繪製,而這裡要的只是一塊
 *  有顏色的底;瀏覽器合成漸層不花這筆錢,拿不到 2d context 時也不會開天窗。 */
function seeded(seed: number): () => number {
  let s = seed * 9301 + 49297
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`
}

function bannerStyle(id: number): CSSProperties {
  const rnd = seeded(id * 17 + 3)
  const light = id % 3 === 0
  const base = Math.floor(rnd() * 360)
  const blobs = Array.from({ length: 5 }, () => {
    const x = pct(rnd() * 100)
    const y = pct(rnd() * 100)
    const r = pct(20 + rnd() * 35)
    const hue = Math.round((base + (rnd() * 90 - 45) + 360) % 360)
    return (
      `radial-gradient(circle at ${x} ${y}, ` +
      `hsl(${hue} 46% ${light ? 84 : 46}% / .85), hsl(${hue} 40% ${light ? 66 : 20}% / 0) ${r})`
    )
  })
  return {
    backgroundColor: `hsl(${base} 32% ${light ? 74 : 32}%)`,
    backgroundImage: blobs.join(','),
  }
}

function avatarStyle(id: number): CSSProperties {
  const rnd = seeded(id * 7919)
  const hue = Math.floor(rnd() * 360)
  const x = pct(rnd() * 100)
  const y = pct(rnd() * 100)
  return {
    backgroundColor: `hsl(${hue} 34% 42%)`,
    backgroundImage:
      `radial-gradient(circle at ${x} ${y}, ` +
      `hsl(${(hue + 40) % 360} 40% 62%) 0 35%, transparent 35%)`,
  }
}

/** 形象圖:有上傳就顯示,沒有(或連不到)就是這個社團固定的那一張預設圖。 */
export default function ClubArt({
  kind,
  url,
  clubId,
  clubName,
}: {
  kind: 'banner' | 'avatar'
  url: string | null
  clubId: number
  clubName: string
}) {
  // 換圖會在 commit 後立刻刪掉舊檔,而列表快取(後端 max-age 5 分 + 前端 staleTime
  // 5 分)最長十分鐘還在發舊的 file id。沒有 onError 就是一格破圖,而要墊上去的
  // 預設圖明明就在下面。存網址而不是布林:url 一換就自動不算失敗過
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (url && url !== failedUrl) {
    return <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
  }
  // aria-hidden:預設圖不帶任何資訊,社團名稱就在旁邊的文字裡
  if (kind === 'banner') {
    return <div className="club-art" style={bannerStyle(clubId)} aria-hidden="true" />
  }
  return (
    <div className="club-art club-art-avatar" style={avatarStyle(clubId)} aria-hidden="true">
      {[...clubName][0] ?? '社'}
    </div>
  )
}
