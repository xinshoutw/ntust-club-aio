// 評鑑 mock store:彙整各功能 mock 成評分輸入,並保存上傳與管理員調整
// ponytail: 模組層可變資料;後端完成後全部換成 API(行政分即時彙算,見 data-model 3.8)
import { CLUB_ACTIVITIES } from '../activities/mock'
import { MEMBERS } from '../members/mock'
import { SIGNUP_ITEMS } from '../signup/mock'
import { VIOLATIONS } from '../violations/mock'
import { CLUB_PROFILE } from '../club-settings/mock'
import { semesterOf } from '../../lib/semester'
import type { AdKey, ScoringInput } from './scoring'
import type { ActivityResult, AwardDef, AwardKey, EvalFile } from './types'
import { mockPdf, svgPhoto } from './files'

export const EVAL_WINDOW = {
  label: '116 年社團競賽',
  range: '2026/02/01 – 2027/01/31',
  semesters: ['114-2', '115-1'],
}

// ---- 活動成果(ad2–ad4 的輸入) ----

export const ACTIVITY_RESULTS: ActivityResult[] = [
  // 新生迎新茶會:結案有報告與心得,但照片僅 2 張(未達 5 張)→ 展示 ad2 未達標
  {
    activityId: 'ACT-114-0011',
    photos: [svgPhoto('迎新茶會_01', '#5B7C99', '2026/03/06'), svgPhoto('迎新茶會_02', '#7C6A8A', '2026/03/06')],
    videoLink: '',
    report: mockPdf('新生迎新茶會_成果報告', '2026/03/09'),
    feedback: mockPdf('新生迎新茶會_心得(3人)', '2026/03/09'),
  },
  {
    activityId: 'ACT-114-0010',
    photos: ['#4E7A5A', '#8A5A44', '#44618A', '#8A4460', '#60738A'].map((c, i) => svgPhoto(`Python社課_${i + 1}`, c, '2026/04/10')),
    videoLink: '',
    report: mockPdf('Python社課_成果單', '2026/04/10'),
    feedback: mockPdf('Python社課_心得彙整', '2026/04/11'),
  },
  {
    activityId: 'ACT-114-0008',
    photos: [],
    videoLink: 'https://youtu.be/mock-contest-2026',
    report: mockPdf('校際程式競賽_成果單', '2026/05/20'),
    feedback: mockPdf('校際程式競賽_心得彙整', '2026/05/20'),
  },
  // 期末迎新籌備工作坊:已送結案待審核(未結案,尚不計行政分)
  {
    activityId: 'ACT-114-0022',
    photos: ['#3F6E5A', '#6E3F55', '#3F536E', '#6E5A3F', '#55406E'].map((c, i) => svgPhoto(`迎新籌備工作坊_${i + 1}`, c, '2026/06/23')),
    videoLink: '',
    report: mockPdf('期末迎新籌備工作坊_成果報告', '2026/06/23'),
    feedback: mockPdf('期末迎新籌備工作坊_心得(3人)', '2026/06/23'),
  },
]

export function resultOf(activityId: string): ActivityResult {
  let r = ACTIVITY_RESULTS.find((x) => x.activityId === activityId)
  if (!r) {
    r = { activityId, photos: [], videoLink: '', report: null, feedback: null }
    ACTIVITY_RESULTS.push(r)
  }
  return r
}

// 照片重複偵測:全社已上傳照片的 hash(跨活動,防止同組照片重複充數)
export function allPhotoHashes(): Set<string> {
  return new Set(ACTIVITY_RESULTS.flatMap((r) => r.photos.map((p) => p.hash)).filter((h): h is string => !!h))
}

// ---- 管理員調整(以社團為單位;後端對應 eval_adjustments year+club) ----

const overridesByClub: Record<string, Partial<Record<AdKey, number | null>>> = {}
export function overridesOf(club: string): Partial<Record<AdKey, number | null>> {
  return (overridesByClub[club] ??= {})
}

const meritByClub: Record<string, number> = {} // 表現優良加分(學務處登錄)
export const meritOf = (club: string): number => meritByClub[club] ?? 0
export const setMerit = (club: string, v: number): void => {
  meritByClub[club] = v
}

// ---- 評分輸入 ----

export function closedActivities() {
  return CLUB_ACTIVITIES.filter(
    (a) => a.status === 'closed' && EVAL_WINDOW.semesters.includes(semesterOf(a.date)),
  )
}

export function buildScoringInput(club: string): ScoringInput {
  return {
    closed: closedActivities().map((a) => ({
      id: a.id,
      name: a.name,
      date: a.date,
      large: !!(a.isLarge && a.largeApproved),
    })),
    results: ACTIVITY_RESULTS.map((r) => ({
      activityId: r.activityId,
      photoCount: r.photos.length,
      hasVideoLink: r.videoLink.trim() !== '',
      hasReport: !!r.report,
      hasFeedback: !!r.feedback,
    })),
    rosterBySemester: Object.fromEntries(
      EVAL_WINDOW.semesters.map((s) => [s, MEMBERS.filter((m) => m.semester === s).length]),
    ),
    hasWebsite: CLUB_PROFILE.url.trim() !== '',
    // 出席=管理員於活動後登錄之簽到(attendedSessions);僅報名不計分
    leaderMeetingsAttended: SIGNUP_ITEMS.filter((i) => i.kind === 'leader_meeting').reduce(
      (s, i) => s + (i.attendedSessions ?? 0),
      0,
    ),
    cadreTrainingAttended: SIGNUP_ITEMS.some((i) => i.kind === 'cadre_training' && (i.attendedSessions ?? 0) > 0),
    violationCount: VIOLATIONS.filter(
      (v) => v.club === club && v.status === 'violation_open' && EVAL_WINDOW.semesters.includes(semesterOf(v.date)),
    ).length,
    merit: meritOf(club),
  }
}

// ---- 五獎項與上傳槽位(依 docs/社團評鑑/ 各評分標準 PDF) ----

export const AWARDS: AwardDef[] = [
  {
    key: 'club',
    name: '最佳社團獎',
    brief: '行政資料 40% + 社團營運 60%',
    slots: [
      { key: 'admin', group: '行政資料 40%', name: '行政資料(ad1–ad8)', weight: '40%', hints: ['由系統自動評分,見資料總覽上方'], auto: '自動採計' },
      { key: 'o1', group: '組織運作及財務管理 50%(營運)', name: '管理運作', weight: '15%', hints: ['組織章程(宗旨、權責分工、社員權利義務)', '社員大會與幹部選舉紀錄', '交接清冊/工作 SOP、幹訓內容'] },
      { key: 'o2', group: '組織運作及財務管理 50%(營運)', name: '規劃管理', weight: '10%', hints: ['定期社員大會與幹部會議紀錄', '學期行事曆與年度計畫執行成效'] },
      { key: 'o3', group: '組織運作及財務管理 50%(營運)', name: '財務管理', weight: '25%', hints: ['社費收退費與經費支出規範', '帳戶管理人與印章分開保管', '財務報表、預決算公開', '器材清冊與借用紀錄'] },
      { key: 'a1', group: '社團活動績效 50%(營運)', name: '社內活動', weight: '15%', hints: ['採計行政資料之上傳,無須重複準備'], auto: '自動採計' },
      { key: 'a2', group: '社團活動績效 50%(營運)', name: '社團融入 SDGs', weight: '10%', hints: ['標示對應 SDGs 目標與作法', '營隊/社區服務企畫、合作紀錄與成果'] },
      { key: 'a3', group: '社團活動績效 50%(營運)', name: '社會實踐', weight: '15%', hints: ['協助學校或社區活動之清單與佐證', '跨校合辦/校際比賽成果'] },
      { key: 'a4', group: '社團活動績效 50%(營運)', name: '活動特色', weight: '10%', hints: ['特色主題與社團理念之連結', '創新元素或議題結合之佐證'] },
    ],
  },
  {
    key: 'finance',
    name: '最佳財務獎',
    brief: '制度、預算、帳目憑證與公開徵信',
    slots: [
      { key: 'f1', group: '制度 20%', name: '財務管理制度', weight: '20%', hints: ['財務管理辦法、使用原則與運作情形'] },
      { key: 'f2', group: '預算 30%', name: '預算編列、審核', weight: '15%', hints: ['年度預算表(各活動+總預算)', '預算審核會議紀錄與審核證明'] },
      { key: 'f3', group: '預算 30%', name: '經費應變、開源節流', weight: '15%', hints: ['彈性經費運用', '應變措施與開源節流作法'] },
      { key: 'f4', group: '帳目與支出憑證 25%', name: '帳目交接', weight: '10%', hints: ['新舊負責人、總務蓋章證明與交接紀錄'] },
      { key: 'f5', group: '帳目與支出憑證 25%', name: '總帳登記、支出憑證製作', weight: '15%', hints: ['帳冊詳載收支(編碼、社章、單據、審核證明)'] },
      { key: 'f6', group: '公開徵信 25%', name: '帳目核對、公開徵信', weight: '25%', hints: ['定期公告收支與查帳紀錄', '公開回覆管道', '非私人專戶、存簿印章分管', '收支差異分析'] },
    ],
  },
  {
    key: 'activity',
    name: '最佳活動獎',
    brief: '單一活動的企劃、執行與結案',
    slots: [
      { key: 'ac1', group: '活動企劃 25%', name: '活動會議', weight: '10%', hints: ['籌備會議通知、議程、簽到與紀錄'] },
      { key: 'ac2', group: '活動企劃 25%', name: '活動企劃書', weight: '15%', hints: ['企劃書、進度規劃、相關申請書', '活動特色與經費運用'] },
      { key: 'ac3', group: '活動執行 35%', name: '活動前', weight: '10%', hints: ['工作人員招募與場佈、美宣'] },
      { key: 'ac4', group: '活動執行 35%', name: '活動中', weight: '15%', hints: ['器材道具、細流與動線', '工作人員職責'] },
      { key: 'ac5', group: '活動執行 35%', name: '活動後', weight: '5%', hints: ['場地復原、器材歸還'] },
      { key: 'ac6', group: '活動執行 35%', name: '經費運用', weight: '5%', hints: ['經費來源運作、使用原則與效益'] },
      { key: 'ac7', group: '活動結案 30%', name: '成效評估', weight: '10%', hints: ['問卷回饋與分析、活動剪影', '器材與經費使用檢視'] },
      { key: 'ac8', group: '活動結案 30%', name: '資料保存', weight: '5%', hints: ['資料完整性與電腦化、指導老師簽名'] },
      { key: 'ac9', group: '活動結案 30%', name: '活動檢討', weight: '15%', hints: ['檢討會與優缺點分析、傳承方式', '工作人員心得'] },
    ],
  },
  {
    key: 'result',
    name: '最佳成果發表獎',
    brief: '成果的影響力、執行與學習成長',
    slots: [
      { key: 'r1', group: '活動影響力 20%', name: '參與成效', weight: '7 分', hints: ['參與人數與活動性質相符', '參與者來源多元'] },
      { key: 'r2', group: '活動影響力 20%', name: '學習收穫', weight: '7 分', hints: ['參與者習得技能/知識/觀念', '對學習與發展有實際幫助'] },
      { key: 'r3', group: '活動影響力 20%', name: '延續影響', weight: '6 分', hints: ['持續效應、推廣或複製', '參與者後續行動'] },
      { key: 'r4', group: '執行完整度 40%', name: '企劃合理性', weight: '10 分', hints: ['目標明確、籌備合理、分工清楚'] },
      { key: 'r5', group: '執行完整度 40%', name: '現場執行', weight: '10 分', hints: ['流程順暢'] },
      { key: 'r6', group: '執行完整度 40%', name: '執行紀錄', weight: '10 分', hints: ['活動照片佐證,紀錄完整'] },
      { key: 'r7', group: '執行完整度 40%', name: '問題應變', weight: '10 分', hints: ['突發狀況之處理'] },
      { key: 'r8', group: '學習與成長 20%', name: '團隊收穫', weight: '10 分', hints: ['技能、經驗與反思'] },
      { key: 'r9', group: '學習與成長 20%', name: '改進計畫', weight: '10 分', hints: ['具體可行的改善方向'] },
      { key: 'r10', group: '現場發表 15%', name: '現場發表', weight: '15 分', hints: ['現場 7 分鐘發表,形式不拘(簡報/影片/表演)'], auto: '現場評分' },
    ],
  },
  {
    key: 'leader',
    name: '最佳社團負責人獎',
    brief: '個人獎:自我介紹、社團經歷與事蹟',
    slots: [
      { key: 'l1', group: '自我介紹 25%', name: '自我介紹', weight: '10%', hints: ['基本資料、履歷、自傳', '優缺點分析與受推薦原因'] },
      { key: 'l2', group: '自我介紹 25%', name: '人生規劃', weight: '5%', hints: ['短中長期目標與未來規劃'] },
      { key: 'l3', group: '自我介紹 25%', name: '個人特色', weight: '10%', hints: ['人格特質與獨特性'] },
      { key: 'l4', group: '社團經歷 45%', name: '社團經歷', weight: '20%', hints: ['負責工作經驗與感想'] },
      { key: 'l5', group: '社團經歷 45%', name: '社團事蹟及貢獻', weight: '25%', hints: ['社團事蹟、貢獻', '寒暑假服務隊相關貢獻'] },
      { key: 'l6', group: '個人事蹟 30%', name: '個人目標', weight: '10%', hints: ['目標達成情形'] },
      { key: 'l7', group: '個人事蹟 30%', name: '活動經歷', weight: '15%', hints: ['負責工作經驗與感想'] },
      { key: 'l8', group: '個人事蹟 30%', name: '人際經歷', weight: '5%', hints: ['社團內人際交往與感想'] },
    ],
  },
]

// 各獎項上傳:award → slot → files
export const AWARD_UPLOADS: Record<AwardKey, Record<string, EvalFile[]>> = {
  club: { o1: [mockPdf('組織章程_114', '2026/06/02')] },
  finance: { f1: [mockPdf('財務管理辦法', '2026/06/02')] },
  activity: {},
  result: {},
  leader: {},
}

export function slotFiles(award: AwardKey, slot: string): EvalFile[] {
  const bucket = AWARD_UPLOADS[award]
  if (!bucket[slot]) bucket[slot] = []
  return bucket[slot]
}

export function uploadProgress(def: AwardDef): { done: number; total: number } {
  const uploadable = def.slots.filter((s) => !s.auto)
  const done = uploadable.filter((s) => (AWARD_UPLOADS[def.key][s.key] ?? []).length > 0).length
  return { done, total: uploadable.length }
}
