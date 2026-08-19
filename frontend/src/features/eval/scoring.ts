// 最佳社團獎「行政資料」自動評分引擎(依 docs/社團評鑑/最佳社團獎-行政資料.pdf)
// 純函式、無 UI 依賴;後端落地時以同一規則實作,本檔為規格的可執行版本。

export type AdKey = 'ad1' | 'ad2' | 'ad3' | 'ad4' | 'ad5' | 'ad6' | 'ad7' | 'ad8' | 'adj'

export interface ClosedActivity {
  id: string
  name: string
  date: string // YYYY/MM/DD
  large: boolean // 申請大型活動且經管理員認可
}

/** ad2–ad4 一律以承辦在結案審核時的三個繳交確認為準(decisions.md D-14):
 *  系統不自己數照片張數或心得筆數,社團可能是交紙本。 */
export interface ActivityResultInput {
  activityId: string
  hasPhotos: boolean // 照片或影片(同一個確認框)
  hasReport: boolean
  hasFeedback: boolean
}

export interface ScoringInput {
  closed: ClosedActivity[] // 評分區間內已結案的活動/社課(結案始算)
  results: ActivityResultInput[]
  rosterBySemester: Record<string, number> // 區間內兩學期的名單人數
  hasWebsite: boolean
  leaderMeetingsAttended: number // 負責人會議已簽到場次(管理員於活動後登錄;每學期 2 場、全學年 4 場)
  cadreTrainingAttended: boolean // 幹訓已簽到(管理員登錄;僅報名不計)
  violationCount: number // 未銷案勸導紀錄數
  merit: number // 表現優良加分(學務處登錄,0–5)
}

export interface AdScore {
  key: AdKey
  auto: number
  max: number
  note: string
}

const LARGE_MULTIPLIER = 3
export const LEADER_MEETING_POINTS = 1.25 // 負責人會議每場 1.25 分,全學年 4 場滿分 5
export const AD_MAX: Record<AdKey, number> = {
  ad1: 15, ad2: 15, ad3: 15, ad4: 30, ad5: 10, ad6: 5, ad7: 5, ad8: 5, adj: 5,
}

const cap = (n: number, max: number) => Math.min(n, max)

export function computeAdScores(i: ScoringInput): AdScore[] {
  const resultOf = new Map(i.results.map((r) => [r.activityId, r]))
  const larges = i.closed.filter((a) => a.large).length

  // ad1 活動及社課申請:一次 1 分、大型 3 分;一天最多計一次(取當日最高);上限 15
  const bestPerDay = new Map<string, number>()
  for (const a of i.closed) {
    const v = a.large ? LARGE_MULTIPLIER : 1
    bestPerDay.set(a.date, Math.max(bestPerDay.get(a.date) ?? 0, v))
  }
  const ad1 = cap([...bestPerDay.values()].reduce((s, v) => s + v, 0), AD_MAX.ad1)

  // ad2–ad4 活動成果:各活動有給就有分;大型 ×3;各有上限
  let photo = 0
  let report = 0
  let feedback = 0
  for (const a of i.closed) {
    const r = resultOf.get(a.id)
    if (!r) continue
    const w = a.large ? LARGE_MULTIPLIER : 1
    if (r.hasPhotos) photo += 1 * w
    if (r.hasReport) report += 1 * w
    if (r.hasFeedback) feedback += 2 * w
  }
  const ad2 = cap(photo, AD_MAX.ad2)
  const ad3 = cap(report, AD_MAX.ad3)
  const ad4 = cap(feedback, AD_MAX.ad4)

  // ad5 名單更新:每學期 0 人 0 分、1–9 人 2.5 分、10 人以上 5 分;總分 10
  const semesters = Object.entries(i.rosterBySemester)
  const semesterScore = (count: number) => (count <= 0 ? 0 : count <= 9 ? 2.5 : 5)
  const ad5 = cap(semesters.reduce((s, [, c]) => s + semesterScore(c), 0), AD_MAX.ad5)

  // ad6 網頁經營:有連結即給滿分,不追蹤更新時間
  const ad6 = i.hasWebsite ? AD_MAX.ad6 : 0

  // ad7/ad8 會議與幹訓:以管理員活動後之簽到為準,僅報名不計分
  // ad7 每場 1.25 分(每學期 2 場、全學年 4 場滿分);ad8 簽到即滿分
  const ad7 = cap(i.leaderMeetingsAttended * LEADER_MEETING_POINTS, AD_MAX.ad7)
  const ad8 = i.cadreTrainingAttended ? AD_MAX.ad8 : 0

  // 加減分:表現優良最多 +5;違規記點一次 −1、最多 −10
  const merit = Math.max(0, Math.min(i.merit, 5))
  const penalty = Math.min(i.violationCount, 10)
  const adj = merit - penalty

  return [
    { key: 'ad1', auto: ad1, max: AD_MAX.ad1, note: `結案 ${i.closed.length} 件(大型 ${larges});一天至多計 1 件` },
    { key: 'ad2', auto: ad2, max: AD_MAX.ad2, note: `每活動經承辦確認照片或影片;大型 ×${LARGE_MULTIPLIER}` },
    { key: 'ad3', auto: ad3, max: AD_MAX.ad3, note: `每活動經承辦確認成果報告表;大型 ×${LARGE_MULTIPLIER}` },
    { key: 'ad4', auto: ad4, max: AD_MAX.ad4, note: `每活動經承辦確認學習心得 2 分;大型 ×${LARGE_MULTIPLIER}` },
    {
      key: 'ad5',
      auto: ad5,
      max: AD_MAX.ad5,
      note: semesters.map(([s, c]) => `${s}:${c} 人 → ${semesterScore(c)} 分`).join(';') || '無名單資料',
    },
    { key: 'ad6', auto: ad6, max: AD_MAX.ad6, note: i.hasWebsite ? '已設定網頁連結' : '未設定網頁連結' },
    {
      key: 'ad7',
      auto: ad7,
      max: AD_MAX.ad7,
      note:
        i.leaderMeetingsAttended > 0
          ? `已簽到 ${i.leaderMeetingsAttended} 場 × ${LEADER_MEETING_POINTS} 分(全學年 4 場)`
          : '無簽到紀錄(以管理員活動後登錄之簽到為準)',
    },
    { key: 'ad8', auto: ad8, max: AD_MAX.ad8, note: i.cadreTrainingAttended ? '幹訓已簽到' : '無簽到紀錄(以管理員活動後登錄之簽到為準)' },
    {
      key: 'adj',
      auto: adj,
      max: AD_MAX.adj,
      note: `表現優良 +${merit};違規勸導 ${i.violationCount} 筆 −${penalty}(上限 −10)`,
    },
  ]
}

export interface FinalScore extends AdScore {
  final: number
  overridden: boolean
}

// 管理員調整:override 為 null/undefined 表示採自動計算
export function applyOverrides(
  scores: AdScore[],
  overrides: Partial<Record<AdKey, number | null>>,
): FinalScore[] {
  return scores.map((s) => {
    const o = overrides[s.key]
    return { ...s, final: o ?? s.auto, overridden: o != null }
  })
}

// 行政資料總分上限 100(各項滿分合計 100,加分後仍以 100 計)、下限 0(decisions.md DEC-08)。
// 本檔是 spec 指定的**可執行規格**,後端 services/scoring.total_of 照它實作 —— 兩份夾擠必須一致。
// 畫面顯示的總分一律取後端回傳值(EvalDocsPage 讀 `data.total`),所以少了下限不會讓社團看到負分,
// 壞掉的是「規格與實作等價」這件事本身
export const ADMIN_TOTAL_MAX = 100
export const totalOf = (scores: FinalScore[]): number =>
  Math.min(ADMIN_TOTAL_MAX, Math.max(0, scores.reduce((sum, s) => sum + s.final, 0)))
