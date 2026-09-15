// 管理項目的「對外公開資料」全寬區塊:這裡填的每一欄都會出現在免登入的社團導覽頁,
// 因此獨立成一段擺在對內設定之上 —— 與聯絡通知並排會讓人分不出哪些欄位校外看得到。
import { useRef, useState } from 'react'
import { App, Button, Form, Input, InputNumber, Segmented, Select, Slider, Tooltip } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import {
  CLUB_IMAGE_RATIO,
  RECRUIT_STATUSES,
  SOCIAL_KINDS,
  SOCIAL_LABELS,
  resolveTextMode,
  useRemoveClubImage,
  useUploadClubImage,
  type BannerTextMode,
  type ClubImageSlot,
  type ClubPublicProfile,
} from '../../api/clubProfile'
import { useClubConfig } from '../../api/clubConfig'
import { IMAGE_ACCEPT, IMAGE_EXTENSIONS, fmtMB, hasAllowedExtension, isImageFile } from '../../lib/uploads'
import { SOCIAL_FIELDS, type SettingsValues } from './fields'

const MAX_TAGS = 5
const MAX_TAG_LEN = 8
// 後端只收 http(s);AntD 的 type:'url' 連 ftp:// 都放行,錯誤訊息卻已經寫死 http(s)
const HTTP_URL = { pattern: /^https?:\/\//, message: '須為 http(s) 開頭的網址' }

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 16 }
const groupTitle: React.CSSProperties = { fontSize: 13, color: 'var(--steel)', marginBottom: 8 }

interface Props {
  image: ClubPublicProfile
  itemClass: (k: keyof SettingsValues) => string | undefined
  /** 滑桿與字色模式要即時反映在預覽上,故由頁面把目前表單值傳進來 */
  dim: number
  blur: number
  textMode: BannerTextMode
}

/** 一張橫幅預覽。`preview` 為字卡樣式(只套黑化)或詳細頁樣式(黑化 + 模糊)。 */
function BannerPreview({
  url,
  dim,
  blur,
  textMode,
  luma,
  label,
  caption,
}: {
  url: string | null
  dim: number
  blur: number
  textMode: BannerTextMode
  luma: number | null
  label: string
  caption: string
}) {
  const resolved = resolveTextMode(textMode, luma)
  const color = resolved === 'dark' ? '#101418' : '#ffffff'
  return (
    <div>
      <div style={groupTitle}>{label}</div>
      <div
        style={{
          position: 'relative',
          aspectRatio: String(CLUB_IMAGE_RATIO.banner),
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          // 沒傳橫幅時不留白框:導覽頁同樣要有底色可退
          background: url ? undefined : 'var(--line)',
        }}
      >
        {url && (
          <img
            src={url}
            alt=""
            width={1600}
            height={1200}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // 模糊後邊緣會透出底色:放大一點蓋掉
              filter: blur ? `blur(${blur / 8}px)` : undefined,
              transform: blur ? 'scale(1.06)' : undefined,
            }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim / 100})` }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-end',
            padding: 12,
            color,
            fontWeight: 600,
          }}
        >
          {caption}
        </div>
      </div>
    </div>
  )
}

/** 頭像或橫幅的選檔 / 移除。選檔即上傳,不隨表單儲存 —— 要有預覽可看。 */
function ImagePicker({
  slot,
  label,
  url,
  maxBytes,
  children,
}: {
  slot: ClubImageSlot
  label: string
  url: string | null
  /** 上限走 `GET /club/config`(承辦後台調得動);拿不到時不自己編一個數字 */
  maxBytes: number | undefined
  children?: React.ReactNode
}) {
  const { message } = App.useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadClubImage()
  const remove = useRemoveClubImage()
  const [busy, setBusy] = useState(false)

  const pick = async (file: File) => {
    // 副檔名與魔術位元組都先驗:後端一樣會擋,但那要跑完一趟往返才知道
    if (!hasAllowedExtension(file.name, IMAGE_EXTENSIONS) || !(await isImageFile(file))) {
      message.error('請選擇圖片檔案')
      return
    }
    if (maxBytes != null && file.size > maxBytes) {
      message.error(`圖片不得超過 ${fmtMB(maxBytes)}`)
      return
    }
    setBusy(true)
    try {
      await upload.mutateAsync({ slot, file })
      message.success(`${label}已更新`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上傳失敗')
    } finally {
      setBusy(false)
    }
  }

  const drop = async () => {
    setBusy(true)
    try {
      await remove.mutateAsync(slot)
      message.success(`${label}已移除`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '移除失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={groupTitle}>{label}</div>
      {children}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // 選同一個檔案兩次也要觸發
            if (file) void pick(file)
          }}
        />
        <Tooltip
          title={`${maxBytes != null ? `${fmtMB(maxBytes)} 以內，` : ''}系統會置中裁切並轉為固定尺寸`}
        >
          <Button
            icon={<UploadOutlined />}
            loading={busy}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            選擇圖片
          </Button>
        </Tooltip>
        {url && (
          <Button icon={<DeleteOutlined />} danger loading={busy} disabled={busy} onClick={() => void drop()}>
            移除
          </Button>
        )}
      </div>
    </div>
  )
}

export default function PublicSection({ image, itemClass, dim, blur, textMode }: Props) {
  // 上限是後台可調的設定值,不是前端常數(design-guide §6)
  const maxBytes = useClubConfig().data?.uploadLimits.imgBytes
  return (
    <div className="card" style={{ padding: 24, marginTop: 16 }}>
      <div style={sectionTitle}>
        對外公開資料
        <Tooltip title="這一段填的內容會出現在免登入的社團導覽頁，空白的欄位不會顯示">
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--steel)', marginLeft: 8 }}>
            校外看得到
          </span>
        </Tooltip>
      </div>

      {/* ---- 形象圖 ---- */}
      <div className="form-grid-2" style={{ alignItems: 'start' }}>
        <ImagePicker slot="avatar" label="頭像" url={image.avatarUrl} maxBytes={maxBytes}>
          <div
            style={{
              width: 120,
              aspectRatio: String(CLUB_IMAGE_RATIO.avatar),
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--line)',
              background: image.avatarUrl ? undefined : 'var(--line)',
            }}
          >
            {image.avatarUrl && (
              <img
                src={image.avatarUrl}
                alt=""
                width={512}
                height={512}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        </ImagePicker>

        <ImagePicker slot="banner" label="橫幅" url={image.bannerUrl} maxBytes={maxBytes}>
          {/* 兩塊預覽都要給:模糊在字卡上不生效,只給一種會讓人調出對不上的效果 */}
          <div className="form-grid-2">
            <BannerPreview
              url={image.bannerUrl}
              dim={dim}
              blur={0}
              textMode={textMode}
              luma={image.bannerLuma}
              label="字卡樣式"
              caption="社團名稱"
            />
            <BannerPreview
              url={image.bannerUrl}
              dim={dim}
              blur={blur}
              textMode={textMode}
              luma={image.bannerLuma}
              label="詳細頁樣式"
              caption="社團名稱"
            />
          </div>
        </ImagePicker>
      </div>

      <div className="form-grid-2" style={{ marginTop: 16 }}>
        <Form.Item name="bannerDim" label="黑化程度" className={itemClass('bannerDim')}>
          <Slider min={0} max={100} />
        </Form.Item>
        <Form.Item
          name="bannerBlur"
          label="模糊程度"
          className={itemClass('bannerBlur')}
          tooltip="只作用在社團詳細頁的背景，字卡不套模糊"
        >
          <Slider min={0} max={100} />
        </Form.Item>
      </div>
      <Form.Item
        name="bannerTextMode"
        label="字色"
        className={itemClass('bannerTextMode')}
        tooltip="自動會依橫幅底部的明暗決定深色或淺色字"
      >
        <Segmented
          options={[
            { label: '自動', value: 'auto' },
            { label: '淺色字', value: 'light' },
            { label: '深色字', value: 'dark' },
          ]}
        />
      </Form.Item>

      {/* ---- 文字欄位 ---- */}
      <div className="form-grid-2">
        <Form.Item
          name="tagline"
          label="一句話介紹"
          className={itemClass('tagline')}
          rules={[{ max: 40, message: '一句話介紹最多 40 字' }]}
        >
          <Input placeholder="顯示在社團字卡上，例如：每週三晚上一起跳舞" maxLength={40} />
        </Form.Item>
        <Form.Item
          name="tags"
          label="標籤"
          className={itemClass('tags')}
          tooltip="供導覽頁篩選，例如：街舞、桌遊、程式"
          rules={[
            {
              validator: (_, v: string[] | undefined) =>
                (v ?? []).some((t) => t.length > MAX_TAG_LEN)
                  ? Promise.reject(new Error(`每個標籤最多 ${MAX_TAG_LEN} 字`))
                  : Promise.resolve(),
            },
          ]}
        >
          <Select mode="tags" maxCount={MAX_TAGS} placeholder={`最多 ${MAX_TAGS} 個`} open={false} />
        </Form.Item>
      </div>

      <div className="form-grid-2">
        <Form.Item name="recruitStatus" label="招生狀態" className={itemClass('recruitStatus')}>
          <Select
            allowClear
            placeholder="未設定時不顯示"
            options={RECRUIT_STATUSES.map((s) => ({ label: s, value: s }))}
          />
        </Form.Item>
        <Form.Item
          name="publicEmail"
          label="對外聯絡信箱"
          className={itemClass('publicEmail')}
          tooltip="公開在導覽頁上的窗口，與上方的聯絡通知信箱是兩回事"
          rules={[{ type: 'email', message: '信箱格式不正確' }]}
        >
          <Input placeholder="校外要找你們時寄的信箱" />
        </Form.Item>
      </div>

      <div style={groupTitle}>社群連結</div>
      <div className="form-grid-2">
        {SOCIAL_KINDS.map((kind) => (
          <Form.Item
            key={kind}
            name={SOCIAL_FIELDS[kind]}
            label={SOCIAL_LABELS[kind]}
            className={itemClass(SOCIAL_FIELDS[kind])}
            rules={[HTTP_URL]}
          >
            <Input placeholder="https://" />
          </Form.Item>
        ))}
      </div>

      <div className="form-grid-2">
        <Form.Item name="officeLocation" label="社辦位置" className={itemClass('officeLocation')}>
          <Input placeholder="例如：綜合教學大樓 B1" maxLength={50} />
        </Form.Item>
        <Form.Item name="foundedYear" label="成立年份" className={itemClass('foundedYear')}>
          <InputNumber min={1900} max={2100} style={{ width: '100%' }} placeholder="西元年" />
        </Form.Item>
      </div>

      <Form.Item
        name="regularSchedule"
        label="例行活動時間"
        className={itemClass('regularSchedule')}
      >
        <Input.TextArea rows={2} maxLength={200} placeholder="例如：每週三 19:00 於體育館二樓" />
      </Form.Item>
      <Form.Item name="joinInfo" label="入社方式與社費" className={itemClass('joinInfo')}>
        <Input.TextArea rows={3} maxLength={500} placeholder="怎麼加入、社費多少、有沒有試上" />
      </Form.Item>
      <Form.Item
        name="signupUrl"
        label="報名連結"
        className={itemClass('signupUrl')}
        rules={[HTTP_URL]}
        style={{ marginBottom: 0 }}
      >
        <Input placeholder="https://" />
      </Form.Item>
    </div>
  )
}
