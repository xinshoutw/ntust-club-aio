// 上傳檔案共用工具:SHA-256 去重、魔術位元組驗證(副檔名/accept 擋不住改名檔)、容量顯示
// 全站上傳點一律走這裡與 components/ui/AttachmentArea,勿再各自手刻

// 所有允許圖片的上傳點一律含 HEIC/HEIF 等特規格式(accept 僅是選檔提示,實際以魔術位元組為準)
export const IMAGE_ACCEPT = 'image/*,.heic,.heif,.avif'

// 結案附件(保單、租車契約、簽到表、講師資料…):收的正是站內預覽得了的四類,
// 與後端 files.REPORT_DOC 同一組。改這裡就要改那裡。
// 選檔對話框可切「所有檔案」繞過 accept,選檔時另比一次副檔名 ——
// 不擋的話 .zip 要等按下送出、照片都傳完之後才吃後端 415,然後整批回滾
export const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.avif',
]
export const CLOSE_DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', ...IMAGE_EXTENSIONS]

/** 後端以副檔名收口(`files._extension`),魔術位元組驗的是內容 —— 兩道都要過。
 *  內容是 PNG 但檔名 `photo.txt` 的檔前端全放行,送出時才 415、整批回滾 */
export const hasAllowedExtension = (name: string, exts: readonly string[]): boolean =>
  exts.some((ext) => name.toLowerCase().endsWith(ext))
// 逐項列舉而不用 `image/*`:那會讓選檔器收得下後端不收的 svg/ico,
// 使用者先選得到、再被前端擋一次,白跑一趟
export const CLOSE_DOC_ACCEPT = CLOSE_DOC_EXTENSIONS.join(',')

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
