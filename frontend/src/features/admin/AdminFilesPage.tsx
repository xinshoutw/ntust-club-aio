import { useState } from 'react'
import { App, Select, Spin, Tooltip } from 'antd'
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { confirmDialog } from '../../lib/confirm'
import {
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

// 磁碟容量上限(部署主機規格,非後端資料;調整部署時同步改這裡)
const CAPACITY_MB = 50 * 1024

const fmtSize = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
const pct = (n: number, d: number): string => `${Math.round((n / d) * 100)}%`

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

  const usageQuery = useFileUsage()
  const repairQuery = useRepairFiles()
  const largeQuery = useLargeFiles(moduleFilter)
  const deleteFile = useDeleteFile()

  const usage = usageQuery.data
  const repairFiles = repairQuery.data ?? []
  const largeList = largeQuery.data ?? []

  // 模組順序由 API 決定(有報修檔案時 repair 排第一);報修歸零時整段自比例條與圖例移除
  const modules = (usage?.modules ?? []).filter((m) => m.key !== 'repair' || m.count > 0)
  const usedMb = usage?.totalMb ?? 0
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
          onSuccess: () => message.success(`已刪除「${f.name}」(${fmtSize(f.sizeMb)})`),
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
          <>
            共 <span className="num">{totalCount.toLocaleString()}</span> 個檔案
          </>
        }
      />

      {/* 空間利用:數字 + 依模組分段的比例條(hover 顯示明細) */}
      <Spin spinning={usageQuery.isPending}>
        <div className="card" style={{ marginTop: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>已用空間</div>
              <div style={{ lineHeight: 1.15, marginTop: 2 }}>
                <span className="num" style={{ fontSize: 30, fontWeight: 600 }}>{fmtSize(usedMb)}</span>
                <span className="num" style={{ fontSize: 14, color: 'var(--steel)' }}> / {fmtSize(CAPACITY_MB)}({pct(usedMb, CAPACITY_MB)})</span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>可用空間</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{fmtSize(CAPACITY_MB - usedMb)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 2, marginTop: 16, height: 20, borderRadius: 4, overflow: 'hidden' }}>
            {modules
              .filter((m) => m.sizeMb > 0)
              .map((m) => (
                <Tooltip
                  key={m.key}
                  title={
                    <span style={{ fontSize: 13 }}>
                      {m.label} · {fmtSize(m.sizeMb)}({pct(m.sizeMb, CAPACITY_MB)})· {m.count.toLocaleString()} 個檔案
                    </span>
                  }
                >
                  <div
                    role="img"
                    aria-label={`${m.label} ${fmtSize(m.sizeMb)}`}
                    style={{ width: `${(m.sizeMb / CAPACITY_MB) * 100}%`, background: MODULE_COLORS[m.key], minWidth: 6 }}
                  />
                </Tooltip>
              ))}
            {usage && (
              <Tooltip
                title={
                  <span style={{ fontSize: 13 }}>
                    {DB_TEXT.label}(表單等資料庫內容)· {fmtSize(usage.dbSizeMb)}({pct(usage.dbSizeMb, CAPACITY_MB)})
                  </span>
                }
              >
                <div
                  role="img"
                  aria-label={`${DB_TEXT.label} ${fmtSize(usage.dbSizeMb)}`}
                  style={{ width: `${(usage.dbSizeMb / CAPACITY_MB) * 100}%`, background: DB_TEXT.color, minWidth: 6 }}
                />
              </Tooltip>
            )}
            <div role="img" aria-label={`可用 ${fmtSize(CAPACITY_MB - usedMb)}`} style={{ flex: 1, background: '#EEF0F3' }} />
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
      </Spin>

      {/* 空間報修:檔案大且迭代最快,全數列出、可直接刪除;歸零時整個 section 消失 */}
      {repairFiles.length > 0 && (
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 8px', flexWrap: 'wrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: MODULE_COLORS.repair }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>空間報修</div>
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>檔案大、迭代快,可直接刪除釋放空間</div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>
              共 <span className="num">{repairFiles.length}</span> 個 ·{' '}
              <span className="num">{fmtSize(repairUsage?.sizeMb ?? repairFiles.reduce((s, f) => s + f.sizeMb, 0))}</span>
            </span>
          </div>
          <table className="tb" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>檔名</th>
                <th>社團</th>
                <th className="r">大小</th>
                <th>上傳日期</th>
                <th>狀態</th>
                <th className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {repairFiles.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 500 }}>{f.name}</td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{f.club}</td>
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
            onChange={setModuleFilter}
            style={{ minWidth: 140 }}
            options={[
              { value: 'all', label: '全部模組' },
              ...otherModules.map((m) => ({ value: m.key as Exclude<ModuleKey, 'repair'>, label: m.label })),
            ]}
          />
        </div>
        <Spin spinning={largeQuery.isPending}>
          <table className="tb" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>檔名</th>
                <th>模組</th>
                <th>社團</th>
                <th className="r">大小</th>
                <th>上傳日期</th>
                <th>狀態</th>
                <th className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {largeList.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 500 }}>{f.name}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: MODULE_COLORS[f.module] }} />
                      {usage?.modules.find((m) => m.key === f.module)?.label ?? f.module}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--steel)' }}>{f.club}</td>
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
              {!largeQuery.isPending && largeList.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 24 }}>
                    此模組尚無大型檔案
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Spin>
      </div>
    </div>
  )
}
