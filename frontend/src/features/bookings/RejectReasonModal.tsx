// 借用被退回的原因與時間:三張「最近申請 / 最近借用」表共用同一個彈窗。
// 只讀,不帶簽核者姓名(社團端看自己的單);Modal 常駐 + afterClose 才留得住退場動畫。
import { useState, type ReactNode } from 'react'
import { Modal } from 'antd'
import type { RejectInfo } from '../../api/bookings'

interface Shown {
  subject: string
  info: RejectInfo
}

/**
 * 退回件才可點:`rowProps(subject, reject)` 給 `<tr>` 展開,`wrap()` 包主要欄位。
 * 整列 onClick 只服務滑鼠,鍵盤入口是名稱欄裡的 `.row-open-btn`(design-guide §6)。
 */
export function useRejectReason() {
  const [shown, setShown] = useState<Shown | null>(null)
  const [open, setOpen] = useState(false)

  const rowProps = (subject: string, info: RejectInfo | undefined) => {
    if (!info) return { tr: {}, wrap: (label: ReactNode) => label }
    const show = () => {
      setShown({ subject, info })
      setOpen(true)
    }
    return {
      tr: { onClick: show, style: { cursor: 'pointer' } },
      wrap: (label: ReactNode) => (
        <button
          type="button"
          className="row-open-btn"
          aria-label={`檢視「${subject}」的退回原因`}
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
      title="退回原因"
      footer={null}
      onCancel={() => setOpen(false)}
      afterClose={() => setShown(null)}
      width={440}
    >
      <div style={{ fontWeight: 500, marginBottom: 2 }}>{shown?.subject}</div>
      <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 12 }}>
        {shown?.info.at}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{shown?.info.reason}</div>
    </Modal>
  )

  return { rowProps, node }
}
