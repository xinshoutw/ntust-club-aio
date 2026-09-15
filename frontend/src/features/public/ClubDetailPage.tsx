import { useParams } from 'react-router'
import { Button } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { Cols } from '../../components/ui/tableControls'
import QueryError from '../../components/ui/QueryError'
import { ApiError } from '../../api/client'
import { usePublicClub, usePublicClubActivities } from '../../api/publicClubs'
import useDocumentTitle from './useDocumentTitle'
import ClubArt, { BADGE_CLASS } from './clubArt'
import PublicShell from './PublicShell'
import './publicClubs.css'

const HTTP_URL = /^https?:\/\//

export default function ClubDetailPage() {
  const { clubId } = useParams()
  const id = Number(clubId)
  // 主鍵是 int4:超界的值後端回 422,不必多打一趟才知道
  const valid = Number.isInteger(id) && id > 0 && id <= 2_147_483_647
  const club = usePublicClub(valid ? id : null)
  const activities = usePublicClubActivities(valid ? id : null)
  useDocumentTitle(club.data?.name ?? null)

  // 認 status 不認訊息字串:後端把「找不到社團」改成別的說法,這裡就會變成無限重試
  // 一個永久 404;反過來任何含「找不到」的 5xx 會被當成停社而藏掉重試鈕
  const notFound = !valid || (club.error instanceof ApiError && club.error.status === 404)
  // `isLoadingError` 只認首載失敗,手上已有資料時重抓失敗走的是 `isRefetchError` ——
  // 那條規則是為了「暫時失敗不要換掉已知事實」,但 **404 是新的事實不是失敗**:
  // 行政端把社團下架後,開著這一頁的人會繼續看到舊 profile,下架對他等於沒發生
  if (!valid || club.isLoadingError || notFound) {
    // 後端對停社與下架的社團一律 404(不交代它曾經存在),所以這裡不能只說「載入失敗」
    return (
      <PublicShell mobileTitle="社團">
        <QueryError
          title={notFound ? '找不到這個社團' : '社團資料載入失敗'}
          error={notFound ? new Error('這個社團可能已經停社，或目前未公開') : club.error}
          retrying={club.isFetching}
          onRetry={valid && !notFound ? () => void club.refetch() : undefined}
        />
      </PublicShell>
    )
  }

  const c = club.data
  return (
    <PublicShell mobileTitle={c?.name ?? '社團'} back>
      <LoadingBlock pending={club.isPending} rows={8}>
        {c && (
          <>
            <div className="club-hero">
              <ClubArt kind="banner" url={c.bannerUrl} clubId={c.id} clubName={c.name} />
            </div>

            {/* 標題卡:頭像撐滿卡高、說明與標籤在右、招生狀態靠右上 */}
            <section className="club-head">
              <div className="club-avatar">
                <ClubArt kind="avatar" url={c.avatarUrl} clubId={c.id} clubName={c.name} />
              </div>
              <div className="main">
                <div className="title-row">
                  <div>
                    <h1>{c.name}</h1>
                    {c.enName && <div className="en">{c.enName}</div>}
                  </div>
                  {c.recruitStatus && (
                    <span
                      className={`club-badge pill ${BADGE_CLASS[c.recruitStatus] ?? 'closed'}`}
                    >
                      {c.recruitStatus}
                    </span>
                  )}
                </div>
                {c.tagline && <div className="tagline">{c.tagline}</div>}
                <div className="club-tags">
                  {c.attribute && <span className="club-tag">{c.attribute}</span>}
                  {c.tags.map((t) => (
                    <span key={t} className="club-tag">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <div className="club-cols">
              <div className="col">
                <section className="card fill" style={{ padding: 24 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>社團介紹</h2>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{c.intro}</p>
                  {(c.officeLocation || c.regularSchedule) && (
                    <dl className="club-kv">
                      {c.officeLocation && (
                        <>
                          <dt>社辦位置</dt>
                          <dd>{c.officeLocation}</dd>
                        </>
                      )}
                      {c.regularSchedule && (
                        <>
                          <dt>例行活動</dt>
                          <dd className="pre">{c.regularSchedule}</dd>
                        </>
                      )}
                    </dl>
                  )}
                </section>
              </div>

              <div className="col">
                {(c.publicEmail || c.instagram || c.websiteUrl) && (
                  <section className="card" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>聯絡方式</h2>
                    <div className="club-links">
                      {c.publicEmail && (
                        <a href={`mailto:${c.publicEmail}`}>
                          <span className="kind">Email</span>
                          <span className="val num">{c.publicEmail}</span>
                        </a>
                      )}
                      {c.instagram && (
                        <a
                          href={`https://instagram.com/${c.instagram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {/* 只顯示帳號,不顯示網址前綴 */}
                          <span className="kind">Instagram</span>
                          <span className="val">@{c.instagram}</span>
                        </a>
                      )}
                      {c.websiteUrl && (
                        /* 遷入的網址有一批沒有 scheme(`cms_import` 原樣搬舊系統的自由輸入),
                           當成 href 會被解析成站內相對路徑,一點就彈回首頁 —— 那種只顯示文字 */
                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                          <span className="kind">社團網頁</span>
                          {HTTP_URL.test(c.websiteUrl) ? (
                            <a
                              className="val"
                              href={c.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.websiteUrl.replace(HTTP_URL, '')}
                            </a>
                          ) : (
                            <span className="val">{c.websiteUrl}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}
                {/* 守衛要同時掛在外層:`joinInfo` 空 + `signupUrl` 不合法時,
                    卡片會只剩一個「怎麼加入」標題,底下整片空白 */}
                {(c.joinInfo || (c.signupUrl && HTTP_URL.test(c.signupUrl))) && (
                  <section className="card" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>怎麼加入</h2>
                    {c.joinInfo && (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{c.joinInfo}</p>
                    )}
                    {/* 守衛同 websiteUrl:輸出端刻意不驗證(後端只收口輸入),
                        遷入或匯入腳本塞進來的值會直接變成一顆可點的連結 */}
                    {c.signupUrl && HTTP_URL.test(c.signupUrl) && (
                      <Button
                        type="primary"
                        href={c.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginTop: 16 }}
                      >
                        填寫報名表
                      </Button>
                    )}
                  </section>
                )}
              </div>
            </div>

            {/* 活動紀錄:全寬。日期與時間各自一欄且不換行 */}
            <section className="card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>活動紀錄</h2>
              {activities.isLoadingError ? (
                <QueryError
                  compact
                  title="活動紀錄載入失敗"
                  error={activities.error}
                  retrying={activities.isFetching}
                  onRetry={() => void activities.refetch()}
                />
              ) : (
                <LoadingBlock pending={activities.isPending} rows={3}>
                  {(activities.data ?? []).length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--steel)' }}>這個社團還沒有公開的活動紀錄</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      {/* `tb fixed` + <Cols> 是全站表格慣例:欄寬固定,日期與時間才不會被
                          內容擠到換行;minWidth 讓窄螢幕產生水平捲軸而不是壓縮欄位 */}
                      <table className="tb fixed" style={{ minWidth: 600 }} aria-label="活動紀錄">
                        {/* 190/120:扣掉 td 的 32px padding 還容得下跨日的
                            「2026/09/15 – 2026/09/16」與「19:00 – 21:00」 */}
                        <Cols widths={[190, 120, 'auto', 200]} />
                        <thead>
                          <tr>
                            <th scope="col">日期</th>
                            <th scope="col">時間</th>
                            <th scope="col">活動名稱</th>
                            <th scope="col">地點</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(activities.data ?? []).map((a) => (
                            <tr key={a.id}>
                              <td className="num nowrap">{a.dateSpan}</td>
                              {/* 起訖時間是選填:拿不到值顯示 —,不用 00:00 頂替 */}
                              <td className="num nowrap">{a.timeSpan || '—'}</td>
                              <td>{a.name}</td>
                              <td>{a.location}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </LoadingBlock>
              )}
            </section>
          </>
        )}
      </LoadingBlock>
    </PublicShell>
  )
}
