import { useNavigate, useParams } from 'react-router'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import { usePublicClub, usePublicClubActivities } from '../../api/publicClubs'
import PublicShell from './PublicShell'
import './publicClubs.css'

const BADGE_CLASS: Record<string, string> = {
  歡迎加入: 'welcome',
  暫不開放: 'closed',
  額滿: 'full',
}

export default function ClubDetailPage() {
  const navigate = useNavigate()
  const { clubId } = useParams()
  const id = Number(clubId)
  const valid = Number.isInteger(id) && id > 0
  const club = usePublicClub(valid ? id : null)
  const activities = usePublicClubActivities(valid ? id : null)

  if (!valid || club.isLoadingError) {
    return (
      <PublicShell mobileTitle="社團">
        <QueryError
          title={valid ? '找不到這個社團' : '網址不正確'}
          error={club.error}
          onRetry={valid ? () => void club.refetch() : undefined}
        />
      </PublicShell>
    )
  }

  const c = club.data
  return (
    <PublicShell mobileTitle={c?.name ?? '社團'}>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={() => navigate('/')}>
        回社團導覽
      </Button>

      <LoadingBlock pending={club.isPending} rows={8}>
        {c && (
          <>
            <div className="club-hero">{c.bannerUrl && <img src={c.bannerUrl} alt="" />}</div>

            {/* 標題卡:頭像撐滿卡高、說明與標籤在右、招生狀態靠右上 */}
            <section className="club-head">
              <div className="club-avatar">{c.avatarUrl && <img src={c.avatarUrl} alt="" />}</div>
              <div className="main">
                <div className="title-row">
                  <div>
                    <h1>{c.name}</h1>
                    {c.enName && <div className="en">{c.enName}</div>}
                  </div>
                  {c.recruitStatus && (
                    <span
                      className={`club-badge ${BADGE_CLASS[c.recruitStatus] ?? 'closed'}`}
                      style={{ borderRadius: 999, border: '1px solid' }}
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
                        <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer">
                          <span className="kind">社團網頁</span>
                          <span className="val">{c.websiteUrl.replace(/^https?:\/\//, '')}</span>
                        </a>
                      )}
                    </div>
                  </section>
                )}
                {(c.joinInfo || c.signupUrl) && (
                  <section className="card" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>怎麼加入</h2>
                    {c.joinInfo && (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{c.joinInfo}</p>
                    )}
                    {c.signupUrl && (
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
                  onRetry={() => void activities.refetch()}
                />
              ) : (
                <LoadingBlock pending={activities.isPending} rows={3}>
                  {(activities.data ?? []).length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--steel)' }}>這個社團還沒有公開的活動紀錄</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="tb">
                        <thead>
                          <tr>
                            <th scope="col" style={{ whiteSpace: 'nowrap' }}>日期</th>
                            <th scope="col" style={{ whiteSpace: 'nowrap' }}>時間</th>
                            <th scope="col">活動名稱</th>
                            <th scope="col">地點</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(activities.data ?? []).map((a) => (
                            <tr key={a.id}>
                              <td className="num" style={{ whiteSpace: 'nowrap' }}>{a.dateSpan}</td>
                              {/* 起訖時間是選填:拿不到值顯示 —,不用 00:00 頂替 */}
                              <td className="num" style={{ whiteSpace: 'nowrap' }}>{a.timeSpan || '—'}</td>
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
