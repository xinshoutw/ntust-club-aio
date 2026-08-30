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

  test('分組選項排成二級選單:第一層是資料夾,已選但不屬於任何資料夾的值仍列得出來', async () => {
    render(
      <FilterButton
        label="社團"
        options={[
          { label: '藝術', options: ['吉他社', '熱舞社'] },
          { label: '學術', options: ['資訊社'] },
        ]}
        selected={['已停社的舊社團']}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '社團' }))
    await screen.findByText('藝術')
    expect(screen.getByText('學術')).toBeTruthy()
    // 資料夾未展開,社團名還不在畫面上 —— 159 個平鋪讀不完才改成二級
    expect(screen.queryByText('吉他社')).toBeNull()
    // 選項清單對不上的已選值一律留在最上層,否則取消不掉
    expect(screen.getByText('已停社的舊社團')).toBeTruthy()
  })
})
