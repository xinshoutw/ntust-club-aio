import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { CloseOutlined } from '@ant-design/icons'
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

// 蓋板公告:期限內社團每次登入後全版顯示;5 秒後右上角出現 X 才能關閉
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
    // 蓋板期間鎖住背景捲動
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => setClosable(true), CLOSE_DELAY_MS)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
    }
  }, [currentId])

  if (!current) return null

  const dismiss = () => {
    const next = [...dismissed, current.id]
    setDismissed(next)
    sessionStorage.setItem(TAKEOVER_DISMISSED_KEY, JSON.stringify(next))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: 'rgba(20, 23, 30, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{ position: 'relative', width: 'min(640px, 100%)', maxHeight: '80vh', overflowY: 'auto', padding: '28px 32px', background: '#fff' }}
      >
        {closable && (
          <button
            type="button"
            aria-label="關閉公告"
            onClick={dismiss}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--steel)',
              fontSize: 16,
              padding: 6,
            }}
          >
            <CloseOutlined />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingRight: 30 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{current.title}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{current.date}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <Markdown source={current.content} />
        </div>
        <div className="num" style={{ fontSize: 12, color: '#8A5A00', marginTop: 16 }}>
          公告顯示至 {current.takeoverUntil}
        </div>
      </div>
    </div>
  )
}
