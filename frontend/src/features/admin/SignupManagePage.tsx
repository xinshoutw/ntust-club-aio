import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Checkbox, DatePicker, Input, Modal, Spin, Tooltip } from 'antd'
import { DeleteOutlined, DownloadOutlined, RightOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { confirmDialog } from '../../lib/confirm'
import { downloadCsv } from '../../lib/csv'
import KindBadge from '../signup/KindBadge'
import {
  useAdminSignupItems,
  useRegistrations,
  useSessions,
  useSignupItemMutations,
  type AdminSignupItem,
  type Registration,
  type SignupSession,
} from '../../api/adminSignups'

// 簽到:活動結束後由管理員登錄,評鑑僅採計簽到(僅報名不計分)
// 負責人會議為場次制(每學期 2 場、全學年 4 場):管理員建立場次後逐場登錄

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
  const { message, modal } = App.useApp()
  const regsQuery = useRegistrations(item.id)
  const regs = regsQuery.data ?? []
  const totalPeople = regs.reduce((s, r) => s + r.count, 0)
  const { confirm, markAttendance, createSession, deleteSession } = useSignupItemMutations()

  // 場次制(負責人會議):場次清單+逐場簽到;非場次制不發查詢
  const sessionsQuery = useSessions(item.sessionBased ? item.id : undefined)
  const sessions = sessionsQuery.data ?? []
  const [newSessionName, setNewSessionName] = useState('')
  const [newSessionDate, setNewSessionDate] = useState<Dayjs | null>(null)

  const isAttended = (s: SignupSession, clubId: number) =>
    s.attendance.some((a) => a.clubId === clubId && a.attended)
  const attendedCount = (clubId: number) =>
    sessions.reduce((n, s) => n + (isAttended(s, clubId) ? 1 : 0), 0)

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

  // 逐場簽到:場次日未到後端回 409,錯誤訊息直接呈現
  const onMark = (r: Registration, attended: boolean, session?: SignupSession) => {
    markAttendance.mutate(
      { itemId: item.id, clubId: r.clubId, attended, sessionId: session?.id },
      {
        onSuccess: () =>
          message.success(`${r.club}${session ? ` ${session.name}` : ''} ${attended ? '已簽到' : '取消簽到'}`),
        onError: (e) => message.error(e.message),
      },
    )
  }

  const addSession = () => {
    const name = newSessionName.trim()
    if (!name || !newSessionDate) return
    createSession.mutate(
      { itemId: item.id, name, date: newSessionDate.format('YYYY/MM/DD') },
      {
        onSuccess: () => {
          setNewSessionName('')
          setNewSessionDate(null)
          message.success(`已新增場次 ${name}`)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const askDeleteSession = (s: SignupSession) =>
    confirmDialog(modal, {
      title: '刪除場次',
      content: `「${s.name}」(${s.date})刪除後,該場出席紀錄將一併刪除`,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        deleteSession.mutate(
          { itemId: item.id, sessionId: s.id },
          {
            onSuccess: () => message.success('場次已刪除'),
            onError: (e) => message.error(e.message),
          },
        )
      },
    })

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={item.sessionBased ? 760 : 620}
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

      <Spin spinning={regsQuery.isPending || (item.sessionBased && sessionsQuery.isPending)}>
        {/* 場次管理:名稱+日期新增、刪除(出席紀錄一併刪除);逐場簽到於下方名單列登錄 */}
        {item.sessionBased && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>場次</div>
            {sessions.length > 0 && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', borderTop: '1px solid var(--line)', marginTop: -1 }}
                  >
                    <div style={{ fontSize: 13, flex: 1, minWidth: 120 }}>{s.name}</div>
                    <div className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{s.date}</div>
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={`刪除場次 ${s.name}`}
                      onClick={() => askDeleteSession(s)}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!sessionsQuery.isPending && sessions.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>尚未建立場次,新增場次後即可逐場登錄簽到</div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Input
                size="small"
                placeholder="場次名稱"
                value={newSessionName}
                maxLength={100}
                style={{ width: 200 }}
                onChange={(e) => setNewSessionName(e.target.value)}
                onPressEnter={addSession}
              />
              <DatePicker
                size="small"
                placeholder="場次日期"
                format="YYYY/MM/DD"
                value={newSessionDate}
                onChange={setNewSessionDate}
              />
              <Button
                size="small"
                loading={createSession.isPending}
                disabled={!newSessionName.trim() || !newSessionDate}
                onClick={addSession}
              >
                新增場次
              </Button>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16 }}>報名名單</div>
          </div>
        )}

        <div style={{ marginTop: item.sessionBased ? 8 : 12, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          {regs.map((r) => (
            <div key={r.clubId} style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', marginTop: -1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, flex: 1, minWidth: 140 }}>{r.club}</div>
                <div className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{r.count} 人</div>
                {/* 簽到:評鑑僅採計簽到;負責人會議逐場登錄,出席場次數=各場加總 */}
                {item.sessionBased ? (
                  sessions.length > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--steel)' }}>
                      出席 <span className="num">{attendedCount(r.clubId)}</span> / <span className="num">{sessions.length}</span> 場
                    </span>
                  )
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
              {/* 逐場簽到:以各場 attendance 判定現值,切換即登錄該場 */}
              {item.sessionBased && sessions.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--steel)' }}>簽到</span>
                  {sessions.map((s) => (
                    <Checkbox
                      key={s.id}
                      checked={isAttended(s, r.clubId)}
                      disabled={markAttendance.isPending}
                      onChange={(e) => onMark(r, e.target.checked, s)}
                    >
                      {s.name}
                    </Checkbox>
                  ))}
                </div>
              )}
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
