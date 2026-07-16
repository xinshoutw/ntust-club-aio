import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Modal, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { semesterOptions } from '../../lib/semester'
import { SIGNUP_ITEMS } from './mock'
import type { SignupItem } from './types'
import SubmissionRecord from './SubmissionRecord'
import KindBadge from './KindBadge'
import './signup.css'

export default function SignupListPage() {
  const navigate = useNavigate()
  // 預設=資料中最新學期(同活動列表慣例)
  const semOptions = semesterOptions(SIGNUP_ITEMS.map((i) => i.semester))
  const [semester, setSemester] = useState(semOptions[0].value)
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordItem, setRecordItem] = useState<SignupItem | null>(null)
  const items = SIGNUP_ITEMS.filter((i) => i.semester === semester)

  const openCard = (item: SignupItem) => {
    if (item.submission) {
      setRecordItem(item)
      setRecordOpen(true)
    } else if (item.status === 'open') {
      navigate(`/signup/${item.id}`)
    }
  }

  return (
    <div>
      <PageHeader
        title="線上報名"
        extra={
          <Select value={semester} onChange={setSemester} style={{ width: 120 }} options={semOptions} />
        }
      />

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => {
          const ended = item.status === 'ended'
          const clickable = !ended || !!item.submission
          return (
            <div
              key={item.id}
              className="card signup-card"
              role="button"
              tabIndex={clickable ? 0 : -1}
              aria-disabled={!clickable}
              onClick={() => openCard(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openCard(item)
                }
              }}
              style={{ opacity: ended ? 0.72 : undefined, cursor: clickable ? 'pointer' : 'default' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{item.name}</div>
                  <StatusPill status={item.status} />
                  <KindBadge kind={item.kind} />
                  {item.submission && <StatusPill status="registered" />}
                  {!item.submission && item.hasDraft && item.status === 'open' && <StatusPill status="draft" />}
                </div>
                <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 5, lineHeight: 1.6 }}>
                  {item.info}
                </div>
              </div>
              <div className="signup-card-side">
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--steel)' }}>截止日</div>
                  <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{item.deadline}</div>
                </div>
              </div>
            </div>
          )
        })}
        {!items.length && (
          <div className="card" style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
            本學期沒有開放報名的項目
          </div>
        )}
      </div>

      <Modal
        open={recordOpen}
        title={recordItem ? `${recordItem.name} — 報名紀錄` : ''}
        onCancel={() => setRecordOpen(false)}
        afterClose={() => setRecordItem(null)}
        footer={<Button onClick={() => setRecordOpen(false)}>關閉</Button>}
      >
        {recordItem && <SubmissionRecord item={recordItem} />}
      </Modal>
    </div>
  )
}
