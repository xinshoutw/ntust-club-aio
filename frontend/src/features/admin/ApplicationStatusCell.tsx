// 幹部證明與郵局帳戶異動兩頁共用的狀態下拉(decisions.md D-11 拆頁後仍是同一組狀態機,
// 只差幹部證明多一個終態「已駁回」,D-37)。
import { App, Select } from 'antd'
import StatusPill from '../../components/ui/StatusPill'
import { confirmDialog } from '../../lib/confirm'
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
  declined: '已駁回',
}

const TERMINAL: readonly ApplicationStatus[] = ['completed', 'declined']

// 狀態機只能往前、但可跳過處理中(D-25):下拉開放的是往前走得到的那幾個。
// 「已駁回」是幹部證明專用的終態(D-37),郵局那頁連選項都不列
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
  const { message, modal } = App.useApp()
  const updateStatus = useApplicationStatusMutation()
  const next = ALLOWED_NEXT[kind]
  if (TERMINAL.includes(status)) return <StatusPill status={status} />

  const submit = (v: ApplicationStatus) =>
    updateStatus.mutate(
      { kind, id, status: v },
      {
        onSuccess: () => message.success(`${name} 狀態已更新為「${STATUS_LABELS[v]}」`),
        onError: (e) => message.error(e.message),
      },
    )

  // 「已完成」誤按只是補做一份證明,「已駁回」誤按會當場推一則駁回通知給社團
  // 且系統內回不去 —— 損害不對稱,只有這個選項多問一次
  const change = (v: ApplicationStatus) => {
    if (v !== 'declined') return submit(v)
    confirmDialog(modal, {
      title: `駁回 ${name} 的幹部證明`,
      content: '駁回後不可復原,社團會收到通知。駁回原因請另行告知社團。',
      okText: '確認駁回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => submit(v),
    })
  }

  return (
    <Select<ApplicationStatus>
      size="small"
      value={status}
      style={{ width: 120 }}
      disabled={updateStatus.isPending}
      onChange={change}
      options={(Object.keys(STATUS_LABELS) as ApplicationStatus[])
        .filter((s) => s !== 'declined' || kind === 'cert')
        .map((s) => ({
          value: s,
          label: STATUS_LABELS[s],
          disabled: s !== status && !next[status]?.includes(s),
        }))}
    />
  )
}
