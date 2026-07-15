import { useState } from 'react'
import { App, Modal, Select, Tooltip } from 'antd'
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'

// 儲存模組與分類色(已通過 dataviz 六項檢查:lightness/chroma/CVD/contrast,light surface)
type ModuleKey = 'close' | 'eval' | 'apply' | 'apps' | 'repair'
const MODULES: Record<ModuleKey, { label: string; color: string }> = {
  close: { label: '活動結案', color: '#3D74BF' },
  eval: { label: '評鑑資料', color: '#1F8A55' },
  apply: { label: '活動申請附件', color: '#A9721B' },
  apps: { label: '線上申請', color: '#7B5FA8' },
  repair: { label: '空間報修', color: '#B04A33' },
}

// 表單等文字內容存於 DB:整個資料庫算一類納入佔用空間(接後端後以 pg_database_size 取得)
const DB_TEXT = { label: '文字內容', color: '#4E7D8C', sizeMb: 1.4 * 1024 }

// mock 彙總(接後端後由 API 取):MB
const CAPACITY_MB = 50 * 1024
const INITIAL_USAGE: Record<ModuleKey, { sizeMb: number; count: number }> = {
  close: { sizeMb: 6.2 * 1024, count: 1482 },
  eval: { sizeMb: 3.1 * 1024, count: 356 },
  apply: { sizeMb: 2.4 * 1024, count: 512 },
  apps: { sizeMb: 1.9 * 1024, count: 803 },
  repair: { sizeMb: 9.8 * 1024, count: 61 },
}

interface StoredFile {
  id: string
  name: string
  module: ModuleKey
  club: string
  sizeMb: number
  date: string
  archived?: boolean // 已歸檔=行政已備份,可自系統清理
}

// 單檔最大的前幾筆(清理空間的主要對象);報修影音為大宗
const LARGE_FILES: StoredFile[] = [
  { id: 'f1', name: 'S304 天花板漏水_現場影片.mp4', module: 'repair', club: '資工系學會', sizeMb: 186, date: '2026/06/16' },
  { id: 'f2', name: '練團室 隔音棉脫落_影片.mp4', module: 'repair', club: '熱音社', sizeMb: 142, date: '2026/05/28', archived: true },
  { id: 'f3', name: 'S207 窗戶卡死_影片.mov', module: 'repair', club: '美術社', sizeMb: 121, date: '2026/06/18' },
  { id: 'f4', name: '校際程式競賽_成果照片.zip', module: 'close', club: '資工系學會', sizeMb: 96, date: '2026/05/23' },
  { id: 'f5', name: '一宿 B2 燈具閃爍_影片.mp4', module: 'repair', club: '登山社', sizeMb: 88, date: '2026/04/30', archived: true },
  { id: 'f6', name: '迎新宿營_活動照片.zip', module: 'close', club: '資工系學會', sizeMb: 74, date: '2026/06/30' },
  { id: 'f7', name: '最佳社團獎_營運資料.pdf', module: 'eval', club: '電機系學會', sizeMb: 48, date: '2026/06/12' },
  { id: 'f8', name: '資訊週_企劃書.pdf', module: 'apply', club: '資工系學會', sizeMb: 32, date: '2026/07/05' },
  { id: 'f9', name: '社團博覽會_場地配置圖.pdf', module: 'apply', club: '學生會', sizeMb: 27, date: '2026/06/02' },
  { id: 'f10', name: '財務管理辦法_佐證.pdf', module: 'eval', club: '資工系學會', sizeMb: 21, date: '2026/06/02' },
  { id: 'f11', name: '新生迎新茶會_成果照片.zip', module: 'close', club: '資工系學會', sizeMb: 19, date: '2026/03/09', archived: true },
  { id: 'f12', name: '郵局帳戶異動_存簿影本.pdf', module: 'apps', club: '資工系學會', sizeMb: 4, date: '2026/06/12' },
]

const fmtSize = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
const pct = (n: number, d: number): string => `${Math.round((n / d) * 100)}%`

export default function AdminFilesPage() {
  const { message } = App.useApp()
  const [files, setFiles] = useState(LARGE_FILES)
  const [usage, setUsage] = useState(INITIAL_USAGE)
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | 'all'>('all')
  // 刪除確認:open/afterClose 常駐模式,關閉動畫期間內容不消失
  const [deleting, setDeleting] = useState<StoredFile | null>(null)
  const [delOpen, setDelOpen] = useState(false)

  const usedMb = Object.values(usage).reduce((s, u) => s + u.sizeMb, 0) + DB_TEXT.sizeMb
  const totalCount = Object.values(usage).reduce((s, u) => s + u.count, 0)
  const list = files.filter((f) => moduleFilter === 'all' || f.module === moduleFilter)

  // 段落順序:有空間報修檔案時報修排第一(檔案大、迭代快),其餘模組在後
  const moduleOrder: ModuleKey[] = usage.repair.count > 0
    ? ['repair', ...(Object.keys(MODULES) as ModuleKey[]).filter((k) => k !== 'repair')]
    : (Object.keys(MODULES) as ModuleKey[])

  const confirmDelete = () => {
    if (!deleting) return
    setFiles((fs) => fs.filter((f) => f.id !== deleting.id))
    // 已用空間與模組彙總同步扣減,刪檔立即反映於比例條
    setUsage((u) => ({
      ...u,
      [deleting.module]: {
        sizeMb: Math.max(0, u[deleting.module].sizeMb - deleting.sizeMb),
        count: Math.max(0, u[deleting.module].count - 1),
      },
    }))
    message.success(`已刪除「${deleting.name}」(${fmtSize(deleting.sizeMb)})`)
    setDelOpen(false)
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
          {moduleOrder.map((k) => (
            <Tooltip
              key={k}
              title={
                <span style={{ fontSize: 13 }}>
                  {MODULES[k].label} · {fmtSize(usage[k].sizeMb)}({pct(usage[k].sizeMb, CAPACITY_MB)})· {usage[k].count.toLocaleString()} 個檔案
                </span>
              }
            >
              <div
                role="img"
                aria-label={`${MODULES[k].label} ${fmtSize(usage[k].sizeMb)}`}
                style={{ width: `${(usage[k].sizeMb / CAPACITY_MB) * 100}%`, background: MODULES[k].color, minWidth: 6 }}
              />
            </Tooltip>
          ))}
          <Tooltip
            title={
              <span style={{ fontSize: 13 }}>
                {DB_TEXT.label}(表單等資料庫內容)· {fmtSize(DB_TEXT.sizeMb)}({pct(DB_TEXT.sizeMb, CAPACITY_MB)})
              </span>
            }
          >
            <div
              role="img"
              aria-label={`${DB_TEXT.label} ${fmtSize(DB_TEXT.sizeMb)}`}
              style={{ width: `${(DB_TEXT.sizeMb / CAPACITY_MB) * 100}%`, background: DB_TEXT.color, minWidth: 6 }}
            />
          </Tooltip>
          <div role="img" aria-label={`可用 ${fmtSize(CAPACITY_MB - usedMb)}`} style={{ flex: 1, background: '#EEF0F3' }} />
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          {moduleOrder.map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: MODULES[k].color }} />
              {MODULES[k].label}
              <span className="num">{fmtSize(usage[k].sizeMb)}</span>
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: DB_TEXT.color }} />
            {DB_TEXT.label}
            <span className="num">{fmtSize(DB_TEXT.sizeMb)}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: '#EEF0F3', border: '1px solid rgba(31,36,48,.12)' }} />
            可用
          </span>
        </div>
      </div>

      {/* 大型檔案:清理空間的主要對象;僅報修檔可刪(其餘依歸檔政策由系統管理) */}
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
              ...(Object.keys(MODULES) as ModuleKey[]).map((k) => ({ value: k, label: MODULES[k].label })),
            ]}
          />
        </div>
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
            {list.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 500 }}>{f.name}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: MODULES[f.module].color }} />
                    {MODULES[f.module].label}
                  </span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{f.club}</td>
                <td className="r num" style={{ fontSize: 13 }}>{fmtSize(f.sizeMb)}</td>
                <td className="num" style={{ fontSize: 13 }}>{f.date}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{f.archived ? '已歸檔' : '使用中'}</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="link-btn"
                    aria-label={`下載 ${f.name}`}
                    onClick={() => message.info(`下載「${f.name}」(接後端後啟用)`)}
                  >
                    <DownloadOutlined />
                  </button>
                  {f.module === 'repair' ? (
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={`刪除 ${f.name}`}
                      onClick={() => {
                        setDeleting(f)
                        setDelOpen(true)
                      }}
                    >
                      <DeleteOutlined />
                    </button>
                  ) : (
                    <Tooltip title="競賽採計與流程檔案依歸檔政策由系統管理">
                      <span style={{ color: 'var(--muted)', padding: '0 7px' }}>
                        <DeleteOutlined />
                      </span>
                    </Tooltip>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr className="no-hover">
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, padding: 24 }}>
                  此模組尚無大型檔案。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={delOpen}
        afterClose={() => setDeleting(null)}
        title="刪除檔案"
        okText="確認刪除"
        destroyOnHidden
        okButtonProps={{ danger: true, autoFocus: true }}
        cancelText="取消"
        onOk={confirmDelete}
        onCancel={() => setDelOpen(false)}
      >
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          將永久刪除「{deleting?.name}」（{deleting ? fmtSize(deleting.sizeMb) : ''}）無法復原
        </div>
      </Modal>
    </div>
  )
}
