import { useEffect, useState } from 'react'
import { App, Button, Checkbox, Input, InputNumber, Select, Spin, Switch } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import QueryError from '../../components/ui/QueryError'
import {
  VENUE_CATEGORIES,
  useAdminVenues,
  useVenueMutations,
  type VenueCategory,
  type VenueItem,
} from '../../api/adminVenues'

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const CATEGORY_OPTIONS = VENUE_CATEGORIES.map((c) => ({ value: c, label: c }))

// 與器材主檔同一套操作:文字/數字欄以本地草稿編輯,blur 有差異才 PATCH;
// 類別、借用型態、啟用為離散控制,變更即 PATCH
function VenueRow({ item }: { item: VenueItem }) {
  const { message } = App.useApp()
  const { update } = useVenueMutations()
  const [name, setName] = useState(item.name)
  const [capacity, setCapacity] = useState<number | null>(item.capacity ?? null)
  // refetch 帶回他人的改動時同步本地草稿(避免停在舊值、互蓋)
  useEffect(() => setName(item.name), [item.name])
  useEffect(() => setCapacity(item.capacity ?? null), [item.capacity])

  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate(
      { id: item.id, patch: p },
      {
        onSuccess: () => message.success('已更新'),
        onError: (e) => message.error(errMsg(e)),
      },
    )

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: item.isActive ? 1 : 0.5 }}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim()
          if (!trimmed) {
            setName(item.name) // 清空不送出,回權威值
            return
          }
          if (trimmed !== item.name) patch({ name: trimmed })
        }}
        style={{ flex: 1, minWidth: 140 }}
        aria-label="場地名稱"
      />
      <Select<VenueCategory>
        value={item.category}
        onChange={(v) => patch({ category: v })}
        options={CATEGORY_OPTIONS}
        style={{ width: 110, flexShrink: 0 }}
        aria-label="場地類別"
      />
      <InputNumber
        value={capacity}
        min={0}
        precision={0}
        placeholder="人數"
        onChange={setCapacity}
        onBlur={() => {
          // 容納人數:清空=未設(送 null)
          if (capacity !== (item.capacity ?? null)) patch({ capacity })
        }}
        style={{ width: 90, flexShrink: 0 }}
        aria-label="容納人數"
      />
      <Checkbox checked={item.allowFixed} onChange={(e) => patch({ allowFixed: e.target.checked })}>
        固定
      </Checkbox>
      <Checkbox checked={item.allowTemp} onChange={(e) => patch({ allowTemp: e.target.checked })}>
        臨時
      </Checkbox>
      <Switch
        checked={item.isActive}
        onChange={(v) => patch({ isActive: v })}
        checkedChildren="啟用"
        unCheckedChildren="停用"
      />
    </div>
  )
}

function AddVenue() {
  const { message } = App.useApp()
  const { create } = useVenueMutations()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<VenueCategory>(VENUE_CATEGORIES[0])
  const [capacity, setCapacity] = useState<number | null>(null)
  const [allowFixed, setAllowFixed] = useState(false)
  const [allowTemp, setAllowTemp] = useState(false)

  const add = () => {
    if (!name.trim()) {
      message.error('請輸入場地名稱')
      return
    }
    if (!allowFixed && !allowTemp) {
      message.error('請至少開放一種借用型態')
      return
    }
    create.mutate(
      { name: name.trim(), capacity, category, allowFixed, allowTemp },
      {
        onSuccess: () => {
          message.success('已新增場地')
          setName('')
          setCapacity(null)
          setAllowFixed(false)
          setAllowTemp(false)
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="新增場地名稱"
        style={{ flex: 1, minWidth: 140 }}
      />
      <Select<VenueCategory> value={category} onChange={setCategory} options={CATEGORY_OPTIONS} style={{ width: 110, flexShrink: 0 }} />
      <InputNumber value={capacity} min={0} precision={0} placeholder="人數" style={{ width: 90, flexShrink: 0 }} onChange={setCapacity} />
      <Checkbox checked={allowFixed} onChange={(e) => setAllowFixed(e.target.checked)}>
        固定
      </Checkbox>
      <Checkbox checked={allowTemp} onChange={(e) => setAllowTemp(e.target.checked)}>
        臨時
      </Checkbox>
      <Button icon={<PlusOutlined />} loading={create.isPending} onClick={add} style={{ flexShrink: 0 }}>
        新增
      </Button>
    </div>
  )
}

// 場地主檔:停用不刪列以保既有借用單與不開放規則的外鍵
export default function AdminVenueCard() {
  const query = useAdminVenues()

  return (
    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div style={sectionTitle}>場地主檔</div>
      <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 10 }}>
        欄位依序:名稱/類別/容納人數(空=未設)/開放固定借用/開放臨時借用/啟用
      </div>
      {query.isError ? (
        <QueryError title="場地主檔載入失敗" error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Spin spinning={query.isPending}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(query.data ?? []).map((item) => (
              <VenueRow key={item.id} item={item} />
            ))}
            <AddVenue />
          </div>
        </Spin>
      )}
    </div>
  )
}
