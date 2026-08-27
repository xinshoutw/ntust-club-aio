// 自動增列共用:只在焦點真正離開該列時才整理空列(列內欄位間移動不觸發)
export const blurLeavesRow = (e: React.FocusEvent<HTMLElement>) =>
  !e.currentTarget.contains(e.relatedTarget as Node | null)

// 借用申請的聯絡電話:**09 開頭的 10 碼手機,或 4 碼校內分機**(2026-08-27 需求方拍板)。
// 只留數字,邊打邊補 `-`:第 5 碼與第 8 碼各補一個(`0912-345-678`),不是打完才補。
// 4 碼分機停在第一段,沒有 `-`。
//
// 超過 10 碼**不截斷**:截掉尾巴會把 `2733-3141#7604`(spec 裡真實出現過的校內寫法)
// 悄悄變成一支合法、前後端都放行、卻不是他要留的號碼。留著整串讓 PHONE_RULE 擋下來。
// 09 開頭的判定只在規則裡,不在這裡 —— 邊打邊擋會讓人連字都輸不進去
export const normalizePhone = (v: string): string => {
  const d = v.replace(/\D/g, '')
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join('-')
}

/** `normalizePhone` 的輸出形狀。後端 `_validate_phone_required` 收同一組號碼,
 *  但只看去掉 `-` 之後的位數與開頭,不管 `-` 打在哪 —— 前端嚴、後端寬 */
export const PHONE_RULE = {
  pattern: /^(\d{4}|09\d{2}-\d{3}-\d{3})$/,
  message: '請輸入手機號碼或分機號碼',
}
