import { useState } from 'react'
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

// 每列欄位變更即各自 PATCH(數量/名稱/類別/序號登記/啟用);新增於底部一列
function EquipmentRow({ item }: { item: EquipmentItem }) {
  const { message } = App.useApp()
  const { update } = useEquipmentMutations()
  const [name, setName] = useState(item.name)

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
        onBlur={() => name.trim() && name !== item.name && patch({ name: name.trim() })}
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
        value={item.totalQty}
        min={0}
        precision={0}
        onChange={(v) => v != null && v !== item.totalQty && patch({ totalQty: v })}
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
