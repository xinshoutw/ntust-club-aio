import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import FilePreview from './FilePreview'
import type { EvalFile } from './types'

const file = (id: string, type: EvalFile['type']): EvalFile => ({
  id,
  name: `${id}.${type === 'image' ? 'jpg' : 'pdf'}`,
  type,
  size: 1024,
  url: `/api/v1/files/${id}`,
  uploadedAt: '',
})
const a = file('a', 'image')
const b = file('b', 'pdf')
const c = file('c', 'image')

const renderPreview = (f: EvalFile, group?: EvalFile[], onClose = vi.fn()) =>
  render(<FilePreview file={f} group={group} open onClose={onClose} afterClose={vi.fn()} />)

describe('FilePreview', () => {
  // 圖片交給 AntD 的圖片預覽(與社團頁活動彈窗同一套),不再是彈窗裡一張 <img>
  test('圖片開 AntD 的圖片預覽，同一組只有圖片切得過去', () => {
    renderPreview(c, [a, b, c])
    const dialog = screen.getByRole('dialog', { name: 'c.jpg' })
    expect(dialog.classList.contains('ant-image-preview')).toBe(true)
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/api/v1/files/c')
    // 組裡的 PDF 不算:兩張圖,開在第二張;看圖時也看得到檔名
    expect(dialog.querySelector('.ant-image-preview-progress')?.textContent).toBe('c.jpg（2 / 2）')
  })

  test('左右切換時預覽的名字跟著換', () => {
    renderPreview(c, [a, b, c])
    fireEvent.click(document.querySelector('.ant-image-preview-switch-prev')!)
    const dialog = screen.getByRole('dialog', { name: 'a.jpg' })
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/api/v1/files/a')
  })

  // 呼叫端傳錯組:只看這一張,不要開到別張去
  test('組裡找不到自己時只看這一張', () => {
    renderPreview(c, [a, b])
    const dialog = screen.getByRole('dialog', { name: 'c.jpg' })
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/api/v1/files/c')
    expect(document.querySelector('.ant-image-preview-switch')).toBeNull()
    expect(dialog.querySelector('.ant-image-preview-progress')?.textContent).toBe('c.jpg')
  })

  test('關閉預覽會通知呼叫端', () => {
    const onClose = vi.fn()
    renderPreview(a, undefined, onClose)
    fireEvent.click(document.querySelector('.ant-image-preview-close')!)
    expect(onClose).toHaveBeenCalled()
  })

  test('PDF 仍然開彈窗內嵌', () => {
    renderPreview(b, [a, b, c])
    expect(document.querySelector('.ant-image-preview')).toBeNull()
    expect(screen.getByTitle('b.pdf').tagName).toBe('IFRAME')
  })
})
