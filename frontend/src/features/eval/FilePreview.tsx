import { useEffect, useState } from 'react'
import { Modal } from 'antd'
import type { EvalFile } from './types'

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220, color: 'var(--steel)', fontSize: 13, textAlign: 'center', padding: 24 }}>
      {children}
    </div>
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

  if (!file.raw) return <Center>示意檔案無實際內容;實際上傳的 .docx 可在此預覽。</Center>
  if (error) return <Center>無法解析此文件(舊版 .doc 僅支援下載):{error}</Center>
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
  open: boolean
  onClose: () => void
  afterClose: () => void
}

// 檔案即時預覽:圖片(img)、PDF(瀏覽器原生 iframe)、doc/docx(mammoth)
export default function FilePreview({ file, open, onClose, afterClose }: FilePreviewProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      footer={null}
      width={840}
      title={
        file && (
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{file.name}</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>
              {fmtSize(file.size)} · {file.uploadedAt}
            </span>
          </span>
        )
      }
    >
      {file?.type === 'image' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
          <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 4 }} />
        </div>
      )}
      {file?.type === 'pdf' &&
        (file.url ? (
          <iframe src={file.url} title={file.name} style={{ width: '100%', height: '65vh', border: '1px solid var(--line)', borderRadius: 6 }} />
        ) : (
          <Center>示意檔案無實際內容;實際上傳的 PDF 可在此預覽。</Center>
        ))}
      {file?.type === 'doc' && <DocView file={file} />}
      {file?.type === 'other' && <Center>此檔案格式不支援預覽(支援圖片、PDF、DOC/DOCX)。</Center>}
    </Modal>
  )
}
