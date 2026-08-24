// 承辦退回或撤銷借用時填的原因與時間:四張「最近申請 / 最近借用」表共用同一個彈窗。
// 只讀,不帶簽核者姓名(社團端看自己的單);Modal 常駐 + afterClose 才留得住退場動畫。
import { useState, type ReactNode } from 'react'
import { Modal } from 'antd'
import type { DecisionInfo } from '../../api/bookings'
import type { StatusKey } from '../../lib/status'

// 舊系統遷入的退回件多半沒留理由(clubclass 的 reject_info 多數是空的)。
// 那也是一個答案 —— 讓整列點得動並說清楚,比點了沒反應好
const NO_REASON = '系統未留下退回原因'

interface Shown {
  title: string
  subject: string
  info?: DecisionInfo
}

/**
 * `rowProps(subject, status, decision)` 給 `<tr>` 展開,`wrap()` 包主要欄位。
 *
 * 可不可點看**狀態**:退回件一律可點(沒理由的彈窗會說明);「已取消」只有承辦撤銷的
 * 那種可點 —— 社團自己按的取消沒有紀錄,也沒有可解釋的事。
 * 整列 onClick 只服務滑鼠,鍵盤入口是名稱欄裡的 `.row-open-btn`(design-guide §6)。
 */
export function useDecisionReason() {
  const [shown, setShown] = useState<Shown | null>(null)
  const [open, setOpen] = useState(false)

  const rowProps = (subject: string, status: StatusKey, info: DecisionInfo | undefined) => {
    const title =
      status === 'rejected' ? '退回原因' : status === 'cancelled' && info ? '撤銷原因' : null
    if (title === null) return { tr: {}, wrap: (label: ReactNode) => label }
    const show = () => {
      setShown({ title, subject, info })
      setOpen(true)
    }
    return {
      tr: { onClick: show, style: { cursor: 'pointer' } },
      wrap: (label: ReactNode) => (
        <button
          type="button"
          className="row-open-btn"
          aria-label={`檢視「${subject}」的${title}`}
          onClick={(e) => {
            e.stopPropagation()
            show()
          }}
        >
          {label}
        </button>
      ),
    }
  }

  const node = (
    <Modal
      open={open}
      title={shown?.title}
      footer={null}
      onCancel={() => setOpen(false)}
      afterClose={() => setShown(null)}
      width={440}
    >
      <div style={{ fontWeight: 500, marginBottom: 2 }}>{shown?.subject}</div>
      <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 12 }}>
        {shown?.info?.at ?? '—'}
      </div>
      <div
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: shown?.info ? undefined : 'var(--steel)',
        }}
      >
        {shown?.info?.reason ?? NO_REASON}
      </div>
    </Modal>
  )

  return { rowProps, node }
}
