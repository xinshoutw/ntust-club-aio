import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, Modal } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import { useClubOptions } from '../../api/adminClubs'
import { OVERDUE_PAGE_SIZE, useOverdueLoans } from '../../api/adminClubOverview'
import { useOverdueMutations, useSuspendedClubs } from '../../api/adminOverdue'
import ClubCascader from './ClubCascader'

interface SuspendFormValues {
  club: string
  until: Dayjs
  reason: string
}

export default function OverduePage() {
  const { message } = App.useApp()
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [form] = Form.useForm<SuspendFormValues>()
  // 逾期=推導狀態(結束日之隔天上班日 10:30 未歸還),由後端以 status=overdue 篩選並分頁
  const [overduePage, setOverduePage] = useState(1)
  const overdueQuery = useOverdueLoans(overduePage)
  const suspendedQuery = useSuspendedClubs()
  // 名稱→主鍵的對照與 ClubCascader 走同一支選項查詢:分成兩支的話選單看起來健康、
  // 對照卻是空的,使用者填完整張表才收到「找不到所選社團」
  const clubsQuery = useClubOptions()
  const { remind, suspend, lift } = useOverdueMutations()
  const overdue = overdueQuery.data?.rows ?? []
  const suspensions = suspendedQuery.data ?? []

  const sendReminder = (loanId: number, clubName: string) => {
    remind.mutate(loanId, {
      onSuccess: () => message.success(`已通知 ${clubName} 儘速歸還`),
      onError: (e) => message.error(e.message),
    })
  }

  const liftSuspension = (clubId: number, clubName: string) => {
    lift.mutate(clubId, {
      onSuccess: () => message.success(`已解除 ${clubName} 停權`),
      onError: (e) => message.error(e.message),
    })
  }

  const onSuspend = (v: SuspendFormValues) => {
    const target = clubsQuery.data?.find((c) => c.name === v.club)
    if (!target) {
      message.error('找不到所選社團')
      return
    }
    suspend.mutate(
      { id: target.id, until: v.until, reason: v.reason },
      {
        onSuccess: () => {
          message.success(`已停權 ${v.club}`)
          setSuspendOpen(false)
          form.resetFields()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="逾期追蹤與停權"
        extra={
          <Button danger onClick={() => setSuspendOpen(true)}>
            停權社團
          </Button>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未還器材</div>
        <LoadingBlock pending={overdueQuery.isPending}>
          <table className="tb dense fixed" aria-label="逾期未還器材" style={{ minWidth: 720 }}>
            {/* 社團截斷、器材允許換行(數量須可見)、借用資訊吃剩餘寬;狀態/動作固定 px */}
            <Cols widths={['18%', '20%', 'auto', 96, 100]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">器材</th>
                <th scope="col">借用資訊</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((l) => (
                <tr key={l.apiId}>
                  <td className="cell-clip" title={l.club}>{l.club}</td>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipment} <span className="num">×{l.qty}</span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                    借用區間 <span className="num">{l.startDate} – {l.endDate}</span>
                    {l.activity ? ` · ${l.activity}` : ''}
                    {/* 這頁的動作就是催人,聯絡電話要在手邊 */}
                    {l.phone && <> · 電話 <span className="num">{l.phone}</span></>}
                  </td>
                  <td><StatusPill status="overdue" /></td>
                  <td className="r">
                    {/* 排程每 3 個上班日自動寄一次,人工加寄前要看得到上一封是什麼時候 */}
                    {l.lastRemindedAt && (
                      <div className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>
                        上次提醒 {l.lastRemindedAt}
                      </div>
                    )}
                    <button
                      type="button"
                      className="link-btn"
                      disabled={remind.isPending}
                      onClick={() => sendReminder(l.apiId, l.club)}
                    >
                      寄送提醒
                    </button>
                  </td>
                </tr>
              ))}
              {overdueQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError
                      compact
                      title="逾期未還器材載入失敗"
                      error={overdueQuery.error}
                      onRetry={() => void overdueQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!overdueQuery.isPending && !overdueQuery.isError && overdue.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有逾期未還的器材</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager
            page={overduePage}
            pageSize={OVERDUE_PAGE_SIZE}
            total={overdueQuery.data?.total ?? 0}
            onChange={setOverduePage}
          />
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>停權中社團</div>
        <LoadingBlock pending={suspendedQuery.isPending}>
          <table className="tb fixed" aria-label="停權中社團" style={{ minWidth: 560 }}>
            {/* 社團截斷、停權資訊吃剩餘寬;狀態/動作固定 px */}
            <Cols widths={['26%', 100, 'auto', 110]} />
            <thead>
              <tr>
                <th scope="col">社團</th>
                <th scope="col">狀態</th>
                <th scope="col">停權資訊</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {suspensions.map((s) => (
                <tr key={s.id}>
                  <td className="cell-clip" title={s.name} style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><StatusPill status="suspended" /></td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                    至 <span className="num">{s.until}</span>{s.reason ? ` · ${s.reason}` : ''}
                  </td>
                  <td className="r">
                    <button
                      type="button"
                      className="link-btn primary"
                      disabled={lift.isPending}
                      onClick={() => liftSuspension(s.id, s.name)}
                    >
                      解除停權
                    </button>
                  </td>
                </tr>
              ))}
              {suspendedQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={4}>
                    <QueryError
                      compact
                      title="停權中社團載入失敗"
                      error={suspendedQuery.error}
                      onRetry={() => void suspendedQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!suspendedQuery.isPending && !suspendedQuery.isError && suspensions.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>目前沒有停權中的社團</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      <Modal
        open={suspendOpen}
        title="停權社團"
        okText="確認停權"
        destroyOnHidden
        confirmLoading={suspend.isPending}
        okButtonProps={{ danger: true }}
        onOk={() => form.submit()}
        onCancel={() => {
          setSuspendOpen(false)
          form.resetFields()
        }}
      >
        <Form form={form} layout="vertical" onFinish={onSuspend}>
          <Form.Item name="club" label="社團" rules={[{ required: true, message: '請選擇社團' }]}>
            <ClubCascader width="100%" placeholder="請選擇" />
          </Form.Item>
          <Form.Item name="until" label="停權至" rules={[{ required: true, message: '請選擇日期' }]}>
            {/* 停權截止日不可早於今天(後端亦驗證) */}
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY/MM/DD"
              disabledDate={(d) => d.isBefore(dayjs(), 'day')}
            />
          </Form.Item>
          <Form.Item name="reason" label="原因" rules={[{ required: true, message: '停權原因為必填' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
