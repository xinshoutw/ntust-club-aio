import { useReducer, useState } from 'react'
import { Link, useParams } from 'react-router'
import { App, Button, Upload } from 'antd'
import { LeftOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { fmtMB, isImageFile, sha256 } from '../../lib/uploads'
import { AWARDS, slotFiles, uploadProgress } from './store'
import { releaseFile, toEvalFile } from './files'
import { fileTypeOf, type AwardDef, type AwardKey, type EvalFile } from './types'
import FilePreview from './FilePreview'

// 圖片一律含 HEIC/HEIF 等特規格式;文件收 PDF/Word
const ACCEPT = '.pdf,.doc,.docx,image/*,.heic,.heif,.avif'
const MAX_FILE_BYTES = 50 * 1024 * 1024

// 同一獎項底下所有槽位已上傳檔案的 hash(跨槽位去重)
const awardHashes = (award: AwardDef): Set<string> => {
  const set = new Set<string>()
  for (const slot of award.slots) {
    for (const f of slotFiles(award.key, slot.key)) if (f.hash) set.add(f.hash)
  }
  return set
}

// 獎項詳細頁:評分細項 → 上傳槽位(狀態、即時預覽)
export default function AwardDetailPage() {
  const { award: awardKey } = useParams()
  const { user } = useAuth()
  const { message } = App.useApp()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [preview, setPreview] = useState<EvalFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const award = AWARDS.find((a) => a.key === (awardKey as AwardKey))

  if (!award) {
    return (
      <div>
        <Link to="/eval" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <LeftOutlined style={{ fontSize: 12 }} />
          返回資料總覽
        </Link>
        <div className="card" style={{ marginTop: 16, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
          找不到此獎項
        </div>
      </div>
    )
  }

  const progress = uploadProgress(award)
  const groups = [...new Set(award.slots.map((s) => s.group))]

  const addFiles = async (slotKey: string, f: File) => {
    if (f.size > MAX_FILE_BYTES) {
      message.error(`「${f.name}」超過單檔 50 MB 上限`)
      return
    }
    // 宣稱是圖片的檔案驗魔術位元組(PDF 的降級檢查在 toEvalFile)
    if (fileTypeOf(f.name) === 'image' && !(await isImageFile(f))) {
      message.error(`「${f.name}」不是有效的圖片檔`)
      return
    }
    const hash = await sha256(f)
    if (awardHashes(award).has(hash)) {
      message.error(`「${f.name}」與已上傳的檔案內容相同,已拒絕重複上傳`)
      return
    }
    slotFiles(award.key, slotKey).push(await toEvalFile(f, hash))
    message.success(`已上傳「${f.name}」`)
    force()
  }

  const openPreview = (f: EvalFile) => {
    setPreview(f)
    setPreviewOpen(true)
  }

  return (
    <div>
      <Link to="/eval" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <LeftOutlined style={{ fontSize: 12 }} />
        返回資料總覽
      </Link>
      <div style={{ marginTop: 12 }}>
        <PageHeader
          title={award.name}
          sub={
            <>
              {user?.club} · {award.brief}
            </>
          }
          extra={
            <div style={{ textAlign: 'right', height: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.1 }}>上傳進度</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>
                {progress.done}/{progress.total}
              </div>
            </div>
          }
        />
      </div>

      {groups.map((g) => (
        <div className="card" key={g} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 6px' }}>{g}</div>
          {award.slots
            .filter((s) => s.group === g)
            .map((slot) => {
              const files = slotFiles(award.key, slot.key)
              return (
                <div key={slot.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{slot.name}</span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{slot.weight}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 3, lineHeight: 1.7 }}>
                      {slot.hints.join(';')}
                    </div>
                    {files.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 6 }}>
                        已使用 <span className="num">{fmtMB(files.reduce((s, f) => s + f.size, 0))}</span> MB(單檔上限{' '}
                        <span className="num">50</span> MB)
                      </div>
                    )}
                    {files.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {files.map((f) => (
                          <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px' }}>
                            <button type="button" className="link-btn" style={{ padding: 0, fontSize: 12 }} onClick={() => openPreview(f)}>
                              {f.name}
                            </button>
                            <button
                              type="button"
                              className="link-btn danger"
                              aria-label={`移除 ${f.name}`}
                              style={{ padding: '0 2px', fontSize: 12 }}
                              onClick={() => {
                                const list = slotFiles(award.key, slot.key)
                                list.splice(list.findIndex((x) => x.id === f.id), 1)
                                releaseFile(f)
                                force()
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {slot.auto ? (
                    <span style={{ fontSize: 12, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                      {slot.auto}
                    </span>
                  ) : (
                    <Upload
                      accept={ACCEPT}
                      multiple
                      showUploadList={false}
                      beforeUpload={(f) => {
                        void addFiles(slot.key, f)
                        return false
                      }}
                    >
                      <Button size="small" style={{ height: 30 }} icon={<UploadOutlined />}>
                        上傳
                      </Button>
                    </Upload>
                  )}
                </div>
              )
            })}
        </div>
      ))}

      <FilePreview file={preview} open={previewOpen} onClose={() => setPreviewOpen(false)} afterClose={() => setPreview(null)} />
    </div>
  )
}
