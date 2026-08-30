import { useRef } from 'react'
import { App, Upload } from 'antd'
import { FileTextOutlined, InboxOutlined } from '@ant-design/icons'
import { fmtMB, sha256 } from '../../lib/uploads'

// 全站統一的拖放上傳區:SHA-256 內容去重、單檔/加總容量驗證、
// 下方標示已使用容量與上限、自訂檔案列(移除鈕)。受控元件(value/onChange)。

export interface BagFile {
  key: string
  file: File
  hash: string
}

let bagSeq = 0

interface AttachmentAreaProps {
  value: BagFile[]
  onChange: (next: BagFile[]) => void
  accept: string
  hint: string
  /** 魔術位元組等單檔驗證:回傳錯誤訊息或 null */
  validate?: (f: File) => Promise<string | null>
  maxFileBytes?: number
  /** 加總上限(總量,不是扣掉已用的剩餘量) */
  maxTotalBytes?: number
  /** 已佔用但不在 value 裡的量(如單據上既有的附件),計入顯示與加總檢核 */
  usedBytes?: number
  maxCount?: number
  /** 送出驗證未通過時的紅框標示 */
  error?: boolean
}

export default function AttachmentArea({
  value,
  onChange,
  accept,
  hint,
  validate,
  maxFileBytes,
  maxTotalBytes,
  usedBytes = 0,
  maxCount,
  error,
}: AttachmentAreaProps) {
  const { message } = App.useApp()
  // 逐檔序列化處理(sha256 為非同步,多檔同時拖入時避免 race);
  // valueRef 讓佇列讀到剛提交的清單,不受 render 時序影響
  const queue = useRef(Promise.resolve())
  const valueRef = useRef(value)
  valueRef.current = value

  const commit = (next: BagFile[]) => {
    valueRef.current = next
    onChange(next)
  }

  const add = (f: File) => {
    queue.current = queue.current.then(async () => {
      try {
        const cur = valueRef.current
        if (maxCount != null && cur.length >= maxCount) {
          message.error({ content: `最多 ${maxCount} 個檔案`, key: 'attach-count' })
          return
        }
        if (maxFileBytes != null && f.size > maxFileBytes) {
          message.error(`「${f.name}」超過單檔 ${Math.round(maxFileBytes / 1024 / 1024)} MB 上限`)
          return
        }
        const staged = usedBytes + cur.reduce((s, b) => s + b.file.size, 0)
        if (maxTotalBytes != null && staged + f.size > maxTotalBytes) {
          message.error({ content: `檔案合計超過 ${Math.round(maxTotalBytes / 1024 / 1024)} MB 上限`, key: 'attach-total' })
          return
        }
        const err = validate ? await validate(f) : null
        if (err) {
          message.error(`「${f.name}」${err}`)
          return
        }
        const hash = await sha256(f)
        if (valueRef.current.some((b) => b.hash === hash)) {
          message.error(`「${f.name}」檔案重複`)
          return
        }
        commit([...valueRef.current, { key: `bag${++bagSeq}`, file: f, hash }])
      } catch (e) {
        message.error(`檔案處理失敗：${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  const totalBytes = usedBytes + value.reduce((s, b) => s + b.file.size, 0)

  return (
    <div>
      <Upload.Dragger
        multiple={maxCount !== 1}
        accept={accept}
        fileList={[]}
        beforeUpload={(f) => {
          add(f)
          return false
        }}
        showUploadList={false}
        style={{
          background: 'transparent',
          ...(error ? { borderColor: '#C13B34' } : {}),
        }}
      >
        <p style={{ margin: '4px 0 8px' }}>
          <InboxOutlined style={{ fontSize: 28, color: 'var(--steel)' }} />
        </p>
        <p style={{ fontSize: 13, color: 'var(--steel)', margin: 0 }}>{hint}</p>
        <p style={{ fontSize: 12, color: 'var(--steel)', margin: '4px 0 0' }}>
          已使用{' '}
          <span className="num">
            {fmtMB(totalBytes)}
            {maxTotalBytes != null ? ` / ${Math.round(maxTotalBytes / 1024 / 1024)}` : ''}
          </span>{' '}
          MB
        </p>
      </Upload.Dragger>
      {value.map((b) => (
        <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px 2px', fontSize: 13 }}>
          <FileTextOutlined style={{ color: 'var(--steel)' }} />
          <span style={{ fontWeight: 500 }}>{b.file.name}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{fmtMB(b.file.size)} MB</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="link-btn danger" onClick={() => commit(value.filter((x) => x.key !== b.key))}>
            移除
          </button>
        </div>
      ))}
    </div>
  )
}
