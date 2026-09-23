import { useState } from 'react'
import { useParams } from 'react-router'
import { Button, Image, Modal } from 'antd'
import { EnvironmentOutlined } from '@ant-design/icons'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import { ApiError } from '../../api/client'
import { type PublicActivity, usePublicClub, usePublicClubActivities } from '../../api/publicClubs'
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
  // 彈窗常駐(design-guide §6):關閉動畫結束才清掉內容,否則標題會先變空
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<PublicActivity | null>(null)
  const openActivity = (a: PublicActivity) => {
    setShown(a)
    setOpen(true)
  }

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
                  <p className="club-text">{c.intro}</p>
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
                      <p className="club-text">{c.joinInfo}</p>
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
            {/* 具名的 section 才會是可跳轉的 region;原本那份名字掛在 `<table aria-label>` 上,
                表格收掉之後要有人接手 */}
            <section className="card" style={{ padding: 24 }} aria-labelledby="act-heading">
              <h2 id="act-heading" style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>
                活動紀錄
              </h2>
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
                    /* 不是 `tb fixed` 表格:固定欄寬把地點鎖在 200px,「趨勢科技 Trend Micro
                       股份有限公司」在 1440px 上照樣折成兩行,而活動名稱那一欄空著三百多 px。
                       改成四欄 grid —— 日期、時間與地點各取自己的 max-content,活動名稱吃掉
                       剩下的所有寬度。手機上同一份標記換成一列一張字卡(`publicClubs.css`),
                       不再是 600px 寬、要左右拉才看得到名稱與地點的表格 */
                    <div className="act-list" role="list">
                      {/* 清單而不是表格:一則紀錄一個 `listitem`,輔助技術才數得出有幾筆、
                          跳得到下一筆(欄位由每一格自己的 `.sr-only` 標籤交代,手機的
                          字卡連表頭都沒有)。列是 `subgrid` 的真盒子,role 立得住;
                          `display: contents` 的元素在舊版引擎會連 role 一起被拿掉。
                          表頭只給眼睛看,所以整列 `aria-hidden` */}
                      <div className="act-row act-head" aria-hidden="true">
                        <span>日期</span>
                        <span>時間</span>
                        <span>活動名稱</span>
                        <span>地點</span>
                      </div>
                      {(activities.data ?? []).map((a) => (
                        // 整列 onClick 只服務滑鼠,鍵盤入口是名稱那顆按鈕(design-guide §6);
                        // 列本身不能掛 role=button,那會蓋掉 listitem
                        <div
                          className="act-row click-tint"
                          role="listitem"
                          key={a.id}
                          onClick={() => openActivity(a)}
                        >
                          <span className="act-date num">
                            <span className="sr-only">日期 </span>
                            {a.dateSpan}
                          </span>
                          {/* 起訖時間是選填:拿不到值顯示 —,不用 00:00 頂替 */}
                          <span className="act-time num">
                            <span className="sr-only">時間 </span>
                            {a.timeSpan || '—'}
                          </span>
                          <span className="act-name">
                            <span className="sr-only">活動名稱 </span>
                            <button
                              type="button"
                              className="row-open-btn"
                              aria-haspopup="dialog"
                              onClick={(e) => {
                                e.stopPropagation()
                                openActivity(a)
                              }}
                            >
                              {a.name}
                            </button>
                          </span>
                          <span className="act-where">
                            {/* 圖示是給眼睛的第二份線索,唸出來的是旁邊那個 `.sr-only` */}
                            <EnvironmentOutlined className="act-where-icon" aria-hidden="true" />
                            <span className="sr-only">地點 </span>
                            {a.location}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </LoadingBlock>
              )}
            </section>
          </>
        )}
      </LoadingBlock>
      <ActivityModal
        activity={shown}
        open={open}
        onClose={() => setOpen(false)}
        afterClose={() => setShown(null)}
      />
    </PublicShell>
  )
}

interface ActivityModalProps {
  activity: PublicActivity | null
  open: boolean
  onClose: () => void
  afterClose: () => void
}

/** 活動紀錄點開的彈窗。資料全在清單那一列上(內容與照片 id 一起來),不另打詳情端點,
 *  所以沒有載入中的狀態;個別照片轉不出來(通道回 404)就收掉那一張,不留破圖 */
function ActivityModal({ activity, open, onClose, afterClose }: ActivityModalProps) {
  // 以網址記(照片 id 全站唯一,換一場活動也不會誤收);彈窗關掉就清掉,見 afterClose
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  // 預覽開著時組內張數不能變:收掉一張,預覽就停在「5 / 4」的空白 —— 開著的期間沿用
  // 打開那一刻的清單,淡出動畫跑完(afterOpenChange)才收,淡出中也不能縮
  const [frozen, setFrozen] = useState<readonly string[] | null>(null)
  const photos = frozen ?? activity?.photoUrls.filter((url) => !broken.has(url)) ?? []
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={() => {
        // 收掉的照片只記到這次關掉為止:404 也可能只是轉檔排太長(照片通道有排隊上限),
        // 再打開要重新要一次,不能一直藏到重新整理
        setBroken(new Set())
        setFrozen(null)
        afterClose()
      }}
      footer={null}
      width={640}
      title={activity?.name}
    >
      {activity && (
        <>
          <dl className="club-kv act-kv">
            <dt>日期</dt>
            <dd className="num">{activity.dateSpan}</dd>
            <dt>時間</dt>
            {/* 起訖時間是選填:拿不到值顯示 —,不用 00:00 頂替 */}
            <dd className="num">{activity.timeSpan || '—'}</dd>
            <dt>地點</dt>
            <dd>{activity.location}</dd>
            <dt>內容</dt>
            <dd className="pre">{activity.content || '—'}</dd>
          </dl>
          {/* 只有結案通過的活動有照片;沒有(或全都載不出來)就整段不出現,不畫一個空的標題 */}
          {photos.length > 0 && (
            <section aria-labelledby="act-photos-heading">
              <h3 id="act-photos-heading" className="act-photos-heading">
                活動照片
              </h3>
              {/* 縮圖本身就是 AntD Image 的預覽鈕(role=button、Enter/Space 可開),
                  同一組照片在預覽裡左右切換。不掛 loading="lazy":rc-image 另開一個 Image() 驗圖,
                  縮圖一掛上就整張下載,掛了也不會延後 */}
              <div className="act-photos">
                {/* 成組時 rc-image 不把縮圖的 alt 交給預覽層,預覽對話框的名字在這裡給 */}
                <Image.PreviewGroup
                  preview={{
                    alt: '活動照片',
                    onOpenChange: (next) => next && setFrozen(photos),
                    afterOpenChange: (next) => !next && setFrozen(null),
                  }}
                >
                  {photos.map((url, i) => (
                    <Image
                      key={url}
                      src={url}
                      alt={`活動照片${i + 1}`}
                      onError={() => setBroken((cur) => new Set(cur).add(url))}
                    />
                  ))}
                </Image.PreviewGroup>
              </div>
            </section>
          )}
        </>
      )}
    </Modal>
  )
}
