import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AttachmentLinks from './AttachmentLinks'

// 違規勸導、報修佐證、存簿影本:圖片不再另開分頁(HEIC 在新分頁拿到的是原檔,Windows 開不起來),
// 改開 AntD 的圖片預覽;影片與文件照舊新分頁
const files = [
  { id: 'a', name: '現場1.jpg' },
  { id: 'v', name: '現場.mp4' },
  { id: 'b', name: '現場2.HEIC' },
]

describe('AttachmentLinks', () => {
  test('圖片開圖片預覽，同一行的圖片左右切換，Ctrl 點照樣拿原檔；影片照舊新分頁', () => {
    render(<AttachmentLinks files={files} />)
    const video = screen.getByRole('link', { name: '現場.mp4' })
    expect(video.getAttribute('target')).toBe('_blank')
    expect(video.getAttribute('href')).toMatch(/\/files\/v$/)

    // 圖片也是連結(預覽畫不出來時還拿得到原檔):一般左鍵才改開預覽
    const image = screen.getByRole('link', { name: '現場2.HEIC' })
    expect(image.getAttribute('href')).toMatch(/\/files\/b$/)
    expect(fireEvent.click(image, { ctrlKey: true })).toBe(true) // 沒攔:照瀏覽器預設開新分頁
    expect(screen.queryByRole('dialog')).toBeNull()

    expect(fireEvent.click(image)).toBe(false)
    const preview = screen.getByRole('dialog', { name: '現場2.HEIC' })
    expect(preview.querySelector('.ant-image-preview-img')?.getAttribute('src')).toMatch(/\/files\/b$/)
    expect(preview.textContent).toContain('2 / 2') // 影片不在切換裡
  })

  test('inline 只出連結本身；沒有附件回 null', () => {
    const { container, rerender } = render(<AttachmentLinks files={files} inline />)
    expect(container.firstElementChild?.tagName).toBe('SPAN')
    rerender(<AttachmentLinks files={[]} />)
    expect(container.textContent).toBe('')
  })
})
