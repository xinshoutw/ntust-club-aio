// 上傳檔案共用工具:SHA-256 去重、魔術位元組驗證(副檔名/accept 擋不住改名檔)、容量顯示
// 全站上傳點一律走這裡與 components/ui/AttachmentArea,勿再各自手刻

// 所有允許圖片的上傳點一律含 HEIC/HEIF 等特規格式(accept 僅是選檔提示,實際以魔術位元組為準)
export const IMAGE_ACCEPT = 'image/*,.heic,.heif,.avif'

export async function sha256(f: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await f.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

const headBytes = async (f: File, n: number) => new Uint8Array(await f.slice(0, n).arrayBuffer())
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to))

// ISO BMFF ftyp 影像品牌(HEIC/HEIF/AVIF);其餘 ftyp 品牌視為影片(mp4/mov/m4v…)
const BMFF_IMAGE_BRANDS = ['heic', 'heix', 'heif', 'hevc', 'mif1', 'msf1', 'avif', 'avis']

// 常見影像:JPEG/PNG/GIF/WebP/BMP/TIFF/HEIC/HEIF/AVIF
export async function isImageFile(f: File): Promise<boolean> {
  const head = await headBytes(f, 12)
  if (head.length < 12) return false
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true // JPEG
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true // PNG
  if (ascii(head, 0, 4) === 'GIF8') return true
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return true
  if (ascii(head, 0, 2) === 'BM') return true // BMP
  if (ascii(head, 0, 4) === 'II*\0' || ascii(head, 0, 4) === 'MM\0*') return true // TIFF
  if (ascii(head, 4, 8) === 'ftyp') return BMFF_IMAGE_BRANDS.includes(ascii(head, 8, 12))
  return false
}

export async function isPdfFile(f: File): Promise<boolean> {
  const head = await headBytes(f, 5)
  return head.length === 5 && ascii(head, 0, 5) === '%PDF-'
}

// 常見影片:MP4/MOV(ftyp 非影像品牌)、WebM/MKV(EBML)、AVI(RIFF)
export async function isVideoFile(f: File): Promise<boolean> {
  const head = await headBytes(f, 12)
  if (head.length < 12) return false
  if (ascii(head, 4, 8) === 'ftyp') return !BMFF_IMAGE_BRANDS.includes(ascii(head, 8, 12))
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true // WebM/MKV
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'AVI ') return true
  return false
}
