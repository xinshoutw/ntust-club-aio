import { Tooltip } from 'antd'

export type StampState = 'done' | 'current' | 'todo' | 'rejected'

export interface StampStage {
  char: string
  /** 章下方那行:簽核者姓名,還沒簽到的關卡是 `-`(關卡本身由 char 表示) */
  label: string
  state: StampState
  /** 簽核時間(短)。hover 顯示 noteTitle 的完整時刻 */
  note?: string
  noteTitle?: string
}

// 關卡色相與 pill 一致(承=琥珀、組=藍、長=紫)
const STAGE_HUE: Record<string, { color: string; pulse: string }> = {
  承: { color: '#8A5A00', pulse: 'stampPulseAmber' },
  組: { color: '#1D5A9E', pulse: 'stampPulseBlue' },
  長: { color: '#6B4FA3', pulse: 'stampPulsePurple' },
}

function StampNode({ stage }: { stage: StampStage }) {
  const hue = STAGE_HUE[stage.char] ?? STAGE_HUE['承']
  const base: React.CSSProperties = {
    boxSizing: 'border-box',
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 15,
  }
  let style: React.CSSProperties
  let labelColor = 'var(--muted)'

  switch (stage.state) {
    case 'done':
      style = { ...base, background: 'var(--seal)', color: '#fff' }
      labelColor = 'var(--steel)'
      break
    case 'current':
      style = {
        ...base,
        background: '#fff',
        border: `2px solid ${hue.color}`,
        color: hue.color,
        animation: `${hue.pulse} 2s ease-out infinite`,
      }
      labelColor = hue.color
      break
    case 'rejected':
      style = { ...base, background: '#fff', border: '2px solid #C13B34', color: '#C13B34' }
      labelColor = '#C13B34'
      break
    default:
      // 未蓋章的圈是灰的,但「等待中」三個字給關卡色 —— 灰字疊在虛線圈上會讀成停用
      style = { ...base, background: 'transparent', border: '2px dashed #C8CDD5', color: 'var(--muted)' }
      labelColor = hue.color
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 88 }}>
      <div style={style}>{stage.char}</div>
      <div style={{ fontSize: 12, color: labelColor, fontWeight: stage.state === 'current' ? 500 : undefined }}>
        {stage.label}
      </div>
      {stage.note && (
        <Tooltip mouseEnterDelay={0} title={stage.noteTitle && <span className="num" style={{ fontSize: 13 }}>{stage.noteTitle}</span>}>
          <div className="num" style={{ fontSize: 11, color: 'var(--steel)', cursor: stage.noteTitle ? 'help' : undefined }}>
            {stage.note}
          </div>
        </Tooltip>
      )}
    </div>
  )
}

interface StampTrailProps {
  stages: StampStage[]
  width?: number
}

export default function StampTrail({ stages, width = 400 }: StampTrailProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width, maxWidth: '100%' }}>
      {stages.map((stage, i) => (
        <div key={stage.char} style={{ display: 'contents' }}>
          {i > 0 && (
            <div
              style={{
                flex: 1,
                marginTop: 15,
                borderTop: stages[i - 1].state === 'done' ? 'none' : '2px dashed #C8CDD5',
                height: stages[i - 1].state === 'done' ? 2 : 0,
                background: stages[i - 1].state === 'done' ? 'var(--ink)' : undefined,
              }}
            />
          )}
          <StampNode stage={stage} />
        </div>
      ))}
    </div>
  )
}
