import { useState } from 'react'
import FilePreview from './FilePreview'
import type { EvalFile } from './types'

interface Shown {
  file: EvalFile
  group?: readonly EvalFile[]
}

// 檔案預覽的開關樣板:preview(f, group) 開窗,node 掛在頁面/彈窗尾端。
// 圖片開 AntD 的圖片預覽(group 裡的圖片左右切換),其餘開 FilePreview 的彈窗。
// 檔案在關閉動畫結束(afterClose)才清掉 —— 提早清會讓關閉中的標題先變空。
// 各頁自己刻一份的話,附件與照片就會退化成 target="_blank" 另開分頁
export function useFilePreview(): {
  preview: (f: EvalFile, group?: readonly EvalFile[]) => void
  node: React.ReactElement
} {
  const [shown, setShown] = useState<Shown | null>(null)
  const [open, setOpen] = useState(false)
  return {
    preview: (file: EvalFile, group?: readonly EvalFile[]) => {
      setShown({ file, group })
      setOpen(true)
    },
    node: (
      <FilePreview
        file={shown?.file ?? null}
        group={shown?.group}
        open={open}
        onClose={() => setOpen(false)}
        afterClose={() => setShown(null)}
      />
    ),
  }
}
