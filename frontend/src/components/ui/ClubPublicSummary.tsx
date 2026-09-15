// 社團對外公開資料的唯讀呈現:行政端社團總覽與管理項目共用。
// 兩頁各刻一份的話,同一份資料在兩個地方會長得不一樣、也會有一邊漏掉新欄位。
import { Tag } from 'antd'
import { CLUB_IMAGE_RATIO, type ClubPublicProfile } from '../../api/clubProfile'

const label: React.CSSProperties = { color: 'var(--steel)' }
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '104px 1fr',
  gap: '10px 12px',
  fontSize: 13,
}

export default function ClubPublicSummary({ data }: { data: ClubPublicProfile }) {
  return (
    <div>
      {(data.avatarUrl || data.bannerUrl) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
          {data.avatarUrl && (
            <img
              src={data.avatarUrl}
              alt="社團頭像"
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, flex: 'none' }}
            />
          )}
          {data.bannerUrl && (
            <img
              src={data.bannerUrl}
              alt="社團橫幅"
              style={{
                width: '100%',
                maxWidth: 240,
                aspectRatio: String(CLUB_IMAGE_RATIO.banner),
                objectFit: 'cover',
                borderRadius: 6,
              }}
            />
          )}
        </div>
      )}

      <div style={grid}>
        <div style={label}>一句話介紹</div>
        <div>{data.tagline || '—'}</div>
        <div style={label}>標籤</div>
        <div>{data.tags.length ? data.tags.map((t) => <Tag key={t}>{t}</Tag>) : '—'}</div>
        <div style={label}>招生狀態</div>
        <div>{data.recruitStatus || '—'}</div>
        <div style={label}>對外信箱</div>
        <div className="num">{data.publicEmail || '—'}</div>
        <div style={label}>Instagram</div>
        <div>
          {data.instagram ? (
            <a
              href={`https://instagram.com/${data.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{data.instagram}
            </a>
          ) : (
            '—'
          )}
        </div>
        <div style={label}>社辦位置</div>
        <div>{data.officeLocation || '—'}</div>
        <div style={label}>例行活動</div>
        <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{data.regularSchedule || '—'}</div>
        <div style={label}>入社方式</div>
        <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{data.joinInfo || '—'}</div>
        <div style={label}>報名連結</div>
        <div>
          {data.signupUrl ? (
            <a href={data.signupUrl} target="_blank" rel="noopener noreferrer">
              {data.signupUrl}
            </a>
          ) : (
            '—'
          )}
        </div>
      </div>
    </div>
  )
}
