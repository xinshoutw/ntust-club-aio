import { Tooltip } from 'antd'

interface LargeBadgeProps {
  applied?: boolean // 社團申請大型活動
  approved?: boolean // undefined=未處理;true=已認可;false=已否准
}

// 大型活動徽章(類型欄一律顯示「活動」,以徽章表達大型狀態):
// 實心=已認可(含未申請但由管理員核定);空心=申請待處理;空心+斜線=申請未通過
export default function LargeBadge({ applied, approved }: LargeBadgeProps) {
  if (approved !== true && !applied) return null

  const rejected = applied && approved === false
  const solid = approved === true
  const tip = solid
    ? '已認可為大型活動(行政分 ×3)'
    : rejected
      ? '大型活動申請未通過,以一般活動計'
      : '大型活動申請,待學務處認可'

  return (
    <Tooltip title={tip}>
      <span
        role="img"
        aria-label={tip}
        style={{
          marginLeft: 6,
          fontSize: 11,
          fontWeight: 500,
          color: solid ? '#fff' : rejected ? 'var(--muted)' : 'var(--seal)',
          background: solid ? 'var(--seal)' : 'transparent',
          border: `1px solid ${rejected ? 'var(--muted)' : 'var(--seal)'}`,
          borderRadius: 4,
          padding: '0 4px',
          position: 'relative',
          display: 'inline-block',
          lineHeight: '17px',
          overflow: 'hidden',
        }}
      >
        大
        {rejected && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: -3,
              right: -3,
              top: '50%',
              height: 1.5,
              background: '#C13B34',
              transform: 'rotate(-24deg)',
            }}
          />
        )}
      </span>
    </Tooltip>
  )
}
