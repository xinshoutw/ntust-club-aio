import { useState } from 'react'
import { App, Select, Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { confirmDialog } from '../../lib/confirm'
import {
  LARGE_PAGE_SIZE,
  fileDownloadUrl,
  useDeleteFile,
  useFileUsage,
  useLargeFiles,
  useRepairFiles,
  type ModuleKey,
  type StoredFile,
} from '../../api/adminFiles'

// 儲存模組分類色(已通過 dataviz 六項檢查:lightness/chroma/CVD/contrast,light surface)
const MODULE_COLORS: Record<ModuleKey, string> = {
  close: '#3D74BF',
  eval: '#1F8A55',
  apply: '#A9721B',
  apps: '#7B5FA8',
  repair: '#B04A33',
}
// 表單等文字內容存於 DB:整個資料庫算一類納入佔用空間(後端以 pg_database_size 估)
const DB_TEXT = { label: '文字內容', color: '#4E7D8C' }

const fmtSize = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
const pct = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')

function DownloadButton({ file, message }: { file: StoredFile; message: ReturnType<typeof App.useApp>['message'] }) {
  if (file.archived) {
    return (
      <Tooltip title="已歸檔:檔案已由行政備份後離線保存">
        <span style={{ color: 'var(--muted)', padding: '0 7px' }}>
          <DownloadOutlined />
        </span>
      </Tooltip>
    )
  }
  return (
    <button
      type="button"
      className="link-btn"
      aria-label={`下載 ${file.name}`}
      onClick={() => {
        window.open(fileDownloadUrl(file.id), '_blank')
        message.success(`已開始下載「${file.name}」`)
      }}
    >
      <DownloadOutlined />
    </button>
  )
}

export default function AdminFilesPage() {
  const { message, modal } = App.useApp()
  const [moduleFilter, setModuleFilter] = useState<Exclude<ModuleKey, 'repair'> | 'all'>('all')
  // 頁面目的=清大檔:預設 -size 為後端預設,不點排序時不帶 sort(伺服器端白名單 size/created_at)
  const { entries: largeSortEntries, toggle: toggleLargeSort } = useMultiSort<'size' | 'created_at'>()

  const usageQuery = useFileUsage()
  const [repairPage, setRepairPage] = useState(1)
  const repairQuery = useRepairFiles(repairPage)
  const [largePage, setLargePage] = useState(1)
  // 換排序等於換一份清單:與頁碼同一次更新,才不會先送出一次「新排序 + 舊頁碼」
  const toggleLargeSortAndReset = (key: 'size' | 'created_at') => {
    toggleLargeSort(key)
    setLargePage(1)
  }
  const largeQuery = useLargeFiles(moduleFilter, sortParam(largeSortEntries), largePage)
  const deleteFile = useDeleteFile()

  const usage = usageQuery.data
  const repairFiles = repairQuery.data?.rows ?? []
  const repairTotal = repairQuery.data?.total ?? 0
  const largeList = largeQuery.data?.rows ?? []
  const largeTotal = largeQuery.data?.total ?? 0

  // 模組順序由 API 決定(有報修檔案時 repair 排第一);報修歸零時整段自比例條與圖例移除
  const modules = (usage?.modules ?? []).filter((m) => m.key !== 'repair' || m.count > 0)
  const usedMb = usage?.totalMb ?? 0
  // 實際磁碟總量/可用空間;磁碟還有 OS 與其他程式的佔用,
  // 比例條以「其他佔用」段呈現(diskTotal − diskFree − 系統自身)
  const diskTotalMb = usage?.diskTotalMb ?? 0
  const diskFreeMb = usage?.diskFreeMb ?? 0
  const otherUsedMb = Math.max(0, diskTotalMb - diskFreeMb - usedMb)
  const totalCount = (usage?.modules ?? []).reduce((s, m) => s + m.count, 0)
  const repairUsage = usage?.modules.find((m) => m.key === 'repair')
  const otherModules = (usage?.modules ?? []).filter((m) => m.key !== 'repair')

  // 報修檔案可直接刪除(影音佔用大、迭代快);其餘模組依歸檔政策由系統管理
  const askDelete = (f: StoredFile) => {
    confirmDialog(modal, {
      title: '刪除檔案',
      content: `將永久刪除「${f.name}」（${fmtSize(f.sizeMb)}）無法復原`,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        deleteFile.mutate(f.id, {
          onSuccess: () => {
            message.success(`已刪除「${f.name}」(${fmtSize(f.sizeMb)})`)
            // 刪掉的是本頁最後一列時退回前一頁,不要停在空白頁
            if (repairFiles.length === 1 && repairPage > 1) setRepairPage(repairPage - 1)
          },
          onError: (e) => message.error(e.message),
        })
      },
    })
  }

  return (
    <div>
      <PageHeader
        title="檔案管理"
        sub={
          // usage 查詢失敗時不顯示「共 0 個檔案」誤導字樣(主體已呈現錯誤與重試)
          !usageQuery.isError && (
            <>
              共 <span className="num">{totalCount.toLocaleString()}</span> 個檔案
            </>
          )
        }
      />

      {/* 空間利用:數字 + 依模組分段的比例條(hover 顯示明細);查詢失敗顯示錯誤而非 0/— 彙總 */}
      <LoadingBlock pending={usageQuery.isPending}>
        {usageQuery.isError ? (
          <div style={{ marginTop: 20 }}>
            <QueryError
              title="空間使用資訊載入失敗"
              error={usageQuery.error}
              onRetry={() => usageQuery.refetch()}
            />
          </div>
        ) : (
        <div className="card" style={{ marginTop: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>系統佔用</div>
              <div style={{ lineHeight: 1.15, marginTop: 2 }}>
                <span className="num" style={{ fontSize: 30, fontWeight: 600 }}>{fmtSize(usedMb)}</span>
                <span className="num" style={{ fontSize: 14, color: 'var(--steel)' }}> / 磁碟 {usage ? fmtSize(diskTotalMb) : '—'}({pct(usedMb, diskTotalMb)})</span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>磁碟可用空間</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{usage ? fmtSize(diskFreeMb) : '—'}</div>
            </div>
          </div>

          {/* 整條=磁碟總量:系統各模組 + DB + 其他佔用(OS/同機程式)+ 可用,比例才對得上 */}
          <div style={{ display: 'flex', gap: 2, marginTop: 16, height: 20, borderRadius: 4, overflow: 'hidden' }}>
            {modules
              .filter((m) => m.sizeMb > 0)
              .map((m) => (
                <Tooltip
                  key={m.key}
                  title={
                    <span style={{ fontSize: 13 }}>
                      {m.label} · {fmtSize(m.sizeMb)}({pct(m.sizeMb, diskTotalMb)})· {m.count.toLocaleString()} 個檔案
                    </span>
                  }
                >
                  <div
                    role="img"
                    aria-label={`${m.label} ${fmtSize(m.sizeMb)}`}
                    style={{ width: `${diskTotalMb > 0 ? (m.sizeMb / diskTotalMb) * 100 : 0}%`, background: MODULE_COLORS[m.key], minWidth: 6 }}
                  />
                </Tooltip>
              ))}
            {usage && (
              <Tooltip
                title={
                  <span style={{ fontSize: 13 }}>
                    {DB_TEXT.label}(表單等資料庫內容)· {fmtSize(usage.dbSizeMb)}({pct(usage.dbSizeMb, diskTotalMb)})
                  </span>
                }
              >
                <div
                  role="img"
                  aria-label={`${DB_TEXT.label} ${fmtSize(usage.dbSizeMb)}`}
                  style={{ width: `${diskTotalMb > 0 ? (usage.dbSizeMb / diskTotalMb) * 100 : 0}%`, background: DB_TEXT.color, minWidth: 6 }}
                />
              </Tooltip>
            )}
            {usage && otherUsedMb > 0 && (
              <Tooltip
                title={
                  <span style={{ fontSize: 13 }}>
                    其他佔用(作業系統與同機程式)· {fmtSize(otherUsedMb)}({pct(otherUsedMb, diskTotalMb)})
                  </span>
                }
              >
                <div
                  role="img"
                  aria-label={`其他佔用 ${fmtSize(otherUsedMb)}`}
                  style={{ width: `${diskTotalMb > 0 ? (otherUsedMb / diskTotalMb) * 100 : 0}%`, background: '#C9CDD6', minWidth: 6 }}
                />
              </Tooltip>
            )}
            <div role="img" aria-label={`可用 ${fmtSize(diskFreeMb)}`} style={{ flex: 1, background: '#EEF0F3' }} />
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            {modules.map((m) => (
              <span key={m.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: MODULE_COLORS[m.key] }} />
                {m.label}
                <span className="num">{fmtSize(m.sizeMb)}</span>
              </span>
            ))}
            {usage && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: DB_TEXT.color }} />
                {DB_TEXT.label}
                <span className="num">{fmtSize(usage.dbSizeMb)}</span>
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#EEF0F3', border: '1px solid rgba(31,36,48,.12)' }} />
              可用
            </span>
          </div>
        </div>
        )}
      </LoadingBlock>

      {/* 空間報修:檔案大且迭代最快,可直接刪除;歸零時整個 section 消失(查詢失敗時顯示錯誤,不可誤判為無報修檔案) */}
      {repairQuery.isError ? (
        <div style={{ marginTop: 16 }}>
          <QueryError
            title="報修檔案載入失敗"
            error={repairQuery.error}
            onRetry={() => repairQuery.refetch()}
          />
        </div>
      ) : repairTotal > 0 && (
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 8px', flexWrap: 'wrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: MODULE_COLORS.repair }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>空間報修</div>
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>檔案大、迭代快,可直接刪除釋放空間</div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>
              共 <span className="num">{repairTotal}</span> 個
              {/* 佔用只認 usage 的權威值:分頁後這一頁的加總不是總量,已歸檔者也不佔空間 */}
              {repairUsage && <> · <span className="num">{fmtSize(repairUsage.sizeMb)}</span></>}
            </span>
          </div>
          <table className="tb fixed" style={{ minWidth: 680 }}>
            {/* 檔名吃剩餘寬並截斷;社團截斷;大小/日期/狀態/動作固定 px */}
            <Cols widths={['auto', '16%', 90, 110, 80, 96]} />
            <thead>
              <tr>
                <th scope="col">檔名</th>
                <th scope="col">社團</th>
                <th scope="col" className="r">大小</th>
                <th scope="col">上傳日期</th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {repairFiles.map((f) => (
                <tr key={f.id}>
                  <td className="cell-clip" title={f.name} style={{ fontWeight: 500 }}>{f.name}</td>
                  <td className="cell-clip" title={f.club} style={{ fontSize: 13, color: 'var(--steel)' }}>{f.club}</td>
                  <td className="r num" style={{ fontSize: 13 }}>{fmtSize(f.sizeMb)}</td>
                  <td className="num" style={{ fontSize: 13 }}>{f.date}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{f.archived ? '已歸檔' : '使用中'}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <DownloadButton file={f} message={message} />
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={`刪除 ${f.name}`}
                      onClick={() => askDelete(f)}
                    >
                      <DeleteOutlined />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={repairPage} pageSize={LARGE_PAGE_SIZE} total={repairTotal} onChange={setRepairPage} />
        </div>
      )}

      {/* 大型檔案:不含報修(報修有專屬區);依歸檔政策由系統管理,不提供刪除 */}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 8px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>大型檔案</div>
          <div style={{ flex: 1 }} />
          <Select
            size="small"
            value={moduleFilter}
            onChange={(v) => {
              setModuleFilter(v)
              setLargePage(1)
            }}
            style={{ minWidth: 140 }}
            options={[
              { value: 'all', label: '全部模組' },
              ...otherModules.map((m) => ({ value: m.key as Exclude<ModuleKey, 'repair'>, label: m.label })),
            ]}
          />
        </div>
        <LoadingBlock pending={largeQuery.isPending}>
          <table className="tb fixed" style={{ minWidth: 760 }}>
            {/* 檔名吃剩餘寬並截斷;社團截斷;模組/大小/日期/狀態/動作固定 px */}
            <Cols widths={['auto', 110, '14%', 96, 120, 80, 96]} />
            <thead>
              <tr>
                <th scope="col">檔名</th>
                <th scope="col">模組</th>
                <th scope="col">社團</th>
                <th scope="col" className="r">
                  <MultiSortButton label="大小" sortKey="size" entries={largeSortEntries} onToggle={toggleLargeSortAndReset} />
                </th>
                <th scope="col">
                  <MultiSortButton label="上傳日期" sortKey="created_at" entries={largeSortEntries} onToggle={toggleLargeSortAndReset} />
                </th>
                <th scope="col">狀態</th>
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {largeList.map((f) => (
                <tr key={f.id}>
                  <td className="cell-clip" title={f.name} style={{ fontWeight: 500 }}>{f.name}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: MODULE_COLORS[f.module] }} />
                      {usage?.modules.find((m) => m.key === f.module)?.label ?? f.module}
                    </span>
                  </td>
                  <td className="cell-clip" title={f.club} style={{ fontSize: 13, color: 'var(--steel)' }}>{f.club}</td>
                  <td className="r num" style={{ fontSize: 13 }}>{fmtSize(f.sizeMb)}</td>
                  <td className="num" style={{ fontSize: 13 }}>{f.date}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{f.archived ? '已歸檔' : '使用中'}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <DownloadButton file={f} message={message} />
                    <Tooltip title="競賽採計與流程檔案依歸檔政策由系統管理">
                      <span style={{ color: 'var(--muted)', padding: '0 7px' }}>
                        <DeleteOutlined />
                      </span>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {largeQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={7}>
                    <QueryError
                      compact
                      title="大型檔案載入失敗"
                      error={largeQuery.error}
                      onRetry={() => largeQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {!largeQuery.isPending && !largeQuery.isError && largeList.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 24 }}>
                    此模組尚無大型檔案
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
          <Pager page={largePage} pageSize={LARGE_PAGE_SIZE} total={largeTotal} onChange={setLargePage} />
      </div>
    </div>
  )
}
