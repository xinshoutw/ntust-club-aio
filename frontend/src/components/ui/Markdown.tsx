import DOMPurify from 'dompurify'
import { marked } from 'marked'

// 專屬消毒實例:公告連結一律開新分頁(2026-07-21 需求方)。
// 不可在全域 DOMPurify 上 addHook——docx 預覽(FilePreview)共用同一單例,會被外溢影響
const purifier = DOMPurify(window)
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// 公告內容允許 markdown:marked 轉 HTML 後過 DOMPurify 白名單
export default function Markdown({ source }: { source: string }) {
  const html = purifier.sanitize(marked.parse(source, { async: false }))
  // eslint-disable-next-line react/no-danger -- 已經過 DOMPurify 消毒
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
}
