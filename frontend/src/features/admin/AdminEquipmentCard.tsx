import { useEffect, useState } from 'react'
import { App, Button, Input, InputNumber, Select, Spin, Switch } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import QueryError from '../../components/ui/QueryError'
import {
  HANDOVER_OPTIONS,
  useAdminEquipment,
  useEquipmentMutations,
  type EquipmentItem,
} from '../../api/adminEquipment'

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// 每列以本地草稿編輯,blur 有差異才 PATCH(打字中不送出中間值);
// 點交方式/啟用為離散控制,變更即 PATCH。新增於底部一列
function EquipmentRow({ item }: { item: EquipmentItem }) {
  const { message } = App.useApp()
  const { update } = useEquipmentMutations()
  const [name, setName] = useState(item.name)
  const [qty, setQty] = useState<number | null>(item.totalQty)
  // refetch 帶回他人的改動時同步本地草稿(避免停在舊值、互蓋)
  useEffect(() => setName(item.name), [item.name])
  useEffect(() => setQty(item.totalQty), [item.totalQty])

  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate(
      { id: item.id, patch: p },
      {
        onSuccess: () => message.success('已更新'),
        onError: (e) => message.error(errMsg(e)),
      },
    )

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: item.isActive ? 1 : 0.5 }}>
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
        style={{ flex: 1, minWidth: 120 }}
        aria-label="器材名稱"
      />
      <Select
        value={item.needsSerial}
        onChange={(v) => patch({ needsSerial: v })}
        options={HANDOVER_OPTIONS}
        style={{ width: 110, flexShrink: 0 }}
        aria-label="點交方式"
      />
      <InputNumber
        value={qty}
        min={0}
        precision={0}
        onChange={setQty}
        onBlur={() => {
          if (qty == null) {
            setQty(item.totalQty) // 清空不送出,回權威值
            return
          }
          if (qty !== item.totalQty) patch({ totalQty: qty })
        }}
        style={{ width: 90, flexShrink: 0 }}
        aria-label="總數"
      />
      <Switch
        checked={item.isActive}
        onChange={(v) => patch({ isActive: v })}
        checkedChildren="啟用"
        unCheckedChildren="停用"
      />
    </div>
  )
}

function AddEquipment() {
  const { message } = App.useApp()
  const { create } = useEquipmentMutations()
  const [name, setName] = useState('')
  const [needsSerial, setNeedsSerial] = useState(false)
  const [qty, setQty] = useState<number | null>(null)

  const add = () => {
    if (!name.trim()) {
      message.error('請輸入器材名稱')
      return
    }
    create.mutate(
      { name: name.trim(), totalQty: qty ?? 0, needsSerial },
      {
        onSuccess: () => {
          message.success('已新增器材')
          setName('')
          setNeedsSerial(false)
          setQty(null)
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="新增器材名稱"
        style={{ flex: 1, minWidth: 120 }}
      />
      <Select value={needsSerial} onChange={setNeedsSerial} options={HANDOVER_OPTIONS} style={{ width: 110, flexShrink: 0 }} />
      <InputNumber value={qty} min={0} precision={0} placeholder="總數" style={{ width: 90, flexShrink: 0 }} onChange={setQty} />
      <Button icon={<PlusOutlined />} loading={create.isPending} onClick={add} style={{ flexShrink: 0 }}>
        新增
      </Button>
    </div>
  )
}

// 器材主檔:管理員可設各器材總數(2026-07-17 需求方);停用不刪列以保既有借用外鍵
export default function AdminEquipmentCard() {
  const query = useAdminEquipment()

  return (
    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div style={sectionTitle}>器材主檔</div>
      {query.isError ? (
        <QueryError title="器材主檔載入失敗" error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Spin spinning={query.isPending}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(query.data ?? []).map((item) => (
              <EquipmentRow key={item.id} item={item} />
            ))}
            <AddEquipment />
          </div>
        </Spin>
      )}
    </div>
  )
}
