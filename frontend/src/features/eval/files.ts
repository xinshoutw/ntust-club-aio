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
