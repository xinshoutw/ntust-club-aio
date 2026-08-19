// 停權狀態:社團在自己的頁面就要看得到(借用四頁與管理項目共用),
// 而不是把時段選完、送出撞 403 CLUB_SUSPENDED 才知道
import { Tooltip } from 'antd'
import { useClubSuspension } from '../../api/clubProfile'
import StatusPill from './StatusPill'

/** 頁首停權標示(PageHeader 的 sub);未停權時不顯示 */
export default function SuspensionNote() {
  const { suspended, until, reason, failed } = useClubSuspension()
  // 查詢失敗時 suspended 是「不知道」而非「沒停權」:什麼都不說的話,
  // 被停權的社團會看到一張完全正常的表單,填完送出才撞 403(正是本元件要避免的事)
  if (failed) {
    return (
      <span style={{ color: '#C13B34' }}>無法確認停權狀態，若送出後被拒請重新整理頁面</span>
    )
  }
  if (!suspended) return null
  return (
    <Tooltip title={reason || undefined}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <StatusPill status="suspended" />
        停權至 {until}，暫停借用申請
      </span>
    </Tooltip>
  )
}
