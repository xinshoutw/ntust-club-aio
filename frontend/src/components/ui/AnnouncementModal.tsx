import type { ReactNode } from 'react'
import { Modal } from 'antd'
import Markdown from './Markdown'

// 只取顯示所需欄位,社團端 Announcement 與行政端 AdminAnnouncement 皆相容(兩者 id 型別不同)
export interface AnnouncementView {
  title: string
  scope: string
  date: string
  content: string
  takeoverUntil?: string
}

// 公告詳情彈窗:兩端共用,點任一公告展開完整內容(markdown)
// footerExtra:呼叫端注入的控制列(如行政端的蓋板開關/刪除);未提供時不顯示 footer
export default function AnnouncementModal({
  announcement,
  open,
  onClose,
  afterClose,
  footerExtra,
}: {
  announcement: AnnouncementView | null
  open: boolean
  onClose: () => void
  afterClose: () => void
  footerExtra?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      footer={footerExtra ?? null}
      width={560}
      title={
        announcement && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingRight: 26 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{announcement.title}</span>
            <span style={{ fontSize: 12, color: 'var(--steel)', background: '#EEF0F3', borderRadius: 4, padding: '1px 6px', fontWeight: 400 }}>
              {announcement.scope}
            </span>
            <span className="num" style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>{announcement.date}</span>
          </div>
        )
      }
    >
      {announcement && (
        <>
          <Markdown source={announcement.content} />
          {announcement.takeoverUntil && (
            <div className="num" style={{ fontSize: 12, color: '#8A5A00', marginTop: 12 }}>
              蓋板公告至 {announcement.takeoverUntil}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
