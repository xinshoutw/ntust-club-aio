import { useEffect } from 'react'
import dayjs from 'dayjs'
import { App, Button, Form, Input, InputNumber, Select, Spin } from 'antd'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import { confirmDialog } from '../../lib/confirm'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols } from '../../components/ui/tableControls'
import {
  useBookingMutations,
  useEquipmentList,
  useActiveEquipmentLoans,
  useRecentEquipmentLoans,
} from '../../api/bookings'
import { useActivityList } from '../../api/activities'
import { activityEnded } from '../activities/utils'

export default function EquipmentPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const guard = useFormUnsavedGuard()

  // 器材借用綁定審核通過之活動,借用區間由活動推導;
  // 可借數與借用區間由後端依所選活動推導(GET /club/equipment?activity_id=);
  // 排除已結束活動(後端亦擋)
  const activitiesQuery = useActivityList({ status: 'approved' })
  const approved = (activitiesQuery.data ?? []).filter((a) => !activityEnded(a))
  const activityId = Form.useWatch('activity', form) as number | undefined
  const equipmentQuery = useEquipmentList(activityId)
  const items = equipmentQuery.data?.items ?? []
  // 換活動時沿用舊列表避免表格閃空,但可借數在新活動資料就緒前一律視為未知(顯示 —)
  const loanWindow = activityId != null && !equipmentQuery.isPlaceholderData ? equipmentQuery.data?.window ?? null : null

  // 正在借用=進行中全部(不限長度、可取消);最近借用=歸還/退回/取消 近 5 筆
  const activeQuery = useActiveEquipmentLoans()
  const activeRows = activeQuery.data ?? []
  const recentQuery = useRecentEquipmentLoans()
  const recent = recentQuery.data ?? []
  const { createEquipmentLoan, cancelEquipmentLoan } = useBookingMutations()
  const todayStart = dayjs().startOf('day')

  const cancelRow = (l: { id: number; equipmentName: string; qty: number }) =>
    confirmDialog(modal, {
      title: `取消器材借用 ${l.equipmentName} ×${l.qty}`,
      content: '取消後不可復原;已核准的借用取消後數量將釋出',
      okText: '取消借用',
      okButtonProps: { danger: true },
      cancelText: '返回',
      onOk: () =>
        cancelEquipmentLoan.mutate(l.id, {
          onSuccess: () => message.success('已取消'),
          onError: (e) => message.error(e.message),
        }),
    })

  const selectedId = Form.useWatch('equipment', form) as number | undefined
  const selectedAvail = loanWindow != null && selectedId != null ? items.find((e) => e.id === selectedId)?.available ?? null : null
  // 單次可借上限(undefined=不限):與可借數取小作為數量上限
  const selectedCap = selectedId != null ? items.find((e) => e.id === selectedId)?.maxLeaseCount ?? null : null
  const qtyMax = selectedAvail != null && selectedCap != null
    ? Math.min(selectedAvail, selectedCap)
    : selectedAvail ?? selectedCap

  // 換活動=換借用區間,可借數重新推導:原選品項在新區間不可借就清掉(資料就緒後檢查)
  useEffect(() => {
    if (!loanWindow) return
    const id = form.getFieldValue('equipment') as number | undefined
    if (id == null) return
    const item = items.find((e) => e.id === id)
    if (!item || item.available === 0) form.resetFields(['equipment'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentQuery.data])

  const submit = (values: { activity: number; equipment: number; qty: number; purpose: string; phone: string }) => {
    const equipmentName = items.find((e) => e.id === values.equipment)?.name ?? ''
    const activityName = approved.find((a) => a.id === values.activity)?.name ?? ''
    createEquipmentLoan.mutate(
      {
        equipmentId: values.equipment,
        activityId: values.activity,
        qty: values.qty,
        purpose: values.purpose,
        phone: values.phone,
      },
      {
        onSuccess: () => {
          message.success(`已送出「${equipmentName} ×${values.qty}」借用申請(${activityName})`)
          form.resetFields()
          guard.clear()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader title="器材借用" />

      <div className="overview-grid" style={{ marginTop: 20 }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <Spin spinning={equipmentQuery.isPending}>
            <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材一覽</div>
            <table className="tb fixed" aria-label="器材一覽" style={{ minWidth: 480 }}>
              <Cols widths={['auto', 100, 120]} />
              <thead>
                <tr>
                  <th>品項</th>
                  <th>點交方式</th>
                  <th className="r">可借 / 總數</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const a = loanWindow ? e.available : null
                  // 未選關聯活動(a===null)前不可點選帶入;可借 0 也不可點
                  const disabled = a === null || a === 0
                  const pick = () => {
                    form.setFieldValue('equipment', e.id)
                    form.resetFields(['qty'])
                  }
                  return (
                    <tr
                      key={e.id}
                      onClick={() => {
                        if (!disabled) pick()
                      }}
                      style={
                        a === 0
                          ? { background: '#EEF0F3', color: 'var(--steel)', cursor: 'not-allowed' }
                          : { cursor: disabled ? 'default' : 'pointer' }
                      }
                    >
                      <td style={{ fontWeight: 500 }}>
                        {disabled ? (
                          e.name
                        ) : (
                          <button
                            type="button"
                            className="row-open-btn"
                            aria-label={`將「${e.name || '未命名品項'}」帶入借用申請表單`}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              pick()
                            }}
                          >
                            {e.name}
                          </button>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {e.needsSerial ? (
                          <span style={{ color: 'var(--seal)' }}>依序點交</span>
                        ) : (
                          <span style={{ color: 'var(--steel)' }}>一般</span>
                        )}
                      </td>
                      <td className="r num">
                        {a ?? '—'} / {e.totalQty}
                      </td>
                    </tr>
                  )
                })}
                {equipmentQuery.isError && (
                  <tr className="no-hover">
                    <td colSpan={3}>
                      <QueryError compact title="器材一覽載入失敗" error={equipmentQuery.error} onRetry={() => equipmentQuery.refetch()} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Spin>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>借用申請</div>
          <Form
            form={form}
            layout="vertical"
            onFinish={submit}
            requiredMark
            onValuesChange={(changed) => {
              guard.onValuesChange()
              if ('equipment' in changed) form.resetFields(['qty'])
              // 換活動=換借用區間:數量一律重填(原選品項的清除待新資料就緒後於 effect 處理)
              if ('activity' in changed) form.resetFields(['qty'])
            }}
          >
            <Form.Item
              name="activity"
              label="關聯活動"
              rules={[{ required: true, message: '請選擇活動' }]}
              extra={
                loanWindow ? (
                  <span className="num">
                    可借用區間 {loanWindow.start} – {loanWindow.end}
                  </span>
                ) : (
                  '選擇活動後推算借用區間與可借數量'
                )
              }
            >
              <Select
                placeholder="請選擇活動"
                loading={activitiesQuery.isPending}
                options={approved.map((a) => ({ value: a.id, label: a.name }))}
                notFoundContent="無審核通過之活動"
              />
            </Form.Item>
            <Form.Item name="equipment" label="品項" rules={[{ required: true, message: '請選擇品項' }]}>
              <Select
                placeholder={loanWindow ? '請選擇' : '請先選擇關聯活動'}
                disabled={!loanWindow}
                options={items.map((e) => {
                  const a = loanWindow ? e.available : null
                  return {
                    value: e.id,
                    label: `${e.name}(可借 ${a ?? '—'})`,
                    disabled: a === 0,
                  }
                })}
              />
            </Form.Item>
            <Form.Item
              name="qty"
              label="數量"
              rules={[
                { required: true, message: '請輸入數量' },
                {
                  // max 只擋鍵入,不會回夾既有值:送出前再驗一次(可借數與單次上限)
                  validator: (_, v: number | null) => {
                    if (v == null) return Promise.resolve()
                    if (selectedAvail != null && v > selectedAvail)
                      return Promise.reject(new Error(`該區間可借 ${selectedAvail} 件`))
                    if (selectedCap != null && v > selectedCap)
                      return Promise.reject(new Error(`單次至多借用 ${selectedCap} 件`))
                    return Promise.resolve()
                  },
                },
              ]}
              extra={selectedCap != null ? `單次至多 ${selectedCap} 件` : undefined}
            >
              <InputNumber style={{ width: '100%' }} min={1} max={qtyMax ?? 99} precision={0} disabled={!loanWindow} />
            </Form.Item>

            <Form.Item
                name="purpose"
                label="用途"
                rules={[{ required: true, message: '請輸入用途' }]}
            >
              <Input placeholder="簡述說明" />
            </Form.Item>
            <Form.Item name="phone" label="聯絡電話" rules={[{ required: true, message: '請輸入聯絡電話' }, { pattern: /^[0-9\-()*#]+$/, message: '僅能輸入數字與 - ( ) * #' }]}>
              <Input className="num" placeholder="申請聯絡人電話" maxLength={30} />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={createEquipmentLoan.isPending}>
              送出申請
            </Button>
          </Form>
        </div>
      </div>

      <Spin spinning={activeQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在借用</div>
          <table className="tb fixed" aria-label="正在借用" style={{ minWidth: 760 }}>
            <Cols widths={['auto', 190, 'auto', 100, 110, 80]} />
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col">借用期間</th>
                <th scope="col">活動/用途</th>
                <th scope="col">借用人</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipmentName} <span className="num">×{l.qty}</span>
                    {l.serials?.length ? (
                      <span className="num" style={{ color: 'var(--steel)', fontSize: 12 }}> ({l.serials.join('、')})</span>
                    ) : null}
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.activityName ?? l.purpose}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.borrower ?? '—'}</td>
                  <td><StatusPill status={l.status} /></td>
                  <td className="r">
                    {l.status === 'pending' ||
                    (l.status === 'approved' && dayjs(l.startDate, 'YYYY/MM/DD').isAfter(todayStart, 'day')) ? (
                      <Button size="small" danger onClick={() => cancelRow(l)}>取消</Button>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {activeQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={6}>
                    <QueryError compact title="借用紀錄載入失敗" error={activeQuery.error} onRetry={() => activeQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!activeQuery.isError && !activeQuery.isPending && activeRows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>目前沒有進行中的借用</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>

      <Spin spinning={recentQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近借用</div>
          <table className="tb fixed" aria-label="最近借用" style={{ minWidth: 760 }}>
            <Cols widths={['auto', 190, 'auto', 150, 110]} />
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col">借用期間</th>
                <th scope="col">活動/用途</th>
                <th scope="col">借用/歸還人</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipmentName} <span className="num">×{l.qty}</span>
                    {l.serials?.length ? (
                      <span className="num" style={{ color: 'var(--steel)', fontSize: 12 }}> ({l.serials.join('、')})</span>
                    ) : null}
                  </td>
                  <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.activityName ?? l.purpose}</td>
                  <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                    {l.borrower && <>借用 {l.borrower}</>}
                    {l.borrower && l.returnedBy && ' · '}
                    {l.returnedBy && <>歸還 {l.returnedBy}</>}
                    {!l.borrower && !l.returnedBy && '—'}
                  </td>
                  <td><StatusPill status={l.status} /></td>
                </tr>
              ))}
              {recentQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={5}>
                    <QueryError compact title="借用紀錄載入失敗" error={recentQuery.error} onRetry={() => recentQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!recentQuery.isError && !recentQuery.isPending && recent.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>尚無借用紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  )
}
