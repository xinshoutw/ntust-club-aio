// 停權狀態:社團在自己的頁面就要看得到(借用四頁與管理項目共用),
// 而不是把時段選完、送出撞 403 CLUB_SUSPENDED 才知道
import { Tooltip } from 'antd'
import { useClubSuspension } from '../../api/clubProfile'
import StatusPill from '../../components/ui/StatusPill'

/** 頁首停權標示(PageHeader 的 sub);未停權時不顯示 */
export default function SuspensionNote() {
  const { suspended, until, reason } = useClubSuspension()
  if (!suspended) return null
  return (
    <Tooltip title={reason || undefined}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <StatusPill status="suspended" />
        停權至 {until},暫停借用申請
      </span>
    </Tooltip>
  )
}
