import { useState } from 'react'
import { App } from 'antd'
import { countText } from '../../lib/counts'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import StatusPill from '../../components/ui/StatusPill'
import AttachmentLinks from '../../components/ui/AttachmentLinks'
import AttachmentRetryModal from '../applications/AttachmentRetryModal'
import { Cols, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { EVIDENCE_ACCEPT, makeValidateEvidence } from '../../lib/uploads'
import { PartialUploadError } from '../../api/applications'
import {
  MAX_VIOLATION_ATTACHMENTS,
  STAFF_PAGE_SIZE,
  useStaffConfig,
  useStaffMutations,
  useStaffViolations,
  type StaffViolation,
} from '../../api/staff'

// 排序鍵=後端 /staff/violations 白名單(社團欄不在白名單,不開排序)
type SortKey = 'date' | 'location' | 'items' | 'filler' | 'deadline' | 'status'

// 違規紀錄查詢:伺服器分頁列表;銷案動作屬行政端。唯一寫入是未銷案單的「補傳附件」——
// 開立時附件那一步失敗的單從這裡補,不必再開一張(每張都扣行政分)。
// 預設排序=後端(未銷案在前、組內發生日升冪,與行政端違規管理一致);點欄名多欄排序(伺服器端)
export default function PtViolationsPage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const { entries, toggle } = useMultiSort<SortKey>()
  const listQuery = useStaffViolations(page, sortParam(entries))
  const rows = listQuery.data?.violations ?? []
  const total = listQuery.data?.total ?? 0
  const configQuery = useStaffConfig()
  const { addAttachments } = useStaffMutations()
  // 補傳目標:每次 render 由現行清單回查,補完後份數才會更新
  const [retryId, setRetryId] = useState<number | null>(null)
  const retryRow: StaffViolation | undefined = rows.find((v) => v.id === retryId)

  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1)
  }

  return (
    <div>
      <PageHeader
        title="違規紀錄查詢"
        sub={
          <>
            共 <span className="num">{countText(total, listQuery)}</span> 筆
          </>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb dense fixed" style={{ minWidth: 840 }}>
            <Cols widths={[100, '18%', '13%', 'auto', 90, 104, 84, 88]} />
            <thead>
              <tr>
                <th scope="col">
                  <MultiSortButton label="發生日" sortKey="date" entries={entries} onToggle={toggleSort} />
                </th>
                <th scope="col">社團</th>
                <th scope="col">
                  <MultiSortButton label="地點" sortKey="location" entries={entries} onToggle={toggleSort} />
                </th>
                <th scope="col">
                  <MultiSortButton label="違規項目" sortKey="items" entries={entries} onToggle={toggleSort} />
                </th>
                <th scope="col">
                  <MultiSortButton label="填寫人" sortKey="filler" entries={entries} onToggle={toggleSort} />
                </th>
                <th scope="col">
                  <MultiSortButton label="銷案期限" sortKey="deadline" entries={entries} onToggle={toggleSort} />
                </th>
                <th scope="col">
                  <MultiSortButton label="狀態" sortKey="status" entries={entries} onToggle={toggleSort} />
                </th>
                <th scope="col">附件</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="num" style={{ fontSize: 13 }}>{v.date}</td>
                  <td className="cell-clip" title={v.club}>{v.club}</td>
                  <td className="cell-clip" title={v.location} style={{ fontSize: 13 }}>{v.location}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{v.items.join('、')}</div>
                    {v.other && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{v.other}</div>}
                    <AttachmentLinks files={v.attachments} />
                  </td>
                  <td className="cell-clip" title={v.filler} style={{ fontSize: 13 }}>{v.filler}</td>
                  <td className="num" style={{ fontSize: 13 }}>{v.deadline}</td>
                  <td><StatusPill status={v.status} /></td>
                  <td style={{ fontSize: 13 }}>
                    {/* 已銷案不收附件(後端 422);滿 5 檔也不再給入口。附件是選填,0 檔不標紅 ——
                        刻意沒附的單和上傳失敗的單在這裡分不出來,整頁紅字只會讓紅色失去意義。
                        上限組態沒載到就先停用:彈窗開不了,點了沒反應比停用更糟 */}
                    {v.status === 'violation_open' && v.attachments.length < MAX_VIOLATION_ATTACHMENTS ? (
                      <button
                        type="button"
                        className="link-btn"
                        style={{ padding: 0 }}
                        disabled={!configQuery.data}
                        onClick={() => setRetryId(v.id)}
                      >
                        補傳
                      </button>
                    ) : (
                      <span className="num" style={{ color: 'var(--steel)' }}>{v.attachments.length} 個</span>
                    )}
                  </td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={8}>
                    <QueryError
                      compact
                      title="違規紀錄載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!listQuery.isPending && !listQuery.isError && rows.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無違規紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={page} pageSize={STAFF_PAGE_SIZE} total={total} onChange={setPage} />
      </div>

      {/* 上限以後端組態為權威,不放 fallback 常數;組態沒載到時上面的「補傳」是停用的 */}
      {configQuery.data && (
        <AttachmentRetryModal
          open={retryRow != null}
          title="補傳現場照片 / 影片"
          accept={EVIDENCE_ACCEPT}
          hint="拖放圖片或影片檔案"
          validate={makeValidateEvidence(configQuery.data.imgBytes, configQuery.data.videoBytes)}
          maxCount={MAX_VIOLATION_ATTACHMENTS - (retryRow?.attachments.length ?? 0)}
          uploading={addAttachments.isPending}
          onUpload={async (files) => {
            try {
              await addAttachments.mutateAsync({ id: retryId as number, files })
              message.success('附件已補傳')
            } catch (e) {
              // 逐檔上傳:中途失敗時前面幾檔已經上去了,錯誤訊息要說清楚剩下哪些沒傳
              const done = e instanceof PartialUploadError ? e.already.length : 0
              const detail = e instanceof Error ? e.message : '上傳失敗'
              message.error(done ? `已成功上傳 ${done} 個檔案，其餘失敗:${detail}` : detail)
              throw e
            }
          }}
          onClose={() => setRetryId(null)}
        />
      )}
    </div>
  )
}
