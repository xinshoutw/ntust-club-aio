import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FilterButton } from './tableControls'

// 篩選漏斗的選項來自另一支查詢。那支查詢失敗時 options 是空陣列,而篩選本身是
// fail-closed 的空結果 —— 已選值若不併回選單,使用者連取消自己下的篩選都沒有入口。
describe('FilterButton', () => {
  test('選項清單掛掉時,已選值仍留在選單裡可以取消', async () => {
    const onChange = vi.fn()
    render(<FilterButton label="狀態" options={[]} selected={['待審核']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '狀態' }))
    const item = await screen.findByText('待審核')

    fireEvent.click(item)
    expect(onChange).toHaveBeenCalledWith([])
  })

  test('已選值不會與 options 裡的同一個值重複出現', async () => {
    render(
      <FilterButton label="狀態" options={['待審核', '已核准']} selected={['待審核']} onChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '狀態' }))
    await screen.findByText('已核准')
    expect(screen.getAllByText('待審核')).toHaveLength(1)
  })
})
