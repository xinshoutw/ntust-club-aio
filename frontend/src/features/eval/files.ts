// 檔案工具與 mock 檔案產生器(無其他 feature 依賴,避免循環匯入)
import { fileTypeOf, type EvalFile } from './types'

let fileSeq = 0
const nextFileId = () => `f${++fileSeq}`

export const todayStr = (): string => {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// mock 圖片:彩色 SVG 佔位(data URL,可直接預覽)
export const svgPhoto = (label: string, color: string, uploadedAt: string): EvalFile => ({
  id: nextFileId(),
  name: `${label}.svg`,
  type: 'image',
  size: 900,
  url: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${color}"/><text x="240" y="168" font-size="26" fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`,
  )}`,
  hash: `mock-${label}`,
  uploadedAt,
})

// 最小可渲染的單頁空白 PDF(示意檔案,iframe 可開啟)
const BLANK_PDF = `data:application/pdf;base64,${btoa(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF',
)}`

export const mockPdf = (name: string, uploadedAt: string): EvalFile => ({
  id: nextFileId(),
  name: `${name}.pdf`,
  type: 'pdf',
  size: 45_000,
  url: BLANK_PDF,
  uploadedAt,
})

// 結案送出時由表單資料生成的成果報告/心得彙整(mock 以空白 PDF 代替)
export const generatedPdf = (name: string): EvalFile => mockPdf(name, todayStr())

// 副檔名只當提示;宣稱 PDF 的檔案驗魔術位元組,冒名檔降級為 other(不進 iframe 預覽)
async function isPdfContent(f: File): Promise<boolean> {
  const head = new Uint8Array(await f.slice(0, 5).arrayBuffer())
  return String.fromCharCode(...head) === '%PDF-'
}

export async function toEvalFile(f: File, hash?: string): Promise<EvalFile> {
  let type = fileTypeOf(f.name)
  if (type === 'pdf' && !(await isPdfContent(f))) type = 'other'
  return {
    id: nextFileId(),
    name: f.name,
    type,
    size: f.size,
    url: URL.createObjectURL(f),
    hash,
    uploadedAt: todayStr(),
    raw: f,
  }
}

// 上傳檔移除/捨棄時釋放 object URL(mock 檔為 data URL,不受影響)
export function releaseFile(f: EvalFile): void {
  if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url)
}

export async function sha256(f: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await f.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 觸發瀏覽器下載(blob/data URL 皆可)
export function downloadEvalFile(f: EvalFile): void {
  const a = document.createElement('a')
  a.href = f.url
  a.download = f.name
  a.click()
}

// ---- 免壓縮 ZIP(store method)----
// ponytail: 僅打包不壓縮,約 60 行即可免依賴;需要壓縮時再換 CompressionStream/jszip

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export function zipStore(entries: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const now = dosDateTime(new Date())
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    // flags bit 11 = UTF-8 檔名;method 0 = store
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(now.time), ...u16(now.date), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0)]
    parts.push(new Uint8Array([...u32(0x04034b50), ...common]), name, e.data)
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name)
    offset += 30 + name.length + e.data.length
  }

  const centralSize = central.reduce((s, p) => s + p.length, 0)
  const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralSize), ...u32(offset), ...u16(0)])

  const chunks = [...parts, ...central, eocd]
  const out = new Uint8Array(chunks.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of chunks) {
    out.set(p, pos)
    pos += p.length
  }
  return new Blob([out], { type: 'application/zip' })
}

// 照片打包下載(zip 僅 archive 不壓縮;檔名加序號避免重名)
export async function downloadPhotosZip(zipName: string, files: EvalFile[]): Promise<void> {
  const entries = await Promise.all(
    files.map(async (f, i) => ({
      name: `${String(i + 1).padStart(2, '0')}_${f.name}`,
      data: new Uint8Array(await (await fetch(f.url)).arrayBuffer()),
    })),
  )
  const url = URL.createObjectURL(zipStore(entries))
  const a = document.createElement('a')
  a.href = url
  a.download = `${zipName}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
