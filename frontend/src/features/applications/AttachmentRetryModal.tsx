import { useState } from 'react'
import { Modal } from 'antd'
import AttachmentArea, { type BagFile } from '../../components/ui/AttachmentArea'

// 補傳附件的彈窗。兩段式送出(先 POST 主體、再上傳附件)的第二步失敗時,單子已經
// 建立而附件沒上去 —— 沒有補傳入口的話社團只能再送一張新單,系統就累積無佐證的
// 重複單(decisions.md D-06)。上傳成功後由呼叫端 invalidate 列表。
export default function AttachmentRetryModal({
  open,
  title,
  accept,
  hint,
  validate,
  maxTotalBytes,
  maxCount,
  uploading,
  onUpload,
  onClose,
}: {
  open: boolean
  title: string
  accept: string
  hint: string
  validate?: (f: File) => Promise<string | null>
  maxTotalBytes?: number
  maxCount?: number
  uploading: boolean
  /** 回傳 Promise:成功才關閉彈窗。失敗時保留待傳檔案讓使用者重試,
   *  但要把已經上去的那幾檔挑掉(回傳 already)—— 整包重按會把它們再傳一遍 */
  onUpload: (files: File[]) => Promise<{ already: File[] } | void>
  onClose: () => void
}) {
  const [files, setFiles] = useState<BagFile[]>([])

  const close = () => {
    setFiles([])
    onClose()
  }

  return (
    <Modal
      open={open}
      title={title}
      okText="上傳"
      cancelText="取消"
      confirmLoading={uploading}
      okButtonProps={{ disabled: files.length === 0 }}
      onOk={() =>
        void onUpload(files.map((b) => b.file)).then(close, (e: unknown) => {
          const already = (e as { already?: File[] })?.already
          if (already?.length) setFiles((cur) => cur.filter((b) => !already.includes(b.file)))
        })
      }
      onCancel={close}
      destroyOnHidden
    >
      <AttachmentArea
        value={files}
        onChange={setFiles}
        accept={accept}
        hint={hint}
        validate={validate}
        maxTotalBytes={maxTotalBytes}
        maxCount={maxCount}
      />
    </Modal>
  )
}
