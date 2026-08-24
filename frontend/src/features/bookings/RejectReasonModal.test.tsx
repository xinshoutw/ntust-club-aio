import { expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRejectReason } from './RejectReasonModal'
import type { RejectInfo } from '../../api/bookings'

const reject: RejectInfo = { reason: '場地當日已有校方活動', at: '2026/08/24 10:21' }

function Table({ info }: { info?: RejectInfo }) {
  const r = useRejectReason()
  const row = r.rowProps('精誠廣場（2026/09/05）', info)
  return (
    <>
      <table>
        <tbody>
          <tr {...row.tr}>
            <td>{row.wrap('精誠廣場')}</td>
          </tr>
        </tbody>
      </table>
      {r.node}
    </>
  )
}

test('點退回件開出原因與退回時間', () => {
  render(<Table info={reject} />)
  fireEvent.click(screen.getByRole('button', { name: /退回原因/ }))
  expect(screen.getByText('場地當日已有校方活動')).toBeTruthy()
  expect(screen.getByText('2026/08/24 10:21')).toBeTruthy()
  expect(screen.getByText('精誠廣場（2026/09/05）')).toBeTruthy()
})

test('沒被退回的列不可點,也不長出鍵盤入口', () => {
  const { container } = render(<Table />)
  expect(screen.queryByRole('button')).toBeNull()
  expect(container.querySelector('tr')?.getAttribute('style')).toBeNull()
})
