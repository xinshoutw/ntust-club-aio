import { useReducer, useState } from 'react'
import { Link, useParams } from 'react-router'
import { App, Button, Upload } from 'antd'
import { LeftOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { AWARDS, slotFiles, uploadProgress } from './store'
import { releaseFile, toEvalFile } from './files'
import type { AwardKey, EvalFile } from './types'
import FilePreview from './FilePreview'

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp'

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
          找不到此獎項。
        </div>
      </div>
    )
  }

  const progress = uploadProgress(award)
  const groups = [...new Set(award.slots.map((s) => s.group))]

  const addFiles = async (slotKey: string, f: File) => {
    slotFiles(award.key, slotKey).push(await toEvalFile(f))
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
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>上傳進度</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
                {progress.done}/{progress.total}
              </div>
            </div>
          }
        />
      </div>
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        依評分細項上傳佐證資料(PDF、Word、圖片)。
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
