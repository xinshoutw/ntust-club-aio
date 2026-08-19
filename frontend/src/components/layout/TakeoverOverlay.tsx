import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { App, Button, Checkbox, Modal, Progress } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import Markdown from '../ui/Markdown'
import { useDismissAnnouncement, useTakeoverAnnouncements } from '../../api/announcements'

// 每次登入清空(auth.login),讓蓋板於下次登入再次顯示
export const TAKEOVER_DISMISSED_KEY = 'club-aio.takeover.dismissed'

const CLOSE_DELAY_MS = 5000
const TICK_MS = 100

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(TAKEOVER_DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// 蓋板公告:期限內社團每次登入後全版顯示;右上角圓形進度倒數 5 秒,轉滿變成 X 才能關閉。
// 以 AntD Modal 承載(焦點移入/trap/背景 inert/關閉後歸還焦點皆由 Modal 處理);
// 內建 closable 一律關閉,右上控制項自繪;遮罩與 Esc 一律不可關閉。
// 勾「不再顯示」關閉 → 寫入後端(跨裝置永久);未勾 → 僅本次登入不再出現(sessionStorage)
export default function TakeoverOverlay() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const [closable, setClosable] = useState(false)
  const [percent, setPercent] = useState(0)
  const [neverShow, setNeverShow] = useState(false)
  const { message } = App.useApp()
  // 僅社團端渲染(AppShell 已依角色守衛);蓋板走自己的查詢,不從總覽的最新 20 筆裡挑
  const { data } = useTakeoverAnnouncements()
  const dismissForever = useDismissAnnouncement()

  // 期限由後端篩過;這裡再擋一次,快取跨過午夜時不會蓋出已到期的公告
  const active = (data ?? []).filter(
    (a) =>
      a.takeoverUntil &&
      !dayjs().isAfter(dayjs(a.takeoverUntil, 'YYYY/MM/DD'), 'day') &&
      !a.dismissed &&
      !dismissed.includes(a.id),
  )
  const current = active[0]
  const currentId = current?.id

  useEffect(() => {
    if (!currentId) return
    setClosable(false)
    setPercent(0)
    setNeverShow(false)
    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      setPercent(Math.min(100, (elapsed / CLOSE_DELAY_MS) * 100))
      if (elapsed >= CLOSE_DELAY_MS) {
        setClosable(true)
        clearInterval(timer)
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [currentId])

  // 關閉動畫期間保留最後內容(open+常駐 Modal 慣例)
  const lastRef = useRef(current)
  if (current) lastRef.current = current
  const shown = current ?? lastRef.current
  if (!shown) return null

  const dismiss = () => {
    if (!current) return
    // 勾「不再顯示」→ 後端持久化;失敗最壞情況=下次登入再蓋板,不擋關閉、僅提示
    if (neverShow) {
      dismissForever.mutate(current.id, {
        onError: () => message.error('「不再顯示」設定儲存失敗,下次登入時公告將再次顯示'),
      })
    }
    const next = [...dismissed, current.id]
    setDismissed(next)
    sessionStorage.setItem(TAKEOVER_DISMISSED_KEY, JSON.stringify(next))
  }

  return (
    <Modal
      open={!!current}
      onCancel={dismiss}
      footer={null}
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      width={640}
      zIndex={1300}
      // 負 margin+等量 padding:讓 focus ring 有伸展空間,不被捲動容器左右裁切
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', margin: '0 -8px', padding: '0 8px' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingRight: 28 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{shown.title}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>{shown.date}</span>
        </div>
      }
    >
      {/* 右上控制項:倒數進度環 → 轉滿換成可關閉的 X(anchor 為 .ant-modal-content) */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center' }}>
        {closable ? (
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={dismiss}
            aria-label="關閉公告"
          />
        ) : (
          <Progress
            type="circle"
            size={22}
            percent={percent}
            showInfo={false}
            strokeWidth={12}
            strokeColor="var(--seal)"
            aria-hidden
          />
        )}
      </div>
      <div style={{ marginTop: 6 }}>
        <Markdown source={shown.content} />
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Checkbox checked={neverShow} onChange={(e) => setNeverShow(e.target.checked)}>
          <span style={{ fontSize: 13, color: 'var(--steel)' }}>不再顯示</span>
        </Checkbox>
      </div>
    </Modal>
  )
}
