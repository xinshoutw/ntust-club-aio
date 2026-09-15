import { useEffect, useRef } from 'react'

/** 招生狀態徽章的樣式鍵。字卡與詳細頁共用一份 —— 兩份遲早一份漏改。 */
export const BADGE_CLASS: Record<string, string> = {
  歡迎加入: 'welcome',
  暫不開放: 'closed',
  額滿: 'full',
}

/** 沒上傳形象圖的社團要有東西可看,否則導覽頁是一整面灰卡。
 *
 *  用社團 id 當種子在 canvas 生,每社固定拿到同一張:不存檔、不佔配額、
 *  不必後端出圖,換社團也不會換圖。 */
function seeded(seed: number): () => number {
  let s = seed * 9301 + 49297
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

function drawBanner(canvas: HTMLCanvasElement, id: number) {
  const w = (canvas.width = 900)
  const h = (canvas.height = 300)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rnd = seeded(id * 17 + 3)
  const light = id % 3 === 0
  const base = Math.floor(rnd() * 360)
  ctx.fillStyle = `hsl(${base} 32% ${light ? 74 : 32}%)`
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 5; i++) {
    const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 10, rnd() * w, rnd() * h, 180 + rnd() * 320)
    const hue = (base + (rnd() * 90 - 45) + 360) % 360
    g.addColorStop(0, `hsl(${hue} 46% ${light ? 84 : 46}% / 0.85)`)
    g.addColorStop(1, `hsl(${hue} 40% ${light ? 66 : 20}% / 0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

function drawAvatar(canvas: HTMLCanvasElement, id: number, name: string) {
  const size = (canvas.width = canvas.height = 160)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rnd = seeded(id * 7919)
  const hue = Math.floor(rnd() * 360)
  ctx.fillStyle = `hsl(${hue} 34% 42%)`
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = `hsl(${(hue + 40) % 360} 40% 62%)`
  ctx.beginPath()
  ctx.arc(rnd() * size, rnd() * size, 56, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '600 74px "Noto Sans TC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText([...name][0] ?? '社', size / 2, size / 2 + 6)
}

/** 形象圖:有上傳就顯示,沒有就畫一張這個社團固定的預設圖。 */
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
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (kind === 'banner') drawBanner(canvas, clubId)
    else drawAvatar(canvas, clubId, clubName)
  }, [kind, clubId, clubName, url])

  if (url) return <img src={url} alt="" loading="lazy" />
  // aria-hidden:預設圖不帶任何資訊,社團名稱就在旁邊的文字裡
  return <canvas ref={ref} aria-hidden="true" />
}
