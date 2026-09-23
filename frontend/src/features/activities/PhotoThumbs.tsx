import { Image } from 'antd'
import { EyeOutlined } from '@ant-design/icons'

export interface PhotoThumb {
  key: string
  url: string
  name: string
  onRemove: () => void
}

/**
 * 結案照片的縮圖列:52×40 置中裁切,點開是 AntD 的圖片預覽、整列左右切換(design-guide §6),
 * 右上角 × 移除。已上傳的與這次剛選的照片共用 —— 兩份各刻一次的話,預覽只會有一邊接上。
 * 縮圖太小放不下「預覽」兩個字,懸停只給眼睛圖示;預覽對話框的名字要自己給(成組時 rc-image
 * 不把縮圖的 alt 交給預覽層)
 */
export default function PhotoThumbs({ items }: { items: readonly PhotoThumb[] }) {
  return (
    <Image.PreviewGroup preview={{ alt: '活動照片' }}>
      {items.map((t) => (
        <span key={t.key} style={{ position: 'relative', display: 'inline-flex' }}>
          <Image
            src={t.url}
            alt={t.name}
            title={t.name}
            width={52}
            height={40}
            preview={{ cover: <EyeOutlined aria-hidden /> }}
            styles={{
              root: { borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)' },
              image: { objectFit: 'cover' },
            }}
          />
          <button
            type="button"
            className="link-btn danger"
            aria-label={`移除 ${t.name}`}
            style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--line)', borderRadius: '50%', width: 16, height: 16, lineHeight: '12px', padding: 0, fontSize: 11 }}
            onClick={t.onRemove}
          >
            ×
          </button>
        </span>
      ))}
    </Image.PreviewGroup>
  )
}
