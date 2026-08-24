import { expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useDecisionReason } from './DecisionReasonModal'
import type { DecisionInfo } from '../../api/bookings'
import type { StatusKey } from '../../lib/status'

const decided: DecisionInfo = { reason: '場地當日已有校方活動', at: '2026/08/24 10:21' }

function Table({ status, info }: { status: StatusKey; info?: DecisionInfo }) {
  const r = useDecisionReason()
  const row = r.rowProps('精誠廣場（2026/09/05）', status, info)
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

const open = (name: RegExp = /退回原因/) =>
  fireEvent.click(screen.getByRole('button', { name }))

test('點退回件開出原因與退回時間', () => {
  render(<Table status="rejected" info={decided} />)
  open()
  expect(screen.getByText('場地當日已有校方活動')).toBeTruthy()
  expect(screen.getByText('2026/08/24 10:21')).toBeTruthy()
  expect(screen.getByText('精誠廣場（2026/09/05）')).toBeTruthy()
})

test('退回但舊系統沒留理由:仍可點,彈窗說明沒有原因', () => {
  render(<Table status="rejected" />)
  open()
  expect(screen.getByText('系統未留下退回原因')).toBeTruthy()
})

test('承辦撤銷的已取消件開出撤銷原因', () => {
  render(<Table status="cancelled" info={decided} />)
  open(/撤銷原因/)
  expect(screen.getByText('場地當日已有校方活動')).toBeTruthy()
})

test('社團自己取消的列不可點,也不長出鍵盤入口', () => {
  const { container } = render(<Table status="cancelled" />)
  expect(screen.queryByRole('button')).toBeNull()
  expect(container.querySelector('tr')?.getAttribute('style')).toBeNull()
})
