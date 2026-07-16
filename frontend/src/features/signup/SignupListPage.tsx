import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Modal, Spin } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { Pager } from '../../components/ui/tableControls'
import { useSignupItem, useSignupItems, type SignupItem } from '../../api/signups'
import SubmissionRecord from './SubmissionRecord'
import KindBadge from './KindBadge'
import './signup.css'

const PAGE_SIZE = 20

// 已報名(含審核制待確認)可回看紀錄;開放中可進入填寫
const hasRecord = (item: SignupItem) => item.myStatus === 'signed' || item.myStatus === 'pending'

export default function SignupListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordId, setRecordId] = useState<number | null>(null)

  const listQuery = useSignupItems({ page, pageSize: PAGE_SIZE })
  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  // 報名紀錄含填答內容,需另打詳情端點(列表不附)
  const recordQuery = useSignupItem(recordId ?? undefined)

  const openCard = (item: SignupItem) => {
    if (hasRecord(item)) {
      setRecordId(item.id)
      setRecordOpen(true)
    } else if (item.accepting) {
      navigate(`/signup/${item.id}`)
    }
  }

  return (
    <div>
      <PageHeader title="線上報名" />

      <Spin spinning={listQuery.isPending}>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            const clickable = item.accepting || hasRecord(item)
            const info = [item.eventAt, item.place, `每社名額上限 ${item.maxParticipants} 人`]
              .filter(Boolean)
              .join(' · ')
            return (
              <div
                key={item.id}
                className={clickable ? 'card signup-card click-tint' : 'card signup-card'}
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
                style={{ opacity: item.accepting ? undefined : 0.72, cursor: clickable ? 'pointer' : 'default' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{item.name}</div>
                    <StatusPill status={item.accepting ? 'open' : 'ended'} />
                    <KindBadge kind={item.kind} />
                    {item.myStatus === 'signed' && <StatusPill status="registered" />}
                    {item.myStatus === 'pending' && <StatusPill status="pending" />}
                    {item.myStatus === 'draft' && item.accepting && <StatusPill status="draft" />}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 5, lineHeight: 1.6 }}>
                    {info}
                  </div>
                </div>
                <div className="signup-card-side">
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>截止日</div>
                    <div className="num" style={{ fontSize: 13, marginTop: 2 }}>{item.deadline ?? '—'}</div>
                  </div>
                </div>
              </div>
            )
          })}
          {!listQuery.isPending && !items.length && (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
              目前沒有報名活動
            </div>
          )}
        </div>
      </Spin>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />

      <Modal
        open={recordOpen}
        title={recordQuery.data ? `${recordQuery.data.name} — 報名紀錄` : '報名紀錄'}
        onCancel={() => setRecordOpen(false)}
        afterClose={() => setRecordId(null)}
        footer={<Button onClick={() => setRecordOpen(false)}>關閉</Button>}
      >
        {recordQuery.isPending ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Spin />
          </div>
        ) : recordQuery.data ? (
          <SubmissionRecord item={recordQuery.data} />
        ) : null}
      </Modal>
    </div>
  )
}
