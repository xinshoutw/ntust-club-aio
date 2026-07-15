import DOMPurify from 'dompurify'
import { marked } from 'marked'

// 公告內容允許 markdown:marked 轉 HTML 後過 DOMPurify 白名單
export default function Markdown({ source }: { source: string }) {
  const html = DOMPurify.sanitize(marked.parse(source, { async: false }))
  // eslint-disable-next-line react/no-danger -- 已經過 DOMPurify 消毒
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
}
