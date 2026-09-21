// 管理項目的「對外公開資料」全寬區塊:這裡填的每一欄都會出現在免登入的社團導覽頁,
// 因此獨立成一段擺在對內設定之上 —— 與聯絡通知並排會讓人分不出哪些欄位校外看得到。
import { useRef } from 'react'
import { App, Button, Form, Input, Segmented, Tooltip } from 'antd'
import { DeleteOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons'
import { useClubConfig } from '../../api/clubConfig'
import {
  CLUB_IMAGE_RATIO,
  CLUB_TAGS,
  MAX_TAGS,
  RECRUIT_STATUSES,
  useRemoveClubImage,
  useUploadClubImage,
  type ClubImageSlot,
  type ClubPublicProfile,
} from '../../api/clubProfile'
import {
  IMAGE_ACCEPT,
  IMAGE_EXTENSIONS,
  fmtMB,
  hasAllowedExtension,
  isImageFile,
} from '../../lib/uploads'
import type { SettingsValues } from './fields'

const HTTP_URL = { pattern: /^https?:\/\//, message: '需以 http(s) 開頭' }

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600 }
const IMAGE_FRAME_HEIGHT = 132
const subhead: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--steel)',
  fontWeight: 500,
  paddingBottom: 8,
  borderBottom: '1px solid var(--line)',
  margin: '24px 0 16px',
}

interface Props {
  image: ClubPublicProfile
  /** 社團名稱與英文名稱:學務處維護(行政端管理項目),這裡唯讀 */
  name: string
  enName: string
  itemClass: (k: keyof SettingsValues) => string | undefined
  /** 開公開頁預覽;有未儲存變更時由呼叫端先提醒 */
  onPreview: () => void
  /** false = 已被行政端下架,公開頁一律 404,預覽沒有東西可看 */
  publicVisible: boolean
  /** 網頁連結與詳細介紹的必填規則(D-19);只在這次真的要存 profile 時擋 */
  requiredOnSave: (msg: string) => { validator: (_: unknown, v: string | undefined) => Promise<void> }
}

/** 頭像或橫幅的選檔 / 移除。選檔即上傳,不隨表單儲存 —— 要有預覽可看。 */
function ImagePicker({
  slot,
  label,
  url,
  maxBytes,
}: {
  slot: ClubImageSlot
  label: string
  url: string | null
  /** 上限走 `GET /club/config`(承辦後台調得動);拿不到時不自己編一個數字 */
  maxBytes: number | undefined
}) {
  const { message } = App.useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadClubImage()
  const remove = useRemoveClubImage()

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
    try {
      await upload.mutateAsync({ slot, file })
      message.success(`${label}已更新`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上傳失敗')
    }
  }

  const drop = async () => {
    try {
      await remove.mutateAsync(slot)
      message.success(`${label}已移除`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '移除失敗')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--steel)' }}>{label}</div>
      {/* 寬度由各自的比例推出來(頭像 1:1 → 132、橫幅 3:1 → 396),欄夠寬時兩個框等高。
          `height` + `maxWidth` 的寫法在欄寬不足時會把比例壓掉,社團看到的裁切就不是
          公開頁上的那一張 —— 比例要優先於上下緣對齊 */}
      <div
        style={{
          width: `min(100%, ${IMAGE_FRAME_HEIGHT * CLUB_IMAGE_RATIO[slot]}px)`,
          aspectRatio: String(CLUB_IMAGE_RATIO[slot]),
          border: '1px solid var(--line)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--line)',
        }}
      >
        {url && (
          <img
            src={url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          // `hidden` 屬性會被 antd 的 `input { display: inline-block }` 蓋掉,
          // 原生的「選擇檔案」鈕就整顆露出來,畫面上變成兩顆按鈕
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // 選同一個檔案兩次也要觸發
            if (file) void pick(file)
          }}
        />
        {/* 各自轉各自的圈:共用一個 busy 的話,按「移除」時「更換圖片」也跟著轉,
            看起來像兩件事同時在跑 */}
        <Button
          icon={<UploadOutlined />}
          loading={upload.isPending}
          disabled={upload.isPending || remove.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {url ? '更換圖片' : '選擇圖片'}
        </Button>
        {url && (
          <Button
            icon={<DeleteOutlined />}
            danger
            loading={remove.isPending}
            disabled={upload.isPending || remove.isPending}
            onClick={() => void drop()}
          >
            移除
          </Button>
        )}
      </div>
    </div>
  )
}

/** 標籤挑選:主檔固定選項,選滿即停用其餘。
 *
 *  受控元件,value/onChange 由 Form.Item 注入,所以不自己持狀態。 */
function TagPicker({ value = [], onChange }: { value?: string[]; onChange?: (v: string[]) => void }) {
  const full = value.length >= MAX_TAGS
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {CLUB_TAGS.map((tag) => {
        const on = value.includes(tag)
        return (
          <Button
            key={tag}
            size="small"
            type={on ? 'primary' : 'default'}
            ghost={on}
            // 選取只用顏色表達的話,螢幕閱讀器聽到的 14 顆按鈕完全一樣(WCAG 1.4.1)
            aria-pressed={on}
            title={!on && full ? `最多選 ${MAX_TAGS} 個` : undefined}
            disabled={!on && full}
            onClick={() => onChange?.(on ? value.filter((t) => t !== tag) : [...value, tag])}
          >
            {tag}
          </Button>
        )
      })}
    </div>
  )
}

export default function PublicSection({
  image,
  name,
  enName,
  itemClass,
  onPreview,
  publicVisible,
  requiredOnSave,
}: Props) {
  // 上限是後台可調的設定值,不是前端常數(design-guide §6)
  const maxBytes = useClubConfig().data?.uploadLimits.imgBytes

  return (
    <div className="card" style={{ padding: 24, marginTop: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={sectionTitle}>公開資料</span>
        </div>
        {/* span:disabled 的 form control 收不到滑鼠事件,tooltip 永遠不會出現 ——
            而按不動的時候正是唯一需要解釋原因的時候(同 AccountsPage 的權限鈕) */}
        <Tooltip title={publicVisible ? undefined : '學務處已將這個社團從導覽頁下架，公開頁目前不會顯示'}>
          <span>
            <Button icon={<EyeOutlined />} onClick={onPreview} disabled={!publicVisible}>
              預覽
            </Button>
          </span>
        </Tooltip>
      </div>

      {/* 這兩張圖選檔即上傳,不隨下方的「儲存」—— 不說的話換完圖的人會去按儲存,
          然後被告知「沒有變更」,看起來像圖沒存成功 */}
      <div style={subhead}>形象圖（選擇後即儲存）</div>
      <div className="form-grid-2" style={{ alignItems: 'start' }}>
        <ImagePicker
          slot="avatar"
          label="頭像（1:1）"
          url={image.avatarUrl}
          maxBytes={maxBytes}
        />
        <ImagePicker
          slot="banner"
          label="橫幅（3:1）"
          url={image.bannerUrl}
          maxBytes={maxBytes}
        />
      </div>

      <div style={subhead}>社團資訊</div>
      <div className="form-grid-2">
        <Form.Item label="社團名稱">
          <Input readOnly value={name} style={{ background: 'var(--paper)' }} />
        </Form.Item>
        <Form.Item label="英文名稱">
          <Input readOnly value={enName} placeholder="尚未設定" style={{ background: 'var(--paper)' }} />
        </Form.Item>
      </div>
      <Form.Item
        name="tagline"
        label="簡短介紹"
        className={itemClass('tagline')}
        rules={[{ max: 40, message: '最多 40 字' }]}
      >
        <Input placeholder="我們是一群喜愛科技的白帽駭客" maxLength={40} />
      </Form.Item>
      <Form.Item
        name="intro"
        label="詳細介紹"
        className={itemClass('intro')}
        required // 必填的星號:規則是自訂 validator,AntD 推導不出來
        rules={[requiredOnSave('請填寫詳細介紹')]}
      >
        <Input.TextArea rows={3} placeholder="社團宗旨、特色" />
      </Form.Item>
      <Form.Item
        name="tags"
        label="標籤"
        className={itemClass('tags')}
        tooltip={`最多 ${MAX_TAGS} 個`}
      >
        <TagPicker />
      </Form.Item>

      <div style={subhead}>聯絡方式</div>
      <div className="form-grid-2">
        <Form.Item
          name="publicEmail"
          label="公開聯絡信箱"
          className={itemClass('publicEmail')}
          rules={[{ type: 'email', message: '信箱格式不正確' }]}
        >
          <Input placeholder="contact@ntust.edu.tw" />
        </Form.Item>
        <Form.Item
          name="instagram"
          label="Instagram"
          className={itemClass('instagram')}
        >
          <Input prefix="instagram.com/" placeholder="ntust-hacking" />
        </Form.Item>
      </div>
      <Form.Item
        name="url"
        label="網頁連結"
        className={itemClass('url')}
        required
        rules={[requiredOnSave('請填寫社團網頁連結'), { type: 'url', message: '網址格式不正確' }]}
      >
        <Input placeholder="https://ntust.edu.tw" />
      </Form.Item>
      <Form.Item name="signupUrl" label="報名連結" className={itemClass('signupUrl')} rules={[HTTP_URL]}>
        <Input placeholder="https://forms.gle/join-us" />
      </Form.Item>

      <div style={subhead}>其他資訊</div>
      <div className="form-grid-2">
        <Form.Item name="officeLocation" label="社辦位置" className={itemClass('officeLocation')}>
          <Input placeholder="S201" maxLength={30} />
        </Form.Item>
        <Form.Item name="recruitStatus" label="招生狀態" className={itemClass('recruitStatus')}>
          <Segmented
            options={[
              { label: '未設定', value: '' },
              ...RECRUIT_STATUSES.map((s) => ({ label: s, value: s })),
            ]}
          />
        </Form.Item>
      </div>
      <Form.Item name="regularSchedule" label="例行活動時間" className={itemClass('regularSchedule')}>
        <Input.TextArea rows={2} maxLength={200} placeholder="每週三 19:00 於 TR 上課，詳情請見 IG 貼文" />
      </Form.Item>
      <Form.Item
        name="joinInfo"
        label="入社方式與社費"
        className={itemClass('joinInfo')}
        style={{ marginBottom: 0 }}
      >
        <Input.TextArea rows={3} maxLength={500} placeholder="可否試聽、如何加入、社費多少" />
      </Form.Item>
    </div>
  )
}
