import { LockOutlined } from '@ant-design/icons'
import { STATUS, type StatusKey } from '../../lib/status'

interface StatusPillProps {
  status: StatusKey
}

export default function StatusPill({ status }: StatusPillProps) {
  const s = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: s.bg,
        color: s.fg,
        border: s.border ? `1px solid ${s.border}` : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {s.withLock && <LockOutlined style={{ fontSize: 12 }} />}
      {s.label}
    </span>
  )
}
