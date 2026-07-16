import { useMemo, useState } from 'react'
import { Pagination } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { FilterButton } from '../../components/ui/tableControls'

const PAGE_SIZE = 20

interface AuditLog {
  id: number
  time: string
  who: string
  role: string
  action: string
  detail: string
}

// 稽核軌跡是全站唯一允許顯示單號(ID)的頁面
const LOGS: AuditLog[] = [
  { id: 1, time: '2026/07/13 16:42', who: '王組長', role: '管理員', action: '解鎖逾期結案', detail: 'ACT-114-0012 程式設計工作坊' },
  { id: 6, time: '2026/07/13 15:10', who: '王家豪', role: '輔導老師', action: '核准活動申請', detail: 'ACT-114-0031 機器人組裝工作坊(核定 $6,000)' },
  { id: 2, time: '2026/07/12 11:03', who: '林淑芬', role: '組長', action: '退回活動申請', detail: 'ACT-114-0019 電競友誼賽:經費明細未附估價單' },
  { id: 3, time: '2026/07/12 09:30', who: '李承辦', role: '管理員', action: '發布公告', detail: '114-2 社團評鑑報名開始(全校)' },
  { id: 4, time: '2026/07/11 14:22', who: '王組長', role: '管理員', action: '停權社團', detail: '機械系學會 至 2026/07/15:器材損壞未賠償' },
  { id: 5, time: '2026/07/11 10:05', who: '李工讀', role: '工讀生', action: '器材借出點交', detail: 'EQP-114-0092 摺疊桌 ×10(資工系學會)' },
  { id: 7, time: '2026/07/10 17:20', who: '王組長', role: '管理員', action: '重設密碼', detail: '社團帳號 club_ee(電機系學會)' },
  { id: 8, time: '2026/07/10 16:05', who: '李承辦', role: '管理員', action: '調整行政分', detail: '資工系學會 ad6 網頁經營 0 → 5' },
  { id: 9, time: '2026/07/10 14:40', who: '陳助理', role: '管理員', action: '核准固定借用', detail: 'ROOM-114-0301 S304(資工系學會)' },
  { id: 10, time: '2026/07/10 11:12', who: '學務長', role: '學務長', action: '核准活動申請', detail: 'ACT-114-0020 資訊週(核定 $12,000)' },
  { id: 11, time: '2026/07/09 15:55', who: '陳工讀', role: '工讀生', action: '違規勸導開立', detail: 'VIO-114-0503 資工系學會 社辦電燈未關' },
  { id: 12, time: '2026/07/09 10:30', who: '王組長', role: '管理員', action: '刪除報修檔案', detail: '練團室 隔音棉脫落_影片.mp4(142 MB)' },
  { id: 13, time: '2026/07/08 16:44', who: '李承辦', role: '管理員', action: '銷案', detail: 'VIO-114-0502 資工系學會:已完成愛校服務 2 小時' },
  { id: 14, time: '2026/07/08 14:00', who: '陳助理', role: '管理員', action: '核准器材借用', detail: 'EQP-114-0096 帳篷 ×2(資工系學會)' },
  { id: 15, time: '2026/07/08 09:20', who: '王組長', role: '管理員', action: '新增工讀生帳號', detail: 'staff_chen(陳工讀)' },
  { id: 16, time: '2026/07/07 15:31', who: '王家豪', role: '輔導老師', action: '核准結案', detail: 'ACT-114-0011 迎新茶會' },
  { id: 17, time: '2026/07/07 13:08', who: '李承辦', role: '管理員', action: '調整系統設定', detail: '器材借用工作天緩衝 前 2 後 1' },
  { id: 18, time: '2026/07/06 17:45', who: '林淑芬', role: '組長', action: '核准活動申請', detail: 'ACT-114-0018 迎新宿營(核定 $20,000)' },
  { id: 19, time: '2026/07/06 11:26', who: '王組長', role: '管理員', action: '恢復社團帳號', detail: '機械系學會(停權期滿)' },
  { id: 20, time: '2026/07/05 16:12', who: '李工讀', role: '工讀生', action: '器材歸還點交', detail: 'EQP-114-0093 電腦單槍投影機 ×1(資工系學會)' },
  { id: 21, time: '2026/07/05 10:40', who: '李承辦', role: '管理員', action: '發布公告', detail: '固定場地借用 7 月加開受理(全校)' },
  { id: 22, time: '2026/07/04 14:55', who: '王組長', role: '管理員', action: '認可大型活動', detail: 'ACT-114-0020 資訊週' },
  { id: 23, time: '2026/07/04 09:02', who: '陳助理', role: '管理員', action: '退回器材借用', detail: 'EQP-114-0094 擴音機 MA101:區間內已借罄' },
  { id: 24, time: '2026/07/03 15:36', who: '王家豪', role: '輔導老師', action: '退回結案', detail: 'ACT-114-0009 春季音樂會:照片未達 5 張' },
  { id: 25, time: '2026/07/03 11:14', who: '王組長', role: '管理員', action: '新增評審帳號', detail: 'viewer03(陳老師)' },
]

export default function AuditPage() {
  const [whoFilter, setWhoFilter] = useState<string[]>([])
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState<string[]>([])
  const [page, setPage] = useState(1)

  const whoOptions = [...new Set(LOGS.map((l) => l.who))]
  const roleOptions = [...new Set(LOGS.map((l) => l.role))]
  const actionOptions = [...new Set(LOGS.map((l) => l.action))]

  const filtered = useMemo(() => {
    let list = LOGS
    if (whoFilter.length) list = list.filter((l) => whoFilter.includes(l.who))
    if (roleFilter.length) list = list.filter((l) => roleFilter.includes(l.role))
    if (actionFilter.length) list = list.filter((l) => actionFilter.includes(l.action))
    return list
  }, [whoFilter, roleFilter, actionFilter])

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const setFilter = (setter: (next: string[]) => void) => (next: string[]) => {
    setter(next)
    setPage(1)
  }

  return (
    <div>
      <PageHeader title="稽核軌跡" sub="高風險操作紀錄(唯讀)" />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>時間</th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  操作者
                  <FilterButton options={whoOptions} selected={whoFilter} onChange={setFilter(setWhoFilter)} label="篩選操作者" />
                </span>
              </th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  角色
                  <FilterButton options={roleOptions} selected={roleFilter} onChange={setFilter(setRoleFilter)} label="篩選角色" />
                </span>
              </th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  動作
                  <FilterButton options={actionOptions} selected={actionFilter} onChange={setFilter(setActionFilter)} label="篩選動作" />
                </span>
              </th>
              <th>內容</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)', whiteSpace: 'nowrap' }}>{l.time}</td>
                <td style={{ fontWeight: 500 }}>{l.who}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.role}</td>
                <td>{l.action}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{l.detail}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr className="no-hover">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>無符合篩選條件的紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px 16px' }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onChange={setPage}
            showSizeChanger={false}
            hideOnSinglePage
          />
        </div>
      </div>
    </div>
  )
}
