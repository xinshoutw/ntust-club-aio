import { useState } from 'react'
import FilePreview from './FilePreview'
import type { EvalFile } from './types'

// 檔案預覽彈窗的開關樣板:preview(f) 開窗,node 掛在頁面/彈窗尾端。
// 檔案在關閉動畫結束(afterClose)才清掉 —— 提早清會讓關閉中的標題先變空。
// 各頁自己刻一份的話,附件與照片就會退化成 target="_blank" 另開分頁
export function useFilePreview(): { preview: (f: EvalFile) => void; node: React.ReactElement } {
  const [file, setFile] = useState<EvalFile | null>(null)
  const [open, setOpen] = useState(false)
  return {
    preview: (f: EvalFile) => {
      setFile(f)
      setOpen(true)
    },
    node: (
      <FilePreview
        file={file}
        open={open}
        onClose={() => setOpen(false)}
        afterClose={() => setFile(null)}
      />
    ),
  }
}
