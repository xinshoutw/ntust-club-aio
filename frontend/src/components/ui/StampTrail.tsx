export type StampState = 'done' | 'current' | 'todo' | 'rejected'

export interface StampStage {
  char: string
  label: string
  state: StampState
  note?: string
}

// 關卡色相與 pill 一致(輔=琥珀、組=藍、長=紫)
const STAGE_HUE: Record<string, { color: string; pulse: string }> = {
  輔: { color: '#8A5A00', pulse: 'stampPulseAmber' },
  組: { color: '#1D5A9E', pulse: 'stampPulseBlue' },
  長: { color: '#6B4FA3', pulse: 'stampPulsePurple' },
}

function StampNode({ stage }: { stage: StampStage }) {
  const hue = STAGE_HUE[stage.char] ?? STAGE_HUE['輔']
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
      style = { ...base, background: 'transparent', border: '2px dashed #C8CDD5', color: 'var(--muted)' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 88 }}>
      <div style={style}>{stage.char}</div>
      <div style={{ fontSize: 12, color: labelColor, fontWeight: stage.state === 'current' ? 500 : undefined }}>
        {stage.label}
      </div>
      {stage.note && <div style={{ fontSize: 11, color: 'var(--steel)' }}>{stage.note}</div>}
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
        <div key={stage.label} style={{ display: 'contents' }}>
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
