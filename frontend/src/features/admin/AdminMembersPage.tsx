import { useEffect, useRef, useState } from 'react'
import { App, Button, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { DownloadOutlined } from '@ant-design/icons'
import OptionsError from '../../components/ui/OptionsError'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { downloadCsv } from '../../lib/csv'
import { kindLabel } from '../../lib/roles'
import { currentSemester, semesterOptions } from '../../lib/semester'
import { clampPage } from '../../lib/paging'
import { useFitRows } from '../../lib/fitRows'
import { useMemberTimeColumns } from '../../lib/memberTable'
import {
  fetchAllAdminMembers,
  useAdminClubMemberSemesters,
  useAdminClubMembers,
  useClubOptions,
} from '../../api/adminClubs'
import ClubSelect from './ClubSelect'
import { useAdminClub } from './clubContext'

// 伺服器端排序白名單(members 端點;kind=身份權重,負責人→副負責人→幹部→社員)
type SortKey = 'name' | 'student_id' | 'kind' | 'title' | 'semester' | 'created_at' | 'updated_at'

// 唯讀:名單由社團自行維護,行政僅查閱;可選學期、排序、匯出 CSV(比照社團端成員列表)
export default function AdminMembersPage() {
  const { club, clubId, clubKind } = useAdminClub()
  const { message } = App.useApp()
  // 卡片撐到視窗底、列數依高度算;分頁列跟著卡片底邊,列數不足時位置也不變
  const tableCard = useRef<HTMLDivElement>(null)
  const { height: cardHeight, rows: pageSize } = useFitRows(tableCard)
  const [page, setPage] = useState(1)
  const [semester, setSemester] = useState<string>(currentSemester())
  // 名冊慣例的預設序(身份權重→學號)=後端預設:不點排序時不帶 sort
  const { entries, toggle } = useMultiSort<SortKey>()
  const { showJoined, showUpdated } = useMemberTimeColumns(entries.map((e) => e.key))
  const colCount = 6 + Number(showJoined) + Number(showUpdated)
  const [exporting, setExporting] = useState(false)
  useEffect(() => setPage(1), [clubId, semester])
  // 換社團要一併回到當前學期:上一社選的學期在新社可能根本不存在,列表與匯出都會是誤導性的空
  useEffect(() => setSemester(currentSemester()), [clubId])

  // 學期下拉以該社名單實際有的學期為來源(只放當前學期的話查不到歷史名單)
  const semestersQuery = useAdminClubMemberSemesters(clubId)
  // clubId 為 null 時要分辨「還沒選」與「選項載不到」(已快取,零成本)
  const clubsQuery = useClubOptions()
  const listQuery = useAdminClubMembers(clubId, {
    semester: semester === 'all' ? undefined : semester,
    sort: sortParam(entries),
    page,
    pageSize,
  })
  const members = listQuery.data?.members ?? []
  const total = listQuery.data?.total ?? 0

  // 視窗變高會讓總頁數變少;停在末頁只會看到空表。失敗時 total 也是 0,只在成功後收斂
  const listLoaded = listQuery.isSuccess
  useEffect(() => {
    if (listLoaded) setPage((p) => clampPage(p, total, pageSize))
  }, [listLoaded, total, pageSize])

  const toggleSort = (key: SortKey) => {
    toggle(key)
    setPage(1) // 伺服器端分頁:換排序回到第 1 頁
  }

  const exportCsv = async () => {
    if (clubId == null) return
    setExporting(true)
    try {
      const rows = await fetchAllAdminMembers(clubId, semester === 'all' ? undefined : semester)
      if (!rows.length) {
        message.error(`${club} 沒有成員可匯出`)
        return
      }
      // 與社團端匯入格式相容(無標題列;後端 csv.reader 支援引號跳脫);身份以顯示詞輸出;職稱補空字串讓各列欄數一致
      downloadCsv(
        `成員名單_${club}_${semester === 'all' ? '全部學期' : semester}.csv`,
        rows.map((m) => [m.name, m.studentId, kindLabel(m.kind, clubKind), m.title ?? '']),
      )
      message.success(`已匯出 ${rows.length} 名成員`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="成員列表"
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* semesterOptions 一定補上當學期,查詢掛掉時只是歷史學期全不見(見 MembersPage 同型) */}
            {semestersQuery.isError && (
              <OptionsError
                what="學期清單"
                error={semestersQuery.error}
                onRetry={() => void semestersQuery.refetch()}
              />
            )}
            <Select
              value={semester}
              onChange={setSemester}
              style={{ width: 120 }}
              options={semesterOptions(semestersQuery.data ?? [], true)}
              loading={semestersQuery.isPending && clubId != null}
            />
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCsv()}>
              匯出 CSV
            </Button>
            <ClubSelect />
          </div>
        }
      />

      <div
        ref={tableCard}
        className="card"
        style={{ marginTop: 20, height: cardHeight, display: 'flex', flexDirection: 'column' }}
      >
        {/* 表格區吃掉剩餘高度;直向不捲(列數就是照這塊高度算的),橫向留給窄視窗 */}
        <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        <LoadingBlock pending={clubId != null && listQuery.isPending}>
          <table className="tb fixed" style={{ minWidth: 960 }}>
            {/* 姓名放得下四字中文名、學號放得下 9 碼,職稱固定為身份的 1.5 倍。
                兩個時間欄依 showJoined/showUpdated 增減;餘裕一律丟給最後一欄吸收 ——
                table-layout:fixed 下若每欄都給 px,瀏覽器會把餘裕按比例攤回每一欄,姓名與職稱又會被撐開 */}
            <Cols
              widths={[
                ...[100, 130, 92, 138, 80, ...(showJoined ? [140] : []), ...(showUpdated ? [140] : [])].slice(0, -1),
                'auto',
              ]}
            />
            <thead>
              <tr>
                <th scope="col"><MultiSortButton label="姓名" sortKey="name" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col"><MultiSortButton label="學號" sortKey="student_id" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col"><MultiSortButton label="身份" sortKey="kind" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col"><MultiSortButton label="職稱" sortKey="title" entries={entries} onToggle={toggleSort} /></th>
                <th scope="col"><MultiSortButton label="學期" sortKey="semester" entries={entries} onToggle={toggleSort} /></th>
                {showJoined && <th scope="col"><MultiSortButton label="入社時間" sortKey="created_at" entries={entries} onToggle={toggleSort} /></th>}
                {showUpdated && <th scope="col"><MultiSortButton label="更新時間" sortKey="updated_at" entries={entries} onToggle={toggleSort} /></th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="cell-clip" title={m.name} style={{ fontWeight: 500 }}>{m.name}</td>
                  <td className="num cell-clip" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                  <td>{kindLabel(m.kind, clubKind)}</td>
                  <td className="cell-clip" title={m.title ?? undefined}>{m.title ?? '—'}</td>
                  <td className="num cell-clip" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.semester}</td>
                  {showJoined && <td className="num cell-clip" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.joinedAt}</td>}
                  {showUpdated && <td className="num cell-clip" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>}
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={colCount}>
                    <QueryError
                      compact
                      title="成員名單載入失敗"
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                    />
                  </td>
                </tr>
              )}
              {/* 未選社團時查詢未啟用、isPending 恆真:那時 tbody 會整個空白,所以空狀態也要帶 clubId
                  (與上方 listQuery 的 LoadingBlock pending 同一個條件)。
                  而 clubId 為 null 有兩個原因:還沒選,或社團選項載不到 —— 後者叫人「請先選擇社團」
                  是做不到的指示,選擇器已經被 OptionsError 取代了 */}
              {(clubId == null || (!listQuery.isPending && !listQuery.isError)) && members.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    {clubsQuery.isError
                      ? '社團清單載入失敗，請以頁首的重試鈕重新載入'
                      : clubId == null
                        ? '請先選擇社團'
                        : `${club} 尚未建立成員名單`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
        </div>
        {/* 分頁列改放卡片內:卡片高度固定,它才會永遠停在同一條線上(全站其餘表格同型) */}
        <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
