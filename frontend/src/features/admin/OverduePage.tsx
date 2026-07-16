import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, Modal, Spin } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import { useAdminClubs } from '../../api/adminClubs'
import { useAdminEquipmentLoanList } from '../../api/adminClubOverview'
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
  // 逾期=推導狀態(結束日之隔天上班日 10:30 未歸還),由後端以 status=overdue 篩選
  const overdueQuery = useAdminEquipmentLoanList({ status: 'overdue' })
  const suspendedQuery = useSuspendedClubs()
  const clubsQuery = useAdminClubs() // 停權表單以名稱選社團 → 送出時對回主鍵
  const { remind, suspend, lift } = useOverdueMutations()
  const overdue = overdueQuery.data ?? []
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
            停權社團…
          </Button>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>逾期未還器材</div>
        <Spin spinning={overdueQuery.isPending}>
          <table className="tb dense" aria-label="逾期未還器材" style={{ minWidth: 720 }}>
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
                  <td>{l.club}</td>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipment} <span className="num">×{l.qty}</span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                    借用區間 <span className="num">{l.startDate} – {l.endDate}</span>
                    {l.activity ? ` · ${l.activity}` : ''}
                  </td>
                  <td style={{ width: 110 }}><StatusPill status="overdue" /></td>
                  <td className="r" style={{ width: 100 }}>
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
                  <td colSpan={5} style={{ textAlign: 'center', color: '#B03A2E', padding: 24 }}>
                    載入失敗:{overdueQuery.error.message}
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
        </Spin>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>停權中社團</div>
        <Spin spinning={suspendedQuery.isPending}>
          <table className="tb" aria-label="停權中社團" style={{ minWidth: 560 }}>
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
                  <td style={{ fontWeight: 500, width: 160 }}>{s.name}</td>
                  <td style={{ width: 100 }}><StatusPill status="suspended" /></td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>
                    至 <span className="num">{s.until}</span>{s.reason ? ` · ${s.reason}` : ''}
                  </td>
                  <td className="r" style={{ width: 100 }}>
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
                  <td colSpan={4} style={{ textAlign: 'center', color: '#B03A2E', padding: 24 }}>
                    載入失敗:{suspendedQuery.error.message}
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
        </Spin>
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
          <Form.Item name="reason" label="原因(必填,通知社團)" rules={[{ required: true, message: '停權原因為必填' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
