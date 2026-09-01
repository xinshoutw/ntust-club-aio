import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, DatePicker, Form, Input, InputNumber, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { useFormUnsavedGuard } from '../../app/unsaved'
import PageHeader from '../../components/ui/PageHeader'
import { PHONE_RULE, normalizePhone } from '../../lib/form'
import { confirmDialog } from '../../lib/confirm'
import { notFoundText } from '../../lib/selectOptions'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import { Cols, Pager } from '../../components/ui/tableControls'
import SuspensionNote from '../../components/ui/SuspensionNote'
import { useClubSuspension } from '../../api/clubProfile'
import { useClubConfig } from '../../api/clubConfig'
import {
  useBookingMutations,
  useEquipmentList,
  useActiveEquipmentLoans,
  useRecentEquipmentLoans,
  RECENT_PAGE,
  type DateRange,
} from '../../api/bookings'
import { useApprovedActivities } from '../../api/activities'
import { useNoActivityAccount } from '../../lib/noActivityAccount'
import { useDecisionReason } from './DecisionReasonModal'
import { taipeiToday } from '../../lib/today'

const { RangePicker } = DatePicker

export default function EquipmentPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const guard = useFormUnsavedGuard()
  const { suspended } = useClubSuspension()

  // 借用總覽的器材格點入時帶入品項與日期(起訖同日)
  const [params] = useSearchParams()
  const qEquipmentId = Number(params.get('equipment')) || undefined
  const rawDate = params.get('date')
  // 嚴格驗證 query 日期(非嚴格 parse 會把 2026/99/99 正規化成別的日期);過去日期不帶入
  const qDate =
    rawDate && dayjs(rawDate, 'YYYY/MM/DD', true).isValid() &&
    !dayjs(rawDate, 'YYYY/MM/DD', true).isBefore(taipeiToday(), 'day')
      ? dayjs(rawDate, 'YYYY/MM/DD', true)
      : undefined

  // 器材借用綁定審核通過之活動(排除已結束,後端亦擋);
  // 借用區間由社團自填 —— 提前籌備與事後驗收推導不出來
  // 區間上限的權威在後端(booking_service.MAX_LOAN_DAYS),前端讀 /club/config 即時擋;
  // 組態讀不到就不預檢,交給送出時的後端訊息(不自己編一個數字)
  const maxLoanDays = useClubConfig().data?.equipmentLoanMaxDays
  const noActivity = useNoActivityAccount()  // 802 國際事務處免綁活動(D-36)
  const activitiesQuery = useApprovedActivities()
  const approved = activitiesQuery.data ?? [] // 已結束的由後端篩掉
  const picked = Form.useWatch('range', form) as [Dayjs | null, Dayjs | null] | null | undefined
  const loanRange: DateRange | null = picked?.[0] && picked[1] ? [picked[0], picked[1]] : null
  const equipmentQuery = useEquipmentList(loanRange)
  // 深連結的品項只回填一次:使用者自己清掉後不該又被塞回來
  const prefilled = useRef(false)
  const items = equipmentQuery.data ?? []
  // 換區間時沿用舊列表避免表格閃空,但可借數在新區間資料就緒前一律視為未知(顯示 —)
  const ready = loanRange != null && !equipmentQuery.isPlaceholderData

  // 正在借用=進行中全部(不限長度、可取消);最近借用=歸還/退回/取消 近 5 筆
  const activeQuery = useActiveEquipmentLoans()
  const activeRows = activeQuery.data ?? []
  const [recentPage, setRecentPage] = useState(1)
  const recentQuery = useRecentEquipmentLoans({ page: recentPage, pageSize: RECENT_PAGE })
  const recent = recentQuery.data?.rows ?? []
  const recentTotal = recentQuery.data?.total ?? 0
  const decision = useDecisionReason()
  const { createEquipmentLoan, cancelEquipmentLoan } = useBookingMutations()
  const todayStart = taipeiToday()

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
  const selectedAvail = ready && selectedId != null ? items.find((e) => e.id === selectedId)?.available ?? null : null
  // 單次可借上限(undefined=不限):與可借數取小作為數量上限
  const selectedCap = selectedId != null ? items.find((e) => e.id === selectedId)?.maxLeaseCount ?? null : null
  const qtyMax = selectedAvail != null && selectedCap != null
    ? Math.min(selectedAvail, selectedCap)
    : selectedAvail ?? selectedCap

  // 換區間即重推可借數:原選品項在新區間不可借就清掉(資料就緒後檢查)。
  // 器材主檔為非同步載入,借用總覽帶進來的品項同樣待資料就緒後才驗證回填 ——
  // 不放 initialValues:那會讓下面的清除守衛把它又塞回來(resetFields 是重設回初值)
  useEffect(() => {
    if (!ready) return
    const id = form.getFieldValue('equipment') as number | undefined
    if (id == null) {
      const picked = items.find((e) => e.id === qEquipmentId)
      if (picked && picked.available > 0 && !prefilled.current) {
        prefilled.current = true
        form.setFieldValue('equipment', picked.id)
      }
      return
    }
    const item = items.find((e) => e.id === id)
    if (!item || item.available === 0) form.resetFields(['equipment'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentQuery.data])

  const submit = (values: {
    activity?: number
    range: DateRange
    equipment: number
    qty: number
    purpose: string
    phone: string
  }) => {
    const equipmentName = items.find((e) => e.id === values.equipment)?.name ?? ''
    const activityName = approved.find((a) => a.id === values.activity)?.name ?? ''
    createEquipmentLoan.mutate(
      {
        equipmentId: values.equipment,
        activityId: noActivity ? null : (values.activity ?? null),
        qty: values.qty,
        range: values.range,
        purpose: values.purpose,
        phone: values.phone,
      },
      {
        onSuccess: () => {
          const suffix = activityName ? `(${activityName})` : ''
          message.success(`已送出「${equipmentName} ×${values.qty}」借用申請${suffix}`)
          form.resetFields()
          guard.clear()
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  return (
    <div>
      <PageHeader title="器材借用" sub={<SuspensionNote />} />

      <div className="overview-grid" style={{ marginTop: 20 }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>器材一覽</div>
          <LoadingBlock pending={equipmentQuery.isPending}>
            <table className="tb fixed" aria-label="器材一覽" style={{ minWidth: 480 }}>
              <Cols widths={['auto', 100, 120]} />
              <thead>
                <tr>
                  <th scope="col">品項</th>
                  <th scope="col">點交方式</th>
                  <th scope="col" className="r">可借 / 總數</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const a = ready ? e.available : null
                  // 未填借用區間(a===null)前不可點選帶入;可借 0 也不可點
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
          </LoadingBlock>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>借用申請</div>
          <Form
            form={form}
            layout="vertical"
            onFinish={submit}
            requiredMark
            initialValues={{ range: qDate ? [qDate, qDate] : undefined }}
            onValuesChange={(changed) => {
              guard.onValuesChange()
              if ('equipment' in changed) form.resetFields(['qty'])
              // 換區間=換可借數:數量一律重填(原選品項的清除待新資料就緒後於 effect 處理)
              if ('range' in changed) form.resetFields(['qty'])
            }}
          >
            <Form.Item
              name="activity"
              label="關聯活動"
              rules={noActivity ? [] : [{ required: true, message: '請選擇活動' }]}
            >
              <Select
                disabled={noActivity}
                placeholder={noActivity ? '無需填寫' : '請選擇活動'}
                loading={!noActivity && activitiesQuery.isPending}
                options={approved.map((a) => ({ value: a.id, label: a.name }))}
                notFoundContent={notFoundText(activitiesQuery, '無審核通過之活動', '活動清單')}
              />
            </Form.Item>
            <Form.Item
              name="range"
              label="借用區間"
              rules={[
                { required: true, message: '請選擇借用區間' },
                {
                  validator: (_, v: [Dayjs, Dayjs] | null) =>
                    maxLoanDays != null && v?.[0] && v[1] && v[1].diff(v[0], 'day') + 1 > maxLoanDays
                      ? Promise.reject(new Error(`借用區間最長 ${maxLoanDays} 天`))
                      : Promise.resolve(),
                },
              ]}
            >
              {/* 含籌備與驗收的天數一併填進來;過去日期不受理(後端亦擋) */}
              <RangePicker
                style={{ width: '100%' }}
                format="YYYY/MM/DD"
                allowClear={false}
                disabledDate={(d) => d.isBefore(taipeiToday(), 'day')}
                placeholder={['開始日', '結束日']}
              />
            </Form.Item>
            <Form.Item name="equipment" label="品項" rules={[{ required: true, message: '請選擇品項' }]}>
              {/* 器材查詢失敗時 ready 也是 false,不能照樣說「請先選擇借用區間」——
                  區間明明已經填了,那句話會讓人一直重選日期 */}
              <Select
                placeholder={
                  equipmentQuery.isError ? '器材清單載入失敗' : ready ? '請選擇' : '請先選擇借用區間'
                }
                disabled={!ready}
                notFoundContent={notFoundText(equipmentQuery, '此區間沒有可借器材', '器材清單')}
                options={items.map((e) => {
                  const a = ready ? e.available : null
                  return {
                    value: e.id,
                    label: `${e.name}（剩餘 ${a ?? '—'}）`,
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
              <InputNumber style={{ width: '100%' }} min={1} max={qtyMax ?? 99} precision={0} disabled={!ready} />
            </Form.Item>

            <Form.Item
                name="purpose"
                label="用途"
                rules={[{ required: true, message: '請輸入用途' }]}
            >
              <Input placeholder="簡述說明" />
            </Form.Item>
            <Form.Item
              name="phone"
              label="聯絡電話"
              normalize={normalizePhone}
              rules={[{ required: true, message: '請輸入聯絡電話' }, PHONE_RULE]}
            >
              {/* 不設 maxLength:DOM 的 maxlength 在 normalize 之前就把貼上的內容截掉 */}
              <Input className="num" placeholder="0912-345-678 或 4 碼分機" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={createEquipmentLoan.isPending} disabled={createEquipmentLoan.isPending || suspended}>
              送出申請
            </Button>
          </Form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>正在借用</div>
        <LoadingBlock pending={activeQuery.isPending}>
          <table className="tb fixed" aria-label="正在借用" style={{ minWidth: 760 }}>
            <Cols widths={['auto', 190, 'auto', 100, 110, 80]} />
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col">借用期間</th>
                <th scope="col">活動/用途</th>
                <th scope="col">收件人</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>
                    {l.equipmentName} <span className="num">×{l.qty}</span>
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
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 20 }}>無進行中的借用</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>最近借用</div>
        <LoadingBlock pending={recentQuery.isPending}>
          <table className="tb fixed" aria-label="最近借用" style={{ minWidth: 760 }}>
            <Cols widths={['auto', 190, 'auto', 150, 110]} />
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col">借用期間</th>
                <th scope="col">活動/用途</th>
                <th scope="col">收件/歸還人</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((l) => {
                // 退回件與承辦撤銷的取消件可點開原因(舊資料沒留理由時彈窗會說明)
                const row = decision.rowProps(`${l.equipmentName} ×${l.qty}`, l.status, l.decision)
                return (
                  <tr key={l.id} {...row.tr}>
                    <td style={{ fontWeight: 500 }}>
                      {row.wrap(<>{l.equipmentName} <span className="num">×{l.qty}</span></>)}
                    </td>
                    <td className="num" style={{ fontSize: 13 }}>{l.startDate} – {l.endDate}</td>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>{l.activityName ?? l.purpose}</td>
                    <td style={{ color: 'var(--steel)', fontSize: 13 }}>
                      {l.borrower && <>收件 {l.borrower}</>}
                      {l.borrower && l.returnedBy && ' · '}
                      {l.returnedBy && <>歸還 {l.returnedBy}</>}
                      {!l.borrower && !l.returnedBy && '—'}
                    </td>
                    <td><StatusPill status={l.status} /></td>
                  </tr>
                )
              })}
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
        </LoadingBlock>
        <Pager page={recentPage} pageSize={RECENT_PAGE} total={recentTotal} onChange={setRecentPage} style={{ padding: '10px 0 14px' }} />
      </div>

      {decision.node}
    </div>
  )
}
