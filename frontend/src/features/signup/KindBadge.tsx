import { SIGNUP_KIND_BADGE, type SignupKind } from './types'

// 幹訓/社團負責人會議的類型標記(普通活動不顯示)
export default function KindBadge({ kind }: { kind: SignupKind }) {
  if (kind === 'normal') return null
  const b = SIGNUP_KIND_BADGE[kind]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: b.bg,
        color: b.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {b.label}
    </span>
  )
}
