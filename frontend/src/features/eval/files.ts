// 檔案工具(無其他 feature 依賴,避免循環匯入)
import { isPdfFile } from '../../lib/uploads'
import { downloadBlob } from '../../lib/download'
import { fetchFile } from '../../api/client'
import { fileTypeOf, type EvalFile } from './types'

let fileSeq = 0
const nextFileId = () => `f${++fileSeq}`

const todayStr = (): string => {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export async function toEvalFile(f: File, hash?: string): Promise<EvalFile> {
  // 副檔名只當提示;宣稱 PDF 的檔案驗魔術位元組,冒名檔降級為 other(不進 iframe 預覽)
  let type = fileTypeOf(f.name)
  if (type === 'pdf' && !(await isPdfFile(f))) type = 'other'
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

// 上傳檔移除/捨棄時釋放 object URL
export function releaseFile(f: EvalFile): void {
  if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url)
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
    files.map(async (f, i) => {
      const res = await fetchFile(f.url)
      // 不檢查就把錯誤信封的 JSON 當照片打進 zip:使用者拿到一包壞檔卻毫無提示
      if (!res.ok) throw new Error(`無法取得 ${f.name}(HTTP ${res.status})`)
      return {
        name: `${String(i + 1).padStart(2, '0')}_${f.name}`,
        data: new Uint8Array(await res.arrayBuffer()),
      }
    }),
  )
  downloadBlob(`${zipName}.zip`, zipStore(entries))
}
