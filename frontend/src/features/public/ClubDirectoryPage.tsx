import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Input, Select } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import { CLUB_TAGS, RECRUIT_STATUSES } from '../../api/clubProfile'
import { usePublicClubs, type ClubCard } from '../../api/publicClubs'
import PublicShell from './PublicShell'
import './publicClubs.css'

// 導覽頁的預設排序:性質先,同性質內依名稱
const ATTR_ORDER = ['學藝性', '藝術性', '體育性', '聯誼性', '服務性', '自治性'] as const

const BADGE_CLASS: Record<string, string> = {
  歡迎加入: 'welcome',
  暫不開放: 'closed',
  額滿: 'full',
}

const options = (values: readonly string[], all: string) => [
  { value: '', label: all },
  ...values.map((v) => ({ value: v, label: v })),
]

export function ClubCardTile({ club, onOpen }: { club: ClubCard; onOpen: () => void }) {
  return (
    <button type="button" className="club-card" onClick={onOpen}>
      <div className="club-banner">
        {club.bannerUrl && <img src={club.bannerUrl} alt="" loading="lazy" />}
      </div>
      <div className="club-card-body">
        <div className="club-ident">
          <div className="club-avatar">
            {club.avatarUrl && <img src={club.avatarUrl} alt="" loading="lazy" />}
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
    </button>
  )
}

export default function ClubDirectoryPage() {
  const navigate = useNavigate()
  const query = usePublicClubs()
  const [q, setQ] = useState('')
  const [attr, setAttr] = useState('')
  const [tag, setTag] = useState('')
  const [recruit, setRecruit] = useState('')

  // 全量在手上,搜尋與篩選都在前端做完 —— 再打一次伺服器只是多一次往返
  const rows = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (query.data ?? [])
      .filter((c) => {
        if (keyword && ![c.name, c.enName, c.tagline].some((v) => v.toLowerCase().includes(keyword)))
          return false
        if (attr && c.attribute !== attr) return false
        if (tag && !c.tags.includes(tag)) return false
        if (recruit && c.recruitStatus !== recruit) return false
        return true
      })
      .sort(
        (a, b) =>
          ATTR_ORDER.indexOf(a.attribute as (typeof ATTR_ORDER)[number]) -
            ATTR_ORDER.indexOf(b.attribute as (typeof ATTR_ORDER)[number]) ||
          // DB 的 collation 對中文是碼位序,這裡用 zh-Hant 重排
          a.name.localeCompare(b.name, 'zh-Hant'),
      )
  }, [query.data, q, attr, tag, recruit])

  return (
    <PublicShell mobileTitle="社團導覽">
      <div className="dir-toolbar">
        <h1>社團導覽</h1>
        <Select
          value={attr}
          onChange={setAttr}
          options={options(ATTR_ORDER, '全部性質')}
          aria-label="依性質篩選"
          style={{ width: 132 }}
        />
        <Select
          value={tag}
          onChange={setTag}
          options={options(CLUB_TAGS, '全部標籤')}
          aria-label="依標籤篩選"
          style={{ width: 132 }}
        />
        <Select
          value={recruit}
          onChange={setRecruit}
          options={options(RECRUIT_STATUSES, '全部招生')}
          aria-label="依招生狀態篩選"
          style={{ width: 132 }}
        />
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
          onRetry={() => void query.refetch()}
        />
      ) : (
        <LoadingBlock pending={query.isPending} rows={6}>
          {rows.length === 0 ? (
            <div
              className="card"
              style={{ padding: 48, textAlign: 'center', color: 'var(--steel)' }}
            >
              沒有符合條件的社團，調整搜尋或篩選再試一次
            </div>
          ) : (
            <div className="dir-grid">
              {rows.map((club) => (
                <ClubCardTile key={club.id} club={club} onOpen={() => navigate(`/clubs/${club.id}`)} />
              ))}
            </div>
          )}
        </LoadingBlock>
      )}
    </PublicShell>
  )
}
