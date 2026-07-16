import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Checkbox, InputNumber, Modal, Spin, Tooltip } from 'antd'
import { DownloadOutlined, RightOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { downloadCsv } from '../../lib/csv'
import KindBadge from '../signup/KindBadge'
import {
  useAdminSignupItems,
  useRegistrations,
  useSignupItemMutations,
  type AdminSignupItem,
  type Registration,
} from '../../api/adminSignups'

// 簽到:活動結束後由管理員登錄,評鑑僅採計簽到(僅報名不計分)
// 負責人會議為場次制(每學期 2 場、全學年 4 場),登錄已出席場次數
const LEADER_SESSIONS_TOTAL = 4

const answerText = (v: unknown): string => (Array.isArray(v) ? v.join('、') : v == null ? '' : String(v))

// 單一報名活動的管理彈窗:名單、報名確認、簽到登錄、匯出
function ManageModal({
  item,
  open,
  onClose,
  afterClose,
}: {
  item: AdminSignupItem
  open: boolean
  onClose: () => void
  afterClose: () => void
}) {
  const { message } = App.useApp()
  const regsQuery = useRegistrations(item.id)
  const regs = regsQuery.data ?? []
  const totalPeople = regs.reduce((s, r) => s + r.count, 0)
  const { confirm, markAttendance } = useSignupItemMutations()

  // 逐人匯出:固定欄位+該活動全部自訂欄位(依欄位順序)
  const exportCsv = () => {
    if (!regs.length) {
      message.error('尚無報名名單可匯出')
      return
    }
    downloadCsv(`報名名單_${item.name}.csv`, [
      ['社團', '姓名', '學號', '系級', ...item.fields.map((f) => f.label), '報名狀態'],
      ...regs.flatMap((r) =>
        r.participants.map((p) => [
          r.club,
          answerText(p.name),
          answerText(p.studentId),
          answerText(p.dept),
          ...item.fields.map((f) => answerText(p[f.key])),
          r.confirmed ? '已確認' : '待確認',
        ]),
      ),
    ])
    message.success(`已匯出 ${totalPeople} 名參加人`)
  }

  const onConfirm = (r: Registration) => {
    confirm.mutate(
      { itemId: item.id, clubId: r.clubId },
      {
        onSuccess: () => message.success(`已確認 ${r.club} 報名`),
        onError: (e) => message.error(e.message),
      },
    )
  }

  const onMark = (r: Registration, attended: boolean) => {
    markAttendance.mutate(
      { itemId: item.id, clubId: r.clubId, attended },
      {
        onSuccess: () => message.success(`${r.club} ${attended ? '已簽到' : '取消簽到'}`),
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={620}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          <KindBadge kind={item.kind} />
          <StatusPill status={item.status} />
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--steel)', marginTop: 4, flexWrap: 'wrap' }}>
        <span>
          截止 <span className="num">{item.deadline}</span>
        </span>
        <span>
          已報名 <span className="num">{regs.length}</span> 社團 · <span className="num">{totalPeople}</span> 人
        </span>
        <span>
          每社上限 <span className="num">{item.maxParticipants}</span> 人
        </span>
        <span style={{ flex: 1 }} />
        <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv}>
          匯出名單
        </Button>
      </div>

      <Spin spinning={regsQuery.isPending}>
        <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          {regs.map((r) => (
            <div key={r.clubId} style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', marginTop: -1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, flex: 1, minWidth: 140 }}>{r.club}</div>
                <div className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{r.count} 人</div>
                {/* 簽到:評鑑僅採計簽到;負責人會議登錄出席場次 */}
                {item.sessionBased ? (
                  <Tooltip title="場次制簽到需逐場登錄;後端尚未提供場次列表 API,暫無法於此登錄">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--steel)' }}>
                      簽到
                      <InputNumber
                        size="small"
                        min={0}
                        max={LEADER_SESSIONS_TOTAL}
                        precision={0}
                        value={r.attendedSessions}
                        style={{ width: 56 }}
                        aria-label={`${r.club} 簽到場次`}
                        disabled
                      />
                      / {LEADER_SESSIONS_TOTAL} 場
                    </span>
                  </Tooltip>
                ) : item.eventEnded ? (
                  <Checkbox
                    checked={r.attendedSessions > 0}
                    disabled={markAttendance.isPending}
                    onChange={(e) => onMark(r, e.target.checked)}
                  >
                    簽到
                  </Checkbox>
                ) : (
                  <Tooltip title="活動結束後開放登錄簽到">
                    <Checkbox disabled>簽到</Checkbox>
                  </Tooltip>
                )}
                {r.confirmed ? (
                  <StatusPill status="approved" />
                ) : (
                  <Button size="small" style={{ height: 28 }} loading={confirm.isPending} onClick={() => onConfirm(r)}>
                    確認報名
                  </Button>
                )}
              </div>
              {/* 逐人明細:姓名/學號/系級+自訂欄位回答 */}
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {r.participants.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.7 }}>
                    <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{answerText(p.name)}</span>
                    <span className="num"> {answerText(p.studentId)}</span> · {answerText(p.dept)}
                    {item.fields
                      .filter((f) => answerText(p[f.key]))
                      .map((f) => (
                        <span key={f.key}> · {f.label}:{answerText(p[f.key])}</span>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!regsQuery.isPending && regs.length === 0 && (
            <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--steel)' }}>尚無社團報名</div>
          )}
        </div>
      </Spin>
    </Modal>
  )
}

export default function SignupManagePage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<AdminSignupItem | null>(null)
  const [open, setOpen] = useState(false)

  const listQuery = useAdminSignupItems()
  const items = listQuery.data ?? []

  const openItem = (item: AdminSignupItem) => {
    setSelected(item)
    setOpen(true)
  }

  const openCount = items.filter((i) => i.status === 'open').length

  return (
    <div>
      <PageHeader
        title="活動管理"
        sub={
          <>
            開放中 <span className="num">{openCount}</span> 項
          </>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/admin/signup-items/new')}>
            + 建立活動
          </Button>
        }
      />

      <Spin spinning={listQuery.isPending}>
        <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
          <table className="tb dense" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>活動</th>
                <th>截止</th>
                <th className="r">已報名</th>
                <th className="r">每社上限</th>
                <th>狀態</th>
                <th aria-label="開啟" style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => openItem(item)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <KindBadge kind={item.kind} />
                    </span>
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{item.deadline}</td>
                  <td className="r num">
                    {item.clubsCount} 社團
                    {item.pendingCount > 0 && (
                      <span style={{ color: '#8A5A00', fontSize: 12 }}>(待確認 {item.pendingCount})</span>
                    )}
                  </td>
                  <td className="r num">{item.maxParticipants} 人</td>
                  <td style={{ width: 90 }}><StatusPill status={item.status} /></td>
                  <td className="r"><RightOutlined style={{ fontSize: 11, color: 'var(--steel)' }} /></td>
                </tr>
              ))}
              {!listQuery.isPending && items.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    尚未建立報名活動
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>

      {/* Modal 常駐至關閉動畫結束(afterClose)才卸載 */}
      {selected && (
        <ManageModal
          key={selected.id}
          item={selected}
          open={open}
          onClose={() => setOpen(false)}
          afterClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
