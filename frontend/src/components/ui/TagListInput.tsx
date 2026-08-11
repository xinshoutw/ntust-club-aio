import { useState } from 'react'
import { Input, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { clickableProps } from '../../lib/clickable'

// AntD 原生「可編輯標籤」模式(官方 Tag 範例):closable Tag + 虛線「新增」Tag,
// 點擊變成小輸入框,Enter 或失焦即新增。
// 不可改用 Select 或自製風格輸入:需求方要的是 AntD 內建的可編輯標籤
export default function TagListInput({
  value = [],
  onChange,
}: {
  value?: string[]
  onChange?: (next: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    // 同批輸入也去重(避免「甲,甲」產生重複 tag / 重複 key)
    const parts = [...new Set(raw.split(/[,、]/).map((s) => s.trim()))].filter((s) => s && !value.includes(s))
    if (parts.length) onChange?.([...value, ...parts])
    setDraft('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {value.map((item) => (
        <Tag
          key={item}
          closable
          onClose={(e) => {
            e.preventDefault()
            onChange?.(value.filter((x) => x !== item))
          }}
          style={{ margin: 0, fontSize: 13, padding: '2px 8px' }}
        >
          {item}
        </Tag>
      ))}
      {adding ? (
        <Input
          size="small"
          autoFocus
          style={{ width: 140 }}
          value={draft}
          onChange={(e) => {
            // 打出逗號/頓號當下即成 tag(對齊原 tokenSeparators 行為)
            if (/[,、]$/.test(e.target.value)) commit(e.target.value)
            else setDraft(e.target.value)
          }}
          onPressEnter={(e) => {
            e.preventDefault()
            commit(draft)
          }}
          onBlur={() => (draft.trim() ? commit(draft) : setAdding(false))}
        />
      ) : (
        // AntD 的 Tag 本體是 span,只有 close icon 有鍵盤入口:自己補 role/tabIndex/Enter
        <Tag
          {...clickableProps(() => setAdding(true))}
          style={{ margin: 0, fontSize: 13, padding: '2px 8px', background: 'transparent', borderStyle: 'dashed', cursor: 'pointer' }}
        >
          <PlusOutlined style={{ fontSize: 11 }} /> 新增
        </Tag>
      )}
    </div>
  )
}
