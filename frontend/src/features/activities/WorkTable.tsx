import { taskAlignEm, type WorkItem } from './types'

/**
 * 工作分配:一行一列的「項目 / 負責人」。社團端詳情與行政端審核共用同一份。
 *
 * 項目欄的對齊寬度交給 taskAlignEm(離群的長句不參與對齊);
 * 舊系統的項目是「職稱:工作內容」,原樣留在項目欄 —— 拆開會猜錯。
 */
export default function WorkTable({ works }: { works: readonly WorkItem[] }) {
  const align = taskAlignEm(works.map((w) => w.task))
  return (
    <div>
      {works.map((w, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 16,
            padding: '4px 0',
            borderTop: i ? '1px solid var(--line)' : undefined,
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: 'var(--steel)', minWidth: `${align}em` }}>{w.task || '—'}</span>
          <span style={{ flex: 1 }}>{w.owner || '—'}</span>
        </div>
      ))}
    </div>
  )
}
