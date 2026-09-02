import { Dropdown, type MenuProps } from 'antd'
import { EllipsisOutlined } from '@ant-design/icons'

// 活動彈窗標題列右側的「…」選單(緊鄰關閉鈕左側):下載與刪除都在裡面。
// 活動詳情、申請審核、結案審核三支彈窗共用同一顆鈕,選項各自傳入
export default function DownloadMenu({ items, onClick }: {
  items: MenuProps['items']
  onClick: (info: { key: string }) => void
}) {
  return (
    <Dropdown trigger={['click']} menu={{ items, onClick }}>
      <button
        type="button"
        className="link-btn"
        aria-label="更多操作"
        style={{ padding: 0, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <EllipsisOutlined style={{ fontSize: 18, color: 'var(--steel)' }} />
      </button>
    </Dropdown>
  )
}
