import { useState } from 'react'
import { App, Button, DatePicker, Input, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import { confirmDialog } from '../../lib/confirm'
import { isWeekend } from '../../lib/workdays'
import { useHolidayMutations, useHolidays, type Holiday } from '../../api/adminHolidays'

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }
const DATE_FMT = 'YYYY/MM/DD'
const ISO = 'YYYY-MM-DD'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// 依年份分組(依日期已排序);跨年度一長串 Tag 讀不出斷點
const byYear = (rows: Holiday[]): [string, Holiday[]][] => {
  const groups = new Map<string, Holiday[]>()
  for (const row of rows) {
    const year = row.date.slice(0, 4)
    groups.set(year, [...(groups.get(year) ?? []), row])
  }
  return [...groups]
}

function AddHoliday() {
  const { message } = App.useApp()
  const { save } = useHolidayMutations()
  const [day, setDay] = useState<Dayjs | null>(null)
  const [name, setName] = useState('')

  const add = () => {
    if (save.isPending) return // Enter 連按:Button 的 loading 擋不到鍵盤這條路
    if (!day) {
      message.error('請選擇日期')
      return
    }
    if (!name.trim()) {
      message.error('請輸入名稱')
      return
    }
    save.mutate(
      { date: day.format(ISO), name: name.trim() },
      {
        onSuccess: () => {
          message.success('已登記')
          setDay(null)
          setName('')
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <DatePicker
        value={day}
        onChange={setDay}
        format={DATE_FMT}
        placeholder="放假日期"
        disabledDate={isWeekend}
        style={{ width: 160, flexShrink: 0 }}
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={add}
        placeholder="名稱（如：國慶日、颱風假）"
        style={{ flex: 1, minWidth: 120 }}
      />
      <Button
        icon={<PlusOutlined />}
        loading={save.isPending}
        onClick={add}
        style={{ flexShrink: 0 }}
      >
        新增
      </Button>
    </div>
  )
}

// 政府行事曆假日:器材逾期「隔天上班日」的判定依據。整年份由
// scripts/import_holidays.py 匯入,這裡供補漏與臨時放假(颱風假)
export default function AdminHolidayCard() {
  const { message, modal } = App.useApp()
  const query = useHolidays()
  const { remove } = useHolidayMutations()

  // 刪一天會把所有在借單的歸還期限往前挪一天,而逾期可觸發停權 —— 先問再刪
  const drop = (h: Holiday) =>
    confirmDialog(modal, {
      title: '刪除放假日',
      content: `${dayjs(h.date).format(DATE_FMT)} ${h.name}`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () =>
        remove.mutate(h.date, {
          onSuccess: () => message.success('已移除'),
          onError: (e) => message.error(errMsg(e)),
        }),
    })

  return (
    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div style={sectionTitle}>放假日</div>
      <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 10 }}>
        器材歸還期限「結束日之隔天上班日」的依據；週六日已排除，不必登記
      </div>
      {query.isLoadingError ? (
        <QueryError
          title="放假日載入失敗"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <LoadingBlock pending={query.isPending}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byYear(query.data ?? []).map(([year, rows]) => (
              <div key={year}>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 6 }}>{year}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rows.map((h) => (
                    <Tag
                      key={h.date}
                      closable
                      // preventDefault:少了它 Tag 會自己隱藏,DELETE 失敗那天就只是從畫面上消失
                      onClose={(e) => {
                        e.preventDefault()
                        drop(h)
                      }}
                      style={{ marginInlineEnd: 0 }}
                    >
                      {dayjs(h.date).format(DATE_FMT)} {h.name}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
            {query.data?.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--steel)' }}>
                尚未登記；整年份請以 scripts/import_holidays.py 匯入
              </div>
            )}
            <AddHoliday />
          </div>
        </LoadingBlock>
      )}
    </div>
  )
}
