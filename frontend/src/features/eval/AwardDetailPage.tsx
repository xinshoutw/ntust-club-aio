import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { App, Button, Upload } from 'antd'
import { LeftOutlined, UploadOutlined } from '@ant-design/icons'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { useAuth } from '../../app/auth'
import { fmtMB, isImageFile, sha256 } from '../../lib/uploads'
import { useAwardDetail, useEvalUploadMutations, type AwardRubricItem, type AwardUploadFile } from '../../api/eval'
import { fetchFile } from '../../api/client'
import { fileTypeOf, AWARD_BRIEFS, type EvalFile } from './types'
import FilePreview from './FilePreview'

// 對齊後端 EVAL_POLICY:pdf/doc/docx/jpg/jpeg/png/zip,單檔 50MB
const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.zip'
const MAX_FILE_BYTES = 50 * 1024 * 1024

function BackLink() {
  return (
    <Link to="/eval" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <LeftOutlined style={{ fontSize: 12 }} />
      返回資料總覽
    </Link>
  )
}

// 獎項詳細頁:評分細項(後端逐年 rubric)→ 上傳槽位(狀態、即時預覽)
export default function AwardDetailPage() {
  const { award: awardKey } = useParams()
  const { user } = useAuth()
  const { message } = App.useApp()
  const { data: award, isError, error, refetch } = useAwardDetail(awardKey)
  const { upload, remove } = useEvalUploadMutations(awardKey ?? '')
  // 本次 session 上傳檔的 SHA-256(uploadId → hash):同獎項內容去重(沿改版前跨槽位語意);
  // 後端另有未開放/型別/容量重驗,拒絕時以 message.error 顯示(跨 session 去重目前後端未做)
  const sessionHashes = useRef(new Map<number, string>())
  const [preview, setPreview] = useState<EvalFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // 手上還沒有資料才換成錯誤(同 ClubSettingsPage):上傳/刪除都會 invalidate,
  // 那次重抓失敗不該把整頁連已上傳清單一起換掉。真的「不存在」幾乎不可能 ——
  // 獎項 id 來自後端自己的清單,所以失敗一律當錯誤處理、給重試
  if (!award) {
    return (
      <div>
        <BackLink />
        {isError ? (
          <div style={{ marginTop: 12 }}>
            <QueryError title="獎項資料載入失敗" error={error} onRetry={() => void refetch()} />
          </div>
        ) : (
          <LoadingBlock pending rows={6} />
        )}
      </div>
    )
  }

  const uploadable = award.items.filter((i) => !i.isAdminItem)
  const progress = {
    done: uploadable.filter((i) => i.uploads.length > 0).length,
    total: uploadable.length,
  }

  // 依後端排序分組(group_label 相同者相鄰)
  const groups: { label: string; items: AwardRubricItem[] }[] = []
  for (const item of award.items) {
    const last = groups[groups.length - 1]
    if (last && last.label === item.groupLabel) last.items.push(item)
    else groups.push({ label: item.groupLabel, items: [item] })
  }

  const addFile = async (item: AwardRubricItem, f: File) => {
    if (f.size > MAX_FILE_BYTES) {
      message.error(`「${f.name}」超過單檔 50 MB 上限`)
      return
    }
    // 宣稱是圖片的檔案驗魔術位元組(其餘型別由後端重驗)
    if (fileTypeOf(f.name) === 'image' && !(await isImageFile(f))) {
      message.error(`「${f.name}」不是有效的圖片檔`)
      return
    }
    const hash = await sha256(f)
    if ([...sessionHashes.current.values()].includes(hash)) {
      message.error(`「${f.name}」檔案重複`)
      return
    }
    upload.mutate(
      { itemId: item.id, file: f },
      {
        onSuccess: (uploaded) => {
          sessionHashes.current.set(uploaded.uploadId, hash)
          message.success(`已上傳「${f.name}」`)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const removeFile = (item: AwardRubricItem, f: AwardUploadFile) => {
    remove.mutate(
      { itemId: item.id, uploadId: f.uploadId },
      {
        onSuccess: () => sessionHashes.current.delete(f.uploadId),
        onError: (e) => message.error(e.message),
      },
    )
  }

  const openPreview = async (f: EvalFile) => {
    // docx 預覽需要原始檔內容(mammoth);伺服器檔案先抓回 blob 再開
    if (f.type === 'doc' && !f.raw) {
      try {
        const blob = await (await fetchFile(f.url)).blob()
        f = { ...f, raw: new File([blob], f.name) }
      } catch {
        // 抓取失敗:仍開啟預覽視窗,由 DocView 顯示無法預覽說明
      }
    }
    setPreview(f)
    setPreviewOpen(true)
  }

  return (
    <div>
      <BackLink />
      <div style={{ marginTop: 12 }}>
        <PageHeader
          title={award.name}
          sub={
            <>
              {user?.club} · {AWARD_BRIEFS[award.id] ?? ''}
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

      {award.items.length === 0 && (
        <div className="card" style={{ marginTop: 16, padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--steel)' }}>
          {award.year} 年度評分項目尚未建立，請待學務處公告
        </div>
      )}

      {groups.map((g) => (
        <div className="card" key={g.label || g.items[0].id} style={{ marginTop: 16 }}>
          {g.label && <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 6px' }}>{g.label}</div>}
          {g.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>配分 {item.maxScore}</span>
                </div>
                {item.help && (
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 3, lineHeight: 1.7 }}>{item.help}</div>
                )}
                {item.uploads.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 6 }}>
                    已使用 <span className="num">{fmtMB(item.uploads.reduce((s, f) => s + f.size, 0))}</span> MB(單檔上限{' '}
                    <span className="num">50</span> MB)
                  </div>
                )}
                {item.uploads.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {item.uploads.map((f) => (
                      <span key={f.uploadId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px' }}>
                        <button type="button" className="link-btn" style={{ padding: 0, fontSize: 12 }} onClick={() => void openPreview(f)}>
                          {f.name}
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          aria-label={`移除 ${f.name}`}
                          style={{ padding: '0 2px', fontSize: 12 }}
                          onClick={() => removeFile(item, f)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {item.isAdminItem ? (
                <span style={{ fontSize: 12, color: 'var(--steel)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                  自動採計
                </span>
              ) : (
                <Upload
                  accept={ACCEPT}
                  multiple
                  showUploadList={false}
                  beforeUpload={(f) => {
                    void addFile(item, f)
                    return false
                  }}
                >
                  <Button size="small" style={{ height: 30 }} icon={<UploadOutlined />} loading={upload.isPending}>
                    上傳
                  </Button>
                </Upload>
              )}
            </div>
          ))}
        </div>
      ))}

      <FilePreview file={preview} open={previewOpen} onClose={() => setPreviewOpen(false)} afterClose={() => setPreview(null)} />
    </div>
  )
}
