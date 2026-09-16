import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import { CLUB_TAGS, RECRUIT_STATUSES } from '../../api/clubProfile'
import { usePublicClubs, type ClubCard } from '../../api/publicClubs'
import useDocumentTitle from './useDocumentTitle'
import ClubArt, { BADGE_CLASS } from './clubArt'
import PublicShell from './PublicShell'
import './publicClubs.css'

// 導覽頁的預設排序:性質先,同性質內依名稱
const ATTR_ORDER = ['學藝性', '藝術性', '體育性', '聯誼性', '服務性', '自治性'] as const
// 遷入的社團有一批性質不可考(`migration/cms_import.py` 認不得就寫 NULL),
// 直接用 indexOf 會回 -1 —— 那批社團會被釘在導覽頁最顯眼的第一格
const UNCLASSIFIED = '未分類'
// 需求方指定的特例:這一社固定排在自己性質的第一個。**不是通則**,也不做成設定 ——
// 一個名字換一行比較誠實,好過一張沒人維護的排序主檔
const PINNED_FIRST = '開源技術開發研究社'
const rank = (attr: string | null): number => {
  const i = ATTR_ORDER.indexOf(attr as (typeof ATTR_ORDER)[number])
  return i < 0 ? ATTR_ORDER.length : i
}

const options = (values: readonly string[], all: string) => [
  { value: '', label: all },
  ...values.map((v) => ({ value: v, label: v })),
]

/** 整張卡是一個連結,不是按鈕。
 *
 *  `<button onClick={navigate}>` 看起來一樣,但不能 ⌘-click 開新分頁、不能右鍵複製
 *  連結,搜尋引擎也爬不到任何一個社團頁 —— 對一個明說要給校外看的目錄是實質損失。
 *  `<Link>` 自己處理修飾鍵與中鍵,SPA 導航照舊。 */
function ClubCardTile({ club }: { club: ClubCard }) {
  return (
    <Link className="club-card" to={`/clubs/${club.id}`}>
      <div className="club-banner">
        <ClubArt kind="banner" url={club.bannerUrl} clubId={club.id} clubName={club.name} />
      </div>
      <div className="club-card-body">
        <div className="club-ident">
          <div className="club-avatar">
            <ClubArt kind="avatar" url={club.avatarUrl} clubId={club.id} clubName={club.name} />
          </div>
          <div className="names">
            <div className="zh">{club.name}</div>
            {club.enName && <div className="en">{club.enName}</div>}
          </div>
        </div>
        <div className="club-tagline">{club.tagline}</div>
        {/* 底列:標籤靠左下,招生狀態貼齊右下角(性質不上字卡,它在篩選器裡) */}
        <div className="club-card-foot">
          <div className="club-tags">
            {club.tags.map((t) => (
              <span key={t} className="club-tag">
                {t}
              </span>
            ))}
          </div>
          {club.recruitStatus && (
            <span className={`club-badge ${BADGE_CLASS[club.recruitStatus] ?? 'closed'}`}>
              {club.recruitStatus}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function ClubDirectoryPage() {
  const query = usePublicClubs()
  const [q, setQ] = useState('')
  const [attr, setAttr] = useState('')
  const [tag, setTag] = useState('')
  const [recruit, setRecruit] = useState('')
  useDocumentTitle('社團導覽')

  const clearFilters = () => {
    setQ('')
    setAttr('')
    setTag('')
    setRecruit('')
  }

  // 全量在手上,搜尋與篩選都在前端做完 —— 再打一次伺服器只是多一次往返
  const rows = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (query.data ?? [])
      .filter((c) => {
        if (keyword && ![c.name, c.enName, c.tagline].some((v) => v.toLowerCase().includes(keyword)))
          return false
        if (attr && (attr === UNCLASSIFIED ? c.attribute !== null : c.attribute !== attr))
          return false
        if (tag && !c.tags.includes(tag)) return false
        if (recruit && c.recruitStatus !== recruit) return false
        return true
      })
      .sort(
        (a, b) =>
          rank(a.attribute) - rank(b.attribute) ||
          Number(b.name === PINNED_FIRST) - Number(a.name === PINNED_FIRST) ||
          // DB 的 collation 對中文是碼位序,這裡用 zh-Hant 重排
          a.name.localeCompare(b.name, 'zh-Hant'),
      )
  }, [query.data, q, attr, tag, recruit])

  return (
    <PublicShell mobileTitle="社團導覽">
      <div className="dir-toolbar">
        <h1>社團導覽</h1>
        {/* 三顆下拉包一層:手機上它們要自成一列並平分寬度,桌機上 `display: contents`
            讓它們照舊直接排在工具列的 flex 裡 */}
        <div className="dir-filters">
          <Select
            value={attr}
            onChange={setAttr}
            options={options([...ATTR_ORDER, UNCLASSIFIED], '全部性質')}
            aria-label="依性質篩選"
            className="dir-filter"
          />
          <Select
            value={tag}
            onChange={setTag}
            options={options(CLUB_TAGS, '全部標籤')}
            aria-label="依標籤篩選"
            className="dir-filter"
          />
          <Select
            value={recruit}
            onChange={setRecruit}
            options={options(RECRUIT_STATUSES, '全部招生')}
            aria-label="依招生狀態篩選"
            className="dir-filter"
          />
        </div>
        <Input
          className="dir-search"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋關鍵字"
        />
      </div>

      {/* 查詢失敗不得長得像「沒有社團」:空狀態要讓位給錯誤說明 */}
      {query.isLoadingError ? (
        <QueryError
          title="社團清單載入失敗"
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <LoadingBlock pending={query.isPending} rows={6}>
          {rows.length === 0 ? (
            <div
              className="card"
              style={{ padding: 48, textAlign: 'center', color: 'var(--steel)' }}
            >
              {q || attr || tag || recruit ? (
                <>
                  沒有符合條件的社團
                  <div style={{ marginTop: 16 }}>
                    <Button onClick={clearFilters}>清除所有篩選</Button>
                  </div>
                </>
              ) : (
                '目前沒有公開的社團'
              )}
            </div>
          ) : (
            <div className="dir-grid">
              {rows.map((club) => (
                <ClubCardTile key={club.id} club={club} />
              ))}
            </div>
          )}
        </LoadingBlock>
      )}
    </PublicShell>
  )
}
