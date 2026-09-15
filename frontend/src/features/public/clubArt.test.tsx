import { describe, expect, test } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import ClubArt from './clubArt'

const art = (url: string | null) =>
  render(<ClubArt kind="banner" url={url} clubId={7} clubName="熱門舞蹈研習社" />)

describe('ClubArt', () => {
  test('沒有形象圖時畫預設圖,不是一格空白', () => {
    const { container } = art(null)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.club-art')).not.toBeNull()
  })

  test('有形象圖時顯示圖片', () => {
    const { container } = art('/api/v1/public/files/abc')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/v1/public/files/abc')
  })

  // 換圖會在 commit 後立刻刪掉舊檔,而列表快取最長十分鐘還在發舊的 file id
  test('圖片載入失敗時退回預設圖', () => {
    const { container } = art('/api/v1/public/files/gone')
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.club-art')).not.toBeNull()
  })

  test('換成另一個網址時重新嘗試載入', () => {
    const { container, rerender } = art('/api/v1/public/files/gone')
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()

    rerender(<ClubArt kind="banner" url="/api/v1/public/files/new" clubId={7} clubName="熱門舞蹈研習社" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/v1/public/files/new')
  })

  test('預設頭像帶社團名的第一個字', () => {
    const { container } = render(
      <ClubArt kind="avatar" url={null} clubId={7} clubName="熱門舞蹈研習社" />,
    )
    expect(container.querySelector('.club-art-avatar')?.textContent).toBe('熱')
  })
})
