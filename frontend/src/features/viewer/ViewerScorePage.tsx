import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { App, Button, InputNumber, Modal, Select } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/tableControls'
import { ASSIGNMENTS, type AwardAssignment } from './mock'

const PAGE_SIZE = 20

// 評分(依獎項)(評審端基礎原型):選獎項 → 逐社團開評分彈窗填各細項。
// mock:分數僅存本地 state;獎項選取持久於 URL(?award=)
export default function ViewerScorePage() {
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const awardKey = params.get('award') ?? ASSIGNMENTS[0].key
  const award: AwardAssignment = ASSIGNMENTS.find((a) => a.key === awardKey) ?? ASSIGNMENTS[0]

  // scored[`${award}:${club}`] = 各細項分數(mock 本地暫存)。
  // 鍵含獎項:同一社團可能出現在多個獎項分組,單以社團名為鍵會跨獎互相污染
  // (後端 ReviewScore 唯一鍵亦為 year+award+club+reviewer)
  const [scored, setScored] = useState<Record<string, Record<string, number>>>({})
  const scoreKey = (club: string) => `${award.key}:${club}`
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, number | null>>({})
  const [page, setPage] = useState(1)

  const openClub = (club: string) => {
    setSelectedClub(club)
    setDraft(
      Object.fromEntries(
        award.items.map((i) => [i.key, scored[scoreKey(club)]?.[i.key] ?? null]),
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
      [scoreKey(selectedClub)]: Object.fromEntries(
        award.items.map((i) => [i.key, draft[i.key] as number]),
      ),
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
            onChange={(v) => {
              setParams({ award: v })
              setPage(1)
            }}
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
            {award.clubs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((club) => {
              const s = scored[scoreKey(club)]
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
            {award.clubs.length === 0 && (
              <tr className="no-hover">
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>此獎項沒有受評社團</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE_SIZE} total={award.clubs.length} onChange={setPage} />
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
