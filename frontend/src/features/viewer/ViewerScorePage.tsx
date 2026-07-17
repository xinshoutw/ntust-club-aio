import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { App, Button, InputNumber, Modal, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { ASSIGNMENTS, type AwardAssignment } from './mock'

// 評分(依獎項)(評審端基礎原型):選獎項 → 逐社團開評分彈窗填各細項。
// mock:分數僅存本地 state;獎項選取持久於 URL(?award=)
export default function ViewerScorePage() {
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const awardKey = params.get('award') ?? ASSIGNMENTS[0].key
  const award: AwardAssignment = ASSIGNMENTS.find((a) => a.key === awardKey) ?? ASSIGNMENTS[0]

  // scored[club] = 各細項分數(mock 本地暫存)
  const [scored, setScored] = useState<Record<string, Record<string, number>>>({})
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, number | null>>({})

  const openClub = (club: string) => {
    setSelectedClub(club)
    setDraft(
      Object.fromEntries(
        award.items.map((i) => [i.key, scored[club]?.[i.key] ?? null]),
      ),
    )
    setOpen(true)
  }

  const total = useMemo(
    () => award.items.reduce((s, i) => s + (draft[i.key] ?? 0), 0),
    [award.items, draft],
  )

  const save = () => {
    if (!selectedClub) return
    if (award.items.some((i) => draft[i.key] == null)) {
      message.error('所有評分細項皆須填寫')
      return
    }
    setScored((prev) => ({
      ...prev,
      [selectedClub]: Object.fromEntries(award.items.map((i) => [i.key, draft[i.key] as number])),
    }))
    setOpen(false)
    message.success(`${selectedClub} 評分已儲存(合計 ${total} 分)`)
  }

  return (
    <div>
      <PageHeader
        title="評分(依獎項)"
        sub={
          <Select
            size="small"
            value={award.key}
            style={{ width: 200 }}
            onChange={(v) => setParams({ award: v })}
            options={ASSIGNMENTS.map((a) => ({ value: a.key, label: a.label }))}
          />
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>社團</th>
              <th>評分狀態</th>
              <th>合計</th>
            </tr>
          </thead>
          <tbody>
            {award.clubs.map((club) => {
              const s = scored[club]
              const sum = s ? Object.values(s).reduce((a, b) => a + b, 0) : null
              return (
                <tr key={club} className="click-tint" style={{ cursor: 'pointer' }} onClick={() => openClub(club)}>
                  <td style={{ fontWeight: 500 }}>{club}</td>
                  <td style={{ fontSize: 13, color: s ? '#1F6B45' : 'var(--steel)' }}>
                    {s ? '已評分(可修改)' : '未評分'}
                  </td>
                  <td className="num">{sum ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        afterClose={() => setSelectedClub(null)}
        destroyOnHidden
        title={selectedClub ? `${award.label} — ${selectedClub}` : ''}
        footer={
          <Button type="primary" onClick={save}>
            儲存評分
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {award.items.map((item, idx) => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                {item.label}
                <span className="num" style={{ marginLeft: 8, fontSize: 12, color: 'var(--steel)' }}>
                  配分 {item.max}
                </span>
              </div>
              <InputNumber
                autoFocus={idx === 0}
                min={0}
                max={item.max}
                value={draft[item.key]}
                onChange={(v) => setDraft((prev) => ({ ...prev, [item.key]: v }))}
                style={{ width: 90 }}
              />
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, textAlign: 'right' }}>
            合計 <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{total}</span> /{' '}
            <span className="num">{award.items.reduce((s, i) => s + i.max, 0)}</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}
