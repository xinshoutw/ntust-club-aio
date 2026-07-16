import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { Modal } from 'antd'
import Markdown from '../ui/Markdown'
import { useAnnouncements } from '../../api/announcements'

// 每次登入清空(auth.login),讓蓋板於下次登入再次顯示
export const TAKEOVER_DISMISSED_KEY = 'club-aio.takeover.dismissed'

const CLOSE_DELAY_MS = 5000

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(TAKEOVER_DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// 蓋板公告:期限內社團每次登入後全版顯示;5 秒後右上角出現 X 才能關閉。
// 以 AntD Modal 承載(焦點移入/trap/背景 inert/關閉後歸還焦點皆由 Modal 處理),
// 五秒規則以條件 closable 實現;遮罩與 Esc 一律不可關閉
export default function TakeoverOverlay() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const [closable, setClosable] = useState(false)
  // 僅社團端渲染(AppShell 已依角色守衛),與總覽/鈴鐺共用同一查詢
  const { data } = useAnnouncements()

  const active = (data?.announcements ?? []).filter(
    (a) =>
      a.takeoverUntil &&
      !dayjs().isAfter(dayjs(a.takeoverUntil, 'YYYY/MM/DD'), 'day') &&
      !dismissed.includes(a.id),
  )
  const current = active[0]
  const currentId = current?.id

  useEffect(() => {
    if (!currentId) return
    setClosable(false)
    const t = setTimeout(() => setClosable(true), CLOSE_DELAY_MS)
    return () => clearTimeout(t)
  }, [currentId])

  // 關閉動畫期間保留最後內容(open+常駐 Modal 慣例)
  const lastRef = useRef(current)
  if (current) lastRef.current = current
  const shown = current ?? lastRef.current
  if (!shown) return null

  const dismiss = () => {
    if (!current) return
    const next = [...dismissed, current.id]
    setDismissed(next)
    sessionStorage.setItem(TAKEOVER_DISMISSED_KEY, JSON.stringify(next))
  }

  return (
    <Modal
      open={!!current}
      onCancel={dismiss}
      footer={null}
      closable={closable}
      mask={{ closable: false }}
      keyboard={false}
      width={640}
      zIndex={1300}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingRight: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{shown.title}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>{shown.date}</span>
        </div>
      }
    >
      <div style={{ marginTop: 6 }}>
        <Markdown source={shown.content} />
      </div>
      <div className="num" style={{ fontSize: 12, color: '#8A5A00', marginTop: 16 }}>
        公告顯示至 {shown.takeoverUntil}
      </div>
    </Modal>
  )
}
