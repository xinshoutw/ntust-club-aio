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
  fundSource: '學務處社團補助',
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
  // 「能不能改」與「看不看得到」是兩個判定:沒申請補助就核不出金額,也沒有來源要認定,
  // 但承辦人先前認定過的來源(遷移資料有)照樣得印出來
  test('整單都沒申請補助時,核定欄不出現、經費來源轉唯讀', () => {
    show([budgetRow(1, 0), budgetRow(2, 0)])

    expect(screen.queryByRole('columnheader', { name: '核定' })).toBeNull()
    expect(screen.queryByPlaceholderText('xxx補助')).toBeNull()
    expect(screen.getByText('經費來源')).toBeTruthy()
    expect(screen.getByText('學務處社團補助')).toBeTruthy() // 標籤在不等於值印得出來
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

// 章軌只印每一關**最後一次**核准:退回、以及退回重送後再核的那幾次都不在軌上,
// 而「這張單被卡在哪」要看的正是那幾列
describe('ActivityReviewModal 的簽核紀錄', () => {
  const showApprovals = (approvals: NonNullable<ReviewItem['detail']>['approvals']) =>
    render(
      <App>
        <ActivityReviewModal
          item={{
            ...item([budgetRow(1, 5000)]),
            status: 'pending_chief',
            detail: { attachments: [], budget: [budgetRow(1, 5000)], approvals },
          }}
          open
          onClose={() => {}}
          afterClose={() => {}}
        />
      </App>,
    )

  test('逐列印出簽核者、時間與決議', () => {
    showApprovals([
      { actor: '陳彥仁', at: '2026/08/18 16:17', decision: 'approve', isClose: false },
      { actor: '侍筱鳳', at: '2026/08/19 09:02', decision: 'reject', isClose: false },
    ])

    expect(screen.getByText(/陳彥仁 於/).textContent).toContain('核准')
    expect(screen.getByText(/侍筱鳳 於/).textContent).toContain('退回')
    // 時間自己一個 span,不在 getByText 的比對範圍內 —— 不另外斷言的話整段刪掉也不會紅
    expect(screen.getByText('2026/08/18 16:17')).toBeTruthy()
    expect(screen.getByText('2026/08/19 09:02')).toBeTruthy()
  })

  // 申請與結案的簽核紀錄同放一張表:只印「核准」的話,結案那次會被讀成又核了一次申請
  // 摺疊自動解鎖是 api 層 dropAutoUnlock 的事(元件收到的已經是映射過的資料),
  // 測在 adminActivities.test.ts。這裡測的是 DECISION_LABEL 認得 unlock
  test('手動解鎖照樣印出來', () => {
    showApprovals([{ actor: '侍筱鳳', at: '2026/08/19 09:02', decision: 'unlock', isClose: true }])

    expect(screen.getByText(/侍筱鳳 於/).textContent).toContain('結案解鎖')
  })

  test('結案的那幾列標明是結案', () => {
    showApprovals([{ actor: '陳彥仁', at: '2026/08/18 16:17', decision: 'approve', isClose: true }])

    expect(screen.getByText(/陳彥仁 於/).textContent).toContain('結案核准')
  })
})

// 章下方那格是給簽核者的,不是關卡名 —— 只有承辦人簽了的單子,
// 章軌若把「組長」「學務長」印在還沒簽的兩格,看起來就像三關都有人經手
describe('ActivityReviewModal 的簽核章軌', () => {
  type Stamps = NonNullable<ReviewItem['detail']>['stamps']

  const showTrail = (status: ReviewItem['status'], stamps: Stamps) =>
    render(
      <App>
        <ActivityReviewModal
          item={{
            ...item([budgetRow(1, 5000)]),
            status,
            detail: { attachments: [], budget: [budgetRow(1, 5000)], stamps },
          }}
          open
          onClose={() => {}}
          afterClose={() => {}}
        />
      </App>,
    )

  const advisorStamp = {
    stage: 'advisor' as const,
    name: '陳彥仁',
    at: '08/23 19:23',
    atFull: '2026/08/23 19:23:01',
  }

  test('沒人簽的關卡顯示等待中,不顯示關卡名', () => {
    showTrail('pending_advisor', [])

    expect(screen.getAllByText('等待中')).toHaveLength(3)
    expect(screen.queryByText('承辦人')).toBeNull()
    expect(screen.queryByText('學務長')).toBeNull()
  })

  test('簽過的關卡顯示簽核者姓名與簽核時間', () => {
    showTrail('pending_chief', [advisorStamp])

    expect(screen.getByText('陳彥仁')).toBeTruthy()
    expect(screen.getByText('08/23 19:23')).toBeTruthy()
    expect(screen.getAllByText('等待中')).toHaveLength(2) // 組長、學務長還沒簽
  })

  // 章軌的每一格是 width:88 的 div,子節點依序是 關卡字 / 姓名或狀態 / 簽核時間
  const stampNodes = () =>
    [...document.querySelectorAll<HTMLElement>('div')].filter((el) => el.style.width === '88px')
  const stampChars = () => stampNodes().map((el) => el.children[0]?.textContent)
  const stampLabels = () => stampNodes().map((el) => el.children[1]?.textContent)

  // 核定 0 元即當場核准(D-16),組長與學務長永遠不會簽這張單。
  // 舊系統遷入的 53 件已核准活動就是這樣只留了 1–2 位簽核者 ——
  // 狀態說「已核准」就把三顆章全點亮,等於替沒有簽核紀錄的人背書
  test('已核准但只有承辦人簽過時,另外兩關整格不畫', () => {
    showTrail('approved', [advisorStamp])

    expect(screen.getByText('陳彥仁')).toBeTruthy()
    expect(stampChars()).toEqual(['承'])
    expect(screen.queryByText('等待中')).toBeNull()
  })

  test('還在跑的單子照畫三格,後面兩關是真的還會發生', () => {
    showTrail('pending_chief', [advisorStamp])

    expect(stampChars()).toEqual(['承', '組', '長'])
  })

  // 退回的那一關不是在等,是已經有結論了 —— 退回件按定義不會有核准章,
  // 「還沒簽到就寫等待中」那條規則套過來剛好在唯一不成立的地方說錯話
  test('被退回的那一關寫已退回,不是等待中', () => {
    showTrail('rejected', [advisorStamp]) // 承辦人簽過、組長退回

    expect(stampChars()).toEqual(['承', '組']) // 學務長永遠不會簽這張單
    expect(stampLabels()).toEqual(['陳彥仁', '已退回'])
  })
})
