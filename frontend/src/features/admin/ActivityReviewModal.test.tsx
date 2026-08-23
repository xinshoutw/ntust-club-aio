import { describe, expect, test, vi } from 'vitest'
import { App } from 'antd'
import { render, screen } from '@testing-library/react'
import ActivityReviewModal from './ActivityReviewModal'
import type { ReviewItem } from '../../api/adminActivities'

// 承辦人(第一關)登入,才拿得到可編輯的核定欄
vi.mock('../../app/auth', () => ({
  useAuth: () => ({ user: { role: 'admin', isSuper: true, permissions: [] } }),
}))

const budgetRow = (id: number, requested: number, approved = 0) => ({
  id,
  category: `科目${id}`,
  description: '說明',
  selfFund: 1000,
  requested,
  approved,
})

const item = (budget: ReturnType<typeof budgetRow>[]): ReviewItem => ({
  id: '1',
  club: '吉他社',
  name: '迎新',
  type: '活動',
  date: '2026/09/20',
  requested: budget.reduce((s, b) => s + b.requested, 0),
  status: 'pending_advisor',
  detail: { attachments: [], budget },
})

const show = (budget: ReturnType<typeof budgetRow>[]) =>
  render(
    <App>
      <ActivityReviewModal
        item={item(budget)}
        open
        onClose={() => {}}
        afterClose={() => {}}
        onApprove={async () => {}}
      />
    </App>,
  )

// 擬請 0 的列核不出金額(後端 max=擬請,整單擬請 0 時任何非零核定回 422)。
// 給一個永遠只能是 0 的輸入框,是把「看得到」與「動得了」混成一個判定。
describe('ActivityReviewModal 的核定欄', () => {
  test('整單都沒申請補助時,核定欄與經費來源都不出現', () => {
    show([budgetRow(1, 0), budgetRow(2, 0)])

    expect(screen.queryByRole('columnheader', { name: '核定' })).toBeNull()
    expect(screen.queryByPlaceholderText('xxx補助')).toBeNull()
    expect(screen.getByRole('columnheader', { name: '擬請' })).toBeTruthy()
  })

  // 舊系統允許沒申請卻核發,遷移資料就有這種列(最大一筆 12,000)。
  // 拿「能不能核」當「看不看得到」用,會把已經核定的錢從承辦人眼前藏掉。
  test('沒申請補助但已核定過的,核定欄要出現(只是不給改)', () => {
    show([budgetRow(1, 0, 12000), budgetRow(2, 0)])

    expect(screen.getByRole('columnheader', { name: '核定' })).toBeTruthy()
    expect(document.querySelectorAll('tbody input')).toHaveLength(0)
    expect(screen.getAllByText('12,000')).toHaveLength(2) // 明細列 + 合計
  })

  test('有申請補助時核定欄出現,但擬請 0 的那一列不給輸入框', () => {
    show([budgetRow(1, 5000), budgetRow(2, 0)])

    expect(screen.getByRole('columnheader', { name: '核定' })).toBeTruthy()
    expect(screen.getByPlaceholderText('xxx補助')).toBeTruthy()
    // Modal 是 portal,不在 render 的 container 底下
    expect(document.querySelectorAll('tbody input')).toHaveLength(1)
  })
})

// 章下方那格是給簽核者的,不是關卡名 —— 只有承辦人簽了的單子,
// 章軌若把「組長」「學務長」印在還沒簽的兩格,看起來就像三關都有人經手
describe('ActivityReviewModal 的簽核章軌', () => {
  const showTrail = (stamps: NonNullable<ReviewItem['detail']>['stamps']) =>
    render(
      <App>
        <ActivityReviewModal
          item={{ ...item([budgetRow(1, 5000)]), status: 'pending_chief', detail: { attachments: [], budget: [budgetRow(1, 5000)], stamps } }}
          open
          onClose={() => {}}
          afterClose={() => {}}
        />
      </App>,
    )

  test('沒人簽的關卡顯示 -,不顯示關卡名', () => {
    showTrail([])

    expect(screen.getAllByText('-')).toHaveLength(3)
    expect(screen.queryByText('承辦人')).toBeNull()
    expect(screen.queryByText('學務長')).toBeNull()
  })

  test('簽過的關卡顯示簽核者姓名與簽核時間', () => {
    showTrail([{ stage: 'advisor', name: '陳彥仁', at: '08/23 19:23', atFull: '2026/08/23 19:23:01' }])

    expect(screen.getByText('陳彥仁')).toBeTruthy()
    expect(screen.getByText('08/23 19:23')).toBeTruthy()
    expect(screen.getAllByText('-')).toHaveLength(2) // 組長、學務長還沒簽
  })
})
