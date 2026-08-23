import { App, Button, Modal, Tooltip } from 'antd'
import { DownloadOutlined, FileTextOutlined, LinkOutlined } from '@ant-design/icons'
import LoadingBlock from '../../components/ui/LoadingBlock'
import QueryError from '../../components/ui/QueryError'
import SectionTitle from '../../components/ui/SectionTitle'
import StatusPill from '../../components/ui/StatusPill'
import { downloadEvalFile, downloadPhotosZip } from '../eval/files'
import type { EvalFile } from '../eval/types'
import {
  activityApplyPdf,
  type ClubActivity,
  type ClubActivityDetail,
} from '../../api/activities'
import { approvedText, fmtMoney, money, showsApproved } from './types'
import DownloadMenu from './DownloadMenu'
import WorkTable from './WorkTable'
import { TIME_RANGE_SEP, dateRangeText } from './utils'

// 活動詳情彈窗:社團端活動列表與行政端唯讀檢視共用同一份版面
// (「介面與社團端相同」是行政端那兩頁的需求本身,不是巧合 —— 不要再刻一份)。
// 唯讀開啟時不傳 onEdit / onGoClose,footer 自然收掉。

// 經費:欄寬一律由內容決定(max-content),明細列與合計以 subgrid 共用同一組軌道 ——
// 各自開一個 grid 的話兩邊會各自算寬度,數字就對不齊了
const budgetGrid = (withApproved: boolean): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `max-content 1fr max-content max-content${withApproved ? ' max-content' : ''}`,
  columnGap: 16,
})
const BUDGET_ROW: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' }

// 檔名可點預覽,右側附下載鈕
function FileChip({ f, onPreview }: { f: EvalFile; onPreview: (f: EvalFile) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px' }}>
      <FileTextOutlined style={{ color: 'var(--steel)' }} />
      <button type="button" className="link-btn" style={{ padding: 0, fontSize: 12 }} onClick={() => onPreview(f)}>
        {f.name}
      </button>
      <button type="button" className="link-btn" aria-label={`下載 ${f.name}`} style={{ padding: '0 2px' }} onClick={() => downloadEvalFile(f)}>
        <DownloadOutlined style={{ fontSize: 12, color: 'var(--steel)' }} />
      </button>
    </span>
  )
}

// 詳情彈窗的分區標題
// 與申請不一致的實際值:直接取代申請值並以色彩標示,hover 顯示預計值
function ActualValue({ actual, planned }: { actual: React.ReactNode; planned: string }) {
  return (
    <Tooltip mouseEnterDelay={0} title={<span style={{ fontSize: 14 }}>預計 {planned}</span>}>
      <span className="num" style={{ color: '#8A5A00', borderBottom: '1px dotted #8A5A00', cursor: 'help' }}>{actual}</span>
    </Tooltip>
  )
}

export default function ActivityPreviewModal({ a, detail, loading, error, onRetry, open, onClose, afterClose, onEdit, onGoClose, onPreviewFile, pdfBase }: {
  a: ClubActivity | null
  detail: ClubActivityDetail | undefined
  loading: boolean
  error?: unknown
  onRetry?: () => void
  open: boolean
  onClose: () => void
  afterClose: () => void
  /** 省略即唯讀(行政端):footer 的「繼續編輯」「前往結案」隨之收掉 */
  onEdit?: () => void
  onGoClose?: () => void
  onPreviewFile: (f: EvalFile) => void
  /** 申請表 PDF 的端點前綴;行政端要用自己那支(社團端那支綁 club_id) */
  pdfBase?: 'club' | 'admin'
}) {
  const { message } = App.useApp()
  if (!a) return null
  const editable = a.status === 'draft' || a.status === 'rejected'
  const rep = a.status === 'closed' || a.status === 'closing_pending_advisor' ? detail?.report : undefined
  const photos = detail?.photos ?? []
  const attachments = detail?.attachments ?? []
  const budget = detail?.budget ?? []

  // 與申請值比對:相同就不顯示實際值;比較前正規化分隔符
  const normTime = (tr: string) => tr.split(TIME_RANGE_SEP).map((s) => s.trim()).join('–')
  const actualTime = rep ? `${rep.actualStart}–${rep.actualEnd}` : ''
  const timeChanged = !!rep && normTime(actualTime) !== normTime(a.timeRange ?? '')
  const locationChanged = !!rep && rep.actualLocation !== a.location
  const plannedCountsText = `社員 ${a.participantsIn} · 非社員 ${a.participantsOut}`
  // 核定欄:有申請補助,或雖沒申請但確實核了錢(遷移資料有這種列)才出現
  const hasSubsidy = budget.some((b) => showsApproved(b.requestedSubsidy, b.approvedSubsidy))
  const countChanged = !!rep && (rep.memberCount !== a.participantsIn || rep.nonMemberCount !== a.participantsOut)

  const downloadItems = [
    { key: 'photos', label: '下載照片檔', disabled: photos.length === 0 },
    { key: 'apply', label: '下載社團活動申請表' },
  ]
  const onDownload = ({ key }: { key: string }) => {
    // 照片打包成 zip(僅 archive);申請表 PDF 由後端於下載時動態生成
    if (key === 'photos') {
      downloadPhotosZip(`${a.name}_照片`, photos).catch((e: unknown) =>
        message.error(e instanceof Error ? e.message : '照片下載失敗'),
      )
    }
    if (key === 'apply') downloadEvalFile(activityApplyPdf(a, pdfBase))
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={rep ? 1080 : 840}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 26 }}>
          {a.name} <StatusPill status={a.status} />
          <span style={{ flex: 1 }} />
          <DownloadMenu items={downloadItems} onClick={onDownload} />
        </div>
      }
      footer={
        editable && onEdit ? (
          <Button type="primary" onClick={onEdit}>
            {a.status === 'rejected' ? '編輯重送' : '繼續編輯'}
          </Button>
        ) : a.canClose && onGoClose ? (
          <Button type="primary" onClick={onGoClose}>前往結案</Button>
        ) : null
      }
    >
      <LoadingBlock pending={loading}>
      {/* 詳情載入失敗:整塊改為錯誤呈現,避免結案資料/附件被誤看成不存在 */}
      {error != null ? (
        <div style={{ marginTop: 10 }}>
          <QueryError compact title="活動詳細資訊載入失敗" error={error} onRetry={onRetry} />
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: rep ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap: 32, marginTop: 10, alignItems: 'start' }}>
        {/* 左欄:申請資料、經費、檔案 */}
        <div>
          <SectionTitle first>基本資料</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '9px 12px', fontSize: 13 }}>
            <div style={{ color: 'var(--steel)' }}>類型</div><div>{a.type}</div>
            <div style={{ color: 'var(--steel)' }}>日期</div>
            <div>
              <span className="num">{dateRangeText(a)}</span>{' '}
              {timeChanged && rep ? (
                <ActualValue actual={actualTime} planned={a.timeRange ?? '未填'} />
              ) : (
                a.timeRange && <span className="num">{a.timeRange}</span>
              )}
            </div>
            <div style={{ color: 'var(--steel)' }}>地點</div>
            <div>
              {locationChanged && rep ? (
                <ActualValue actual={rep.actualLocation} planned={a.location || '未填'} />
              ) : (
                a.location || '—'
              )}
            </div>
            <div style={{ color: 'var(--steel)' }}>人數</div>
            <div>
              {countChanged && rep ? (
                <ActualValue actual={`社員 ${rep.memberCount} · 非社員 ${rep.nonMemberCount}`} planned={plannedCountsText} />
              ) : (
                <span className="num">{plannedCountsText}</span>
              )}
            </div>
            {a.content && (<><div style={{ color: 'var(--steel)' }}>內容</div><div style={{ lineHeight: 1.7 }}>{a.content}</div></>)}
            {a.works.length > 0 && (
              <>
                <div style={{ color: 'var(--steel)' }}>工作分配</div>
                <WorkTable works={a.works} />
              </>
            )}
            {attachments.length > 0 && (
              <>
                <div style={{ color: 'var(--steel)' }}>附件</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {attachments.map((f) => (
                    <FileChip key={f.id} f={f} onPreview={onPreviewFile} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ ...budgetGrid(hasSubsidy), margin: '22px 0 0' }}>
            {/* 表頭與明細同一組軌道:「自籌 / 擬請」正好落在兩欄數字上方 */}
            <div style={{ ...BUDGET_ROW, fontSize: 13, fontWeight: 600, paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
              <span>經費</span>
              <span style={{ fontWeight: 400, color: 'var(--steel)', fontSize: 12 }}>
                {money(a) === '–' && '無申請經費'}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 400, color: 'var(--steel)' }}>自籌</span>
              <span style={{ textAlign: 'right', fontWeight: 400, color: 'var(--steel)' }}>擬請</span>
              {hasSubsidy && (
                <span style={{ textAlign: 'right', fontWeight: 400, color: 'var(--steel)' }}>核定</span>
              )}
            </div>
            {budget.map((b) => (
              <div key={b.id} style={{ ...BUDGET_ROW, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--steel)' }}>{b.category}</span>
                <span>{b.description}</span>
                <span className="num" style={{ textAlign: 'right' }}>{b.selfFund.toLocaleString()}</span>
                <span className="num" style={{ textAlign: 'right' }}>{b.requestedSubsidy.toLocaleString()}</span>
                {hasSubsidy && (
                  <span className="num" style={{ textAlign: 'right' }}>{approvedText(b.approvedSubsidy)}</span>
                )}
              </div>
            ))}
            {budget.length > 0 && (
              <div style={{ ...BUDGET_ROW, fontSize: 13, padding: '7px 0 0' }}>
                <span />
                <span style={{ textAlign: 'right', color: 'var(--steel)' }}>合計</span>
                <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{a.selfFundTotal.toLocaleString()}</span>
                <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{a.requestedTotal.toLocaleString()}</span>
                {hasSubsidy && (
                  <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{approvedText(a.approvedTotal)}</span>
                )}
              </div>
            )}
          </div>
          {rep && (
            <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--steel)', paddingTop: 4 }}>
              實際支出 <span className="num" style={{ color: 'var(--ink)' }}>{fmtMoney(rep.expense)}</span>
            </div>
          )}

          {detail?.rejectReason && (
            <div style={{ background: 'var(--paper)', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, marginTop: 16 }}>
              <span style={{ fontWeight: 500, color: '#B03A2E' }}>退回原因</span>
              <span style={{ color: 'var(--steel)' }}> — {detail.rejectReason.by} · <span className="num">{detail.rejectReason.date}</span>:</span>
              {detail.rejectReason.text}
            </div>
          )}

          {rep && photos.length > 0 && (
            <>
              <SectionTitle>活動照片(<span className="num">{photos.length}</span> 張)</SectionTitle>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((p) => (
                  <button key={p.id} type="button" className="link-btn" style={{ padding: 0 }} aria-label={`預覽 ${p.name}`} onClick={() => onPreviewFile(p)}>
                    <img src={p.url} alt={p.name} title={p.name} style={{ width: 104, height: 78, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {rep?.videoLink && (
            <>
              <SectionTitle>成果影片</SectionTitle>
              <div style={{ fontSize: 13 }}>
                <LinkOutlined style={{ color: 'var(--steel)', marginRight: 6 }} />
                <a href={rep.videoLink} target="_blank" rel="noopener noreferrer">{rep.videoLink}</a>
              </div>
            </>
          )}

          {a.status === 'locked' && (
            <div style={{ fontSize: 13, color: '#A3341F', marginTop: 16 }}>
              已逾期並鎖定，更多疑問請洽學務處
            </div>
          )}
        </div>

        {/* 右欄:結案成果全文 */}
        {rep && (
          <div>
            <SectionTitle first>
              結案成果
              {rep.submittedAt && (
                <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>
                  送出 <span className="num">{rep.submittedAt}</span>
                </span>
              )}
            </SectionTitle>
            {([['活動重點', rep.highlights], ['達成目標', rep.goals], ['其他成果', rep.others]] as const).map(([lab, text]) => (
              <div key={lab} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 3 }}>{lab}</div>
                <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{text}</div>
              </div>
            ))}
            {rep.reviewMeeting && (
              <>
                <SectionTitle>
                  檢討會議
                  <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>
                    <span className="num">{rep.reviewDate ?? '—'}</span>
                    {rep.reviewAttendees != null && <> · 與會 <span className="num">{rep.reviewAttendees}</span> 人</>}
                  </span>
                </SectionTitle>
                {([['討論事項', rep.reviewTopics], ['內容決議', rep.reviewConclusion]] as const).map(([lab, text]) =>
                  text ? (
                    <div key={lab} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 3 }}>{lab}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{text}</div>
                    </div>
                  ) : null,
                )}
              </>
            )}
            <SectionTitle>學習心得(<span className="num">{rep.reflections.length}</span> 人)</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rep.reflections.map((x) => (
                <div key={`${x.name}-${x.dept}`} style={{ background: 'var(--paper)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {x.name} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--steel)' }}>{x.dept}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 4, whiteSpace: 'pre-wrap' }}>{x.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
      </LoadingBlock>
    </Modal>
  )
}
