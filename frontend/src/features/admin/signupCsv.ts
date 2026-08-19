import type { AdminSignupItem, Registration } from '../../api/adminSignups'

const answerText = (v: unknown): string => (Array.isArray(v) ? v.join('、') : v == null ? '' : String(v))

/** 報名名單 CSV:逐人一列,固定欄位 + 該活動全部自訂欄位(依欄位順序)。
 *
 *  補登的社團沒有參加人名單(系統確實不知道來的是誰),仍然要各出一列 ——
 *  承辦拿這份 CSV 核對到場社團,少掉的正好會是補登進去的那幾個(decisions.md DEC-07)。 */
export function signupCsvRows(item: AdminSignupItem, regs: Registration[]): string[][] {
  const header = [
    '社團',
    ...(item.isEval ? ['參賽獎項'] : []),
    '姓名',
    '學號',
    '系級',
    ...item.fields.map((f) => f.label),
    '報名狀態',
  ]
  const rows = regs.flatMap((r) => {
    const lead = [r.club, ...(item.isEval ? [r.awards.join('、')] : [])]
    if (!r.participants.length) {
      return [[...lead, '', '', '', ...item.fields.map(() => ''), '行政補登']]
    }
    return r.participants.map((p) => [
      ...lead,
      answerText(p.name),
      answerText(p.studentId),
      answerText(p.dept),
      ...item.fields.map((f) => answerText(p[f.key])),
      r.confirmed ? '已確認' : '待確認',
    ])
  })
  return [header, ...rows]
}
