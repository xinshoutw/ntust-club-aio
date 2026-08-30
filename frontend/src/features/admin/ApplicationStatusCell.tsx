// 幹部證明與郵局帳戶異動兩頁共用的狀態下拉(decisions.md D-11 拆頁後仍是同一組狀態機)。
import { App, Select } from 'antd'
import StatusPill from '../../components/ui/StatusPill'
import {
  ALLOWED_NEXT,
  useApplicationStatusMutation,
  type ApplicationKind,
  type ApplicationStatus,
} from '../../api/adminApplications'

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: '審核中',
  processing: '處理中',
  completed: '已完成',
}

// 狀態機只能往前、但可跳過處理中(D-25):下拉開放的是往前走得到的那幾個
export function StatusCell({
  kind,
  id,
  status,
  name,
}: {
  kind: ApplicationKind
  id: number
  status: ApplicationStatus
  name: string
}) {
  const { message } = App.useApp()
  const updateStatus = useApplicationStatusMutation()
  if (status === 'completed') return <StatusPill status="completed" />
  return (
    <Select<ApplicationStatus>
      size="small"
      value={status}
      style={{ width: 120 }}
      disabled={updateStatus.isPending}
      onChange={(v) =>
        updateStatus.mutate(
          { kind, id, status: v },
          {
            onSuccess: () => message.success(`${name} 狀態已更新為「${STATUS_LABELS[v]}」`),
            onError: (e) => message.error(e.message),
          },
        )
      }
      options={(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
        disabled: s !== status && !ALLOWED_NEXT[status]?.includes(s),
      }))}
    />
  )
}
