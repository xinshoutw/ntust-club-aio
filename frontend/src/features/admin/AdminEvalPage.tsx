import { useEffect, useReducer, useState } from 'react'
import { App, Button, InputNumber, Tooltip } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { applyOverrides, computeAdScores, totalOf, type AdKey } from '../eval/scoring'
import { EVAL_WINDOW, buildScoringInput, meritOf, overridesOf, setMerit } from '../eval/store'
import { AD_LABELS } from '../eval/types'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'

// ponytail: mock 僅資工系學會有完整平時資料;其餘社團顯示同一組示意數據
// 行政分審核:每項可手動調整分數或回到自動計算結果(直接生效,社團端同步)
export default function AdminEvalPage() {
  const { message } = App.useApp()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const { club } = useAdminClub()
  const [editing, setEditing] = useState<AdKey | null>(null)
  const [editValue, setEditValue] = useState<number | null>(null)

  // 切換社團時放棄進行中的編輯,避免把 A 社輸入的分數存進 B 社
  useEffect(() => setEditing(null), [club])

  // 調整以社團為單位;切換社團互不影響
  const overrides = overridesOf(club)
  const scores = applyOverrides(computeAdScores(buildScoringInput(club)), overrides)
  const total = totalOf(scores)

  const startEdit = (key: AdKey, current: number) => {
    setEditing(key)
    setEditValue(current)
  }

  const saveEdit = (key: AdKey) => {
    if (editValue == null) {
      message.error('請輸入分數')
      return
    }
    overrides[key] = editValue
    setEditing(null)
    message.success(`「${AD_LABELS[key].name}」已調整為 ${editValue} 分`)
    force()
  }

  const revert = (key: AdKey) => {
    overrides[key] = null
    setEditing(null)
    message.success(`「${AD_LABELS[key].name}」已回到自動計算結果`)
    force()
  }

  return (
    <div>
      <PageHeader
        title="評鑑行政分審核"
        sub={
          <>
            {EVAL_WINDOW.label} · 採計期間 <span className="num">{EVAL_WINDOW.range}</span>
          </>
        }
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClubSelect width={190} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>採用總分</div>
              <div style={{ lineHeight: 1.2 }}>
                <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{total}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}> / 100</span>
              </div>
            </div>
          </div>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 780 }}>
          <thead>
            <tr>
              <th>評分項目</th>
              <th className="r">自動計算</th>
              <th className="r">採用分數</th>
              <th style={{ width: 300 }}>動作</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.key} className="no-hover">
                <td>
                  <div style={{ fontWeight: 500 }}>{AD_LABELS[s.key].name}</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                    {AD_LABELS[s.key].group} · {s.note}
                  </div>
                </td>
                <td className="r num" style={{ fontSize: 13, color: 'var(--steel)' }}>
                  {s.auto} / {s.key === 'adj' ? '+5' : s.max}
                </td>
                <td className="r">
                  <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{s.final}</span>
                  {s.overridden && (
                    <Tooltip title={`自動計算為 ${s.auto} 分`}>
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 4, padding: '0 4px' }}>
                        已調整
                      </span>
                    </Tooltip>
                  )}
                </td>
                <td>
                  {editing === s.key ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <InputNumber
                        size="small"
                        autoFocus
                        value={editValue}
                        onChange={setEditValue}
                        min={s.key === 'adj' ? -10 : 0}
                        max={s.key === 'adj' ? 5 : s.max}
                        step={0.5}
                        style={{ width: 90 }}
                      />
                      <Button size="small" type="primary" onClick={() => saveEdit(s.key)}>儲存</Button>
                      <Button size="small" onClick={() => setEditing(null)}>取消</Button>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <Button size="small" onClick={() => startEdit(s.key, s.final)}>手動調整分數</Button>
                      <Button size="small" disabled={!s.overridden} onClick={() => revert(s.key)}>
                        回到自動計算結果
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="no-hover">
              <td>
                <div style={{ fontWeight: 500 }}>表現優良加分</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                  義務協助學校活動或校外性活動得獎;計入(五)加減分,最多 +5
                </div>
              </td>
              <td className="r num" style={{ fontSize: 13, color: 'var(--steel)' }}>—</td>
              <td className="r num" style={{ fontSize: 15, fontWeight: 600 }}>+{meritOf(club)}</td>
              <td>
                <InputNumber
                  size="small"
                  value={meritOf(club)}
                  min={0}
                  max={5}
                  step={1}
                  style={{ width: 90 }}
                  onChange={(v) => {
                    setMerit(club, v ?? 0)
                    force()
                  }}
                  aria-label="表現優良加分"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
