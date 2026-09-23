import { useEffect, useState } from 'react'
import { Image, Modal } from 'antd'
import type { EvalFile } from './types'

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', minHeight: 220, color: 'var(--steel)', fontSize: 13, textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  )
}

// 無法線上預覽的實體檔(zip、舊版 .doc 等)給下載入口;mock 示意檔(url 空)不顯示
function DownloadLink({ file }: { file: EvalFile }) {
  if (!file.url) return null
  return (
    <a href={file.url} download={file.name} style={{ fontSize: 13 }}>
      下載「{file.name}」
    </a>
  )
}

// docx → HTML(mammoth 動態載入)→ DOMPurify 白名單消毒
function DocView({ file }: { file: EvalFile }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file.raw) return
    let cancelled = false
    ;(async () => {
      try {
        const [{ default: mammoth }, { default: DOMPurify }, buf] = await Promise.all([
          import('mammoth/mammoth.browser'),
          import('dompurify'),
          file.raw!.arrayBuffer(),
        ])
        if (cancelled) return
        const result = await mammoth.convertToHtml({ arrayBuffer: buf })
        if (cancelled) return
        const clean = String(
          DOMPurify.sanitize(result.value || '<p>(空白文件)</p>', {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['style'],
            FORBID_ATTR: ['style', 'id', 'class'],
          }),
        )
        setHtml(clean)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  if (!file.raw) {
    return (
      <Center>
        {file.url ? '此文件無法線上預覽，請下載後檢視' : '純示意檔案'}
        <DownloadLink file={file} />
      </Center>
    )
  }
  if (error) {
    return (
      <Center>
        無法解析此文件(舊版 .doc 僅支援下載):{error}
        <DownloadLink file={file} />
      </Center>
    )
  }
  if (html == null) return <Center>解析文件中…</Center>
  return (
    <div
      style={{ background: '#fff', padding: '28px 32px', lineHeight: 1.75, fontSize: 14, maxHeight: '62vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface FilePreviewProps {
  file: EvalFile | null
  /** 與 file 同一組的檔案(同一欄附件、同一個評分細項):其中的圖片在預覽裡左右切換 */
  group?: readonly EvalFile[]
  open: boolean
  onClose: () => void
  afterClose: () => void
}

interface ImageViewerProps {
  images: readonly EvalFile[]
  start: number
  open: boolean
  onClose: () => void
  afterClose: () => void
}

// 圖片走 AntD 內建的預覽(縮放、旋轉、同一組左右切換),與社團頁的活動彈窗同一套。
// 只渲染預覽層、沒有縮圖:呼叫端的入口是檔名連結。`afterOpenChange` 在離場動畫結束才觸發,
// 等同 Modal 的 afterClose —— 提早清掉 file 會讓關閉中的那張圖先變成破圖
function ImageViewer({ images, start, open, onClose, afterClose }: ImageViewerProps) {
  const [current, setCurrent] = useState(start)
  return (
    <Image.PreviewGroup
      items={images.map((f) => ({ src: f.url, alt: f.name }))}
      preview={{
        open,
        current,
        // 成組時 rc-image 不把 items 的 alt 交給預覽層:在這裡給,圖片與預覽對話框才有名字
        alt: images[current]?.name,
        onChange: setCurrent,
        onOpenChange: (next) => {
          if (!next) onClose()
        },
        afterOpenChange: (next) => {
          if (!next) afterClose()
        },
      }}
    />
  )
}

// 檔案即時預覽:圖片交給 AntD 的圖片預覽,PDF(瀏覽器原生 iframe)與 doc/docx(mammoth)開彈窗
// zIndex 高於一般 Modal:預覽常由其他 popup 內開啟,避免被蓋住
export default function FilePreview({ file, group, open, onClose, afterClose }: FilePreviewProps) {
  if (file?.type === 'image') {
    // 同一組裡的圖片才切得過去;組裡找不到自己(呼叫端傳錯)就只看這一張,不要開到別張
    const images = group?.some((f) => f.id === file.id)
      ? group.filter((f) => f.type === 'image')
      : [file]
    return (
      <ImageViewer
        // 換一張圖從頭開:起始位置只在掛載時讀一次
        key={file.id}
        images={images}
        start={images.findIndex((f) => f.id === file.id)}
        open={open}
        onClose={onClose}
        afterClose={afterClose}
      />
    )
  }
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      footer={null}
      width={1100}
      zIndex={1100}
      title={
        file && (
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{file.name}</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>
              {/* 上傳時間可能未提供(如評審端受評資料),略過分隔符 */}
              {fmtSize(file.size)}
              {file.uploadedAt && ` · ${file.uploadedAt}`}
            </span>
          </span>
        )
      }
    >
      {file?.type === 'pdf' &&
        (file.url ? (
          <iframe
            // PDF open params:預設收起左側目錄/縮圖窗格
            src={`${file.url}#pagemode=none&navpanes=0`}
            title={file.name}
            style={{ width: '100%', height: '76vh', border: '1px solid var(--line)', borderRadius: 6 }}
          />
        ) : (
          <Center>示意檔案無實際內容;實際上傳的 PDF 可在此預覽</Center>
        ))}
      {file?.type === 'doc' && <DocView file={file} />}
      {file?.type === 'other' && (
        <Center>
          此檔案格式不支援預覽(支援圖片、PDF、DOC/DOCX)
          <DownloadLink file={file} />
        </Center>
      )}
    </Modal>
  )
}
