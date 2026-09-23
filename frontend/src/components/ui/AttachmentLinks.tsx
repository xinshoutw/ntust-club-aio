import { fileDownloadUrl } from '../../api/adminFiles'
import { useFilePreview } from '../../features/eval/useFilePreview'
import { fileTypeOf, type EvalFile } from '../../features/eval/types'

interface AttachmentFile {
  id: string
  name: string
}

// 圖片只進 AntD 的圖片預覽,那裡不顯示檔案大小(EvalFile.size 只給 PDF/Word 彈窗的標題用)
const asImage = (f: AttachmentFile): EvalFile => ({
  id: f.id,
  name: f.name,
  type: 'image',
  size: 0,
  url: fileDownloadUrl(f.id),
  uploadedAt: '',
})

interface AttachmentLinksProps {
  files: readonly AttachmentFile[]
  /** 只出連結本身(放進表格格子,沒有附件時顯示什麼由呼叫端決定);
   *  預設包成一行 12px 的區塊 */
  inline?: boolean
}

/**
 * 單據附件的一行連結(「a.jpg · b.mp4」)。圖片開 AntD 的圖片預覽,同一行的圖片左右切換
 * (design-guide §6,`<img>` 來要圖時後端把 HEIC 轉成 JPEG);影片與文件照舊新分頁開 GET /files/{id}。
 * 圖片也是真的連結,只有一般左鍵(與 Enter)改開預覽:預覽畫不出來的圖(超過轉檔上限的 TIFF 掃描檔、
 * 磁碟告警時沒快取過的 HEIC)還拿得到原檔 —— Ctrl/⌘ 點、中鍵、右鍵另存都照瀏覽器預設。
 * 違規勸導三端列表、報修與郵局管理、社團總覽的報修詳情共用。沒有附件回 null
 */
export default function AttachmentLinks({ files, inline = false }: AttachmentLinksProps) {
  const viewer = useFilePreview()
  if (!files.length) return null
  const images = files.filter((f) => fileTypeOf(f.name) === 'image').map(asImage)
  const links = files.map((f, i) => (
    <span key={f.id}>
      {i > 0 && ' · '}
      <a
        href={fileDownloadUrl(f.id)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--focus)' }}
        {...(fileTypeOf(f.name) === 'image' && {
          'aria-haspopup': 'dialog' as const,
          onClick: (e: React.MouseEvent) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            viewer.preview(asImage(f), images)
          },
        })}
      >
        {f.name}
      </a>
    </span>
  ))
  if (inline) {
    return (
      <>
        {links}
        {viewer.node}
      </>
    )
  }
  return (
    <div style={{ fontSize: 12, marginTop: 2 }} title={files.map((f) => f.name).join('、')}>
      {links}
      {viewer.node}
    </div>
  )
}
