import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PhotoThumbs from './PhotoThumbs'

// 結案頁的縮圖原本只能看不能點:手機上送出前沒辦法放大檢查那 5 張必交照片
test('縮圖是預覽鈕，點開整列左右切換；× 只移除、不開預覽', () => {
  const removeSaved = vi.fn()
  render(
    <PhotoThumbs
      items={[
        { key: 'saved-1', url: '/api/v1/files/1', name: '合照.jpg', onRemove: removeSaved },
        { key: 'new-1', url: 'blob:x', name: '講者.jpg', onRemove: vi.fn() },
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '移除 合照.jpg' }))
  expect(removeSaved).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.ant-image-preview')).toBeNull()

  const trigger = screen.getByRole('img', { name: '講者.jpg' }).closest('[role="button"]') as HTMLElement
  expect(trigger.getAttribute('tabindex')).toBe('0')
  fireEvent.click(trigger)
  const preview = screen.getByRole('dialog', { name: '活動照片' })
  expect(preview.querySelector('.ant-image-preview-img')?.getAttribute('src')).toBe('blob:x')
  expect(preview.textContent).toContain('2 / 2')
})
