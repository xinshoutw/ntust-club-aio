import { fileDownloadUrl } from '../../api/adminFiles'

// 單據附件的一行連結(「a.jpg · b.mp4」),新分頁開 GET /files/{id};
// 違規勸導三端列表共用,沒有附件回 null 讓呼叫端決定要不要留位
export default function AttachmentLinks({ files }: { files: { id: string; name: string }[] }) {
  if (!files.length) return null
  return (
    <div style={{ fontSize: 12, marginTop: 2 }} title={files.map((f) => f.name).join('、')}>
      {files.map((f, i) => (
        <span key={f.id}>
          {i > 0 && ' · '}
          <a href={fileDownloadUrl(f.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--focus)' }}>
            {f.name}
          </a>
        </span>
      ))}
    </div>
  )
}
