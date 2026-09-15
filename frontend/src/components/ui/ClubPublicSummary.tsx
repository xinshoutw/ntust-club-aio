// 社團對外公開資料的唯讀呈現:行政端社團總覽與管理項目共用。
// 兩頁各刻一份的話,同一份資料在兩個地方會長得不一樣、也會有一邊漏掉新欄位。
import { Tag } from 'antd'
import {
  SOCIAL_KINDS,
  SOCIAL_LABELS,
  resolveTextMode,
  type ClubPublicProfile,
} from '../../api/clubProfile'

const label: React.CSSProperties = { color: 'var(--steel)' }
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '104px 1fr',
  gap: '10px 12px',
  fontSize: 13,
}

const linkOrDash = (url: string) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  ) : (
    '—'
  )

export default function ClubPublicSummary({ data }: { data: ClubPublicProfile }) {
  const socials = SOCIAL_KINDS.filter((k) => data.socialLinks[k])
  const textMode = resolveTextMode(data.bannerTextMode, data.bannerLuma)

  return (
    <div>
      {(data.avatarUrl || data.bannerUrl) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
          {data.avatarUrl && (
            <img
              src={data.avatarUrl}
              alt="社團頭像"
              width={64}
              height={64}
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }}
            />
          )}
          {data.bannerUrl && (
            <div
              style={{
                position: 'relative',
                width: 160,
                aspectRatio: '4 / 3',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <img
                src={data.bannerUrl}
                alt="社團橫幅"
                width={1600}
                height={1200}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* 縮圖也套黑化,承辦看到的才是導覽頁上的樣子 */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `rgba(0,0,0,${data.bannerDim / 100})`,
                }}
              />
            </div>
          )}
        </div>
      )}

      <div style={grid}>
        <div style={label}>一句話介紹</div>
        <div>{data.tagline || '—'}</div>
        <div style={label}>標籤</div>
        <div>
          {data.tags.length ? data.tags.map((t) => <Tag key={t}>{t}</Tag>) : '—'}
        </div>
        <div style={label}>招生狀態</div>
        <div>{data.recruitStatus || '—'}</div>
        <div style={label}>對外信箱</div>
        <div className="num">{data.publicEmail || '—'}</div>
        <div style={label}>社群連結</div>
        <div>
          {socials.length
            ? socials.map((k) => (
                <div key={k}>
                  {SOCIAL_LABELS[k]}：{linkOrDash(data.socialLinks[k] ?? '')}
                </div>
              ))
            : '—'}
        </div>
        <div style={label}>社辦位置</div>
        <div>{data.officeLocation || '—'}</div>
        <div style={label}>例行活動</div>
        <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{data.regularSchedule || '—'}</div>
        <div style={label}>入社方式</div>
        <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{data.joinInfo || '—'}</div>
        <div style={label}>報名連結</div>
        <div>{linkOrDash(data.signupUrl)}</div>
        <div style={label}>成立年份</div>
        <div className="num">{data.foundedYear ?? '—'}</div>
        <div style={label}>橫幅呈現</div>
        <div className="num">
          {data.bannerUrl
            ? `黑化 ${data.bannerDim}％　模糊 ${data.bannerBlur}％　${
                textMode === 'dark' ? '深色字' : '淺色字'
              }`
            : '—'}
        </div>
      </div>
    </div>
  )
}
