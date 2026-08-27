// 自動增列共用:只在焦點真正離開該列時才整理空列(列內欄位間移動不觸發)
export const blurLeavesRow = (e: React.FocusEvent<HTMLElement>) =>
  !e.currentTarget.contains(e.relatedTarget as Node | null)

// 借用申請的聯絡電話:**10 碼電話或 4 碼校內分機**(2026-08-27 需求方拍板)。
// 只留數字,**剛好 10 碼**才補 `-`(手機 0912-345678、市話 02-27333141)——
// 補在第 4 碼後面對市話是錯的,而借用單上這兩種都會出現。
//
// 超過 10 碼**不截斷**:截掉尾巴會把 `2733-3141#7604`(spec 裡真實出現過的校內寫法)
// 悄悄變成 `27-33314176` —— 一支合法、前後端都放行、但根本不是他要留的號碼。
// 留著整串讓 PHONE_RULE 擋下來,使用者看得到自己填錯了
export const normalizePhone = (v: string): string => {
  const d = v.replace(/\D/g, '')
  if (d.length !== 10) return d
  return d.startsWith('09') ? `${d.slice(0, 4)}-${d.slice(4)}` : `${d.slice(0, 2)}-${d.slice(2)}`
}

/** `normalizePhone` 的輸出形狀。後端 `_validate_phone_required` 收同一組號碼,
 *  但只數 `-` 以外的位數(4 或 10),不管 `-` 打在哪 —— 前端嚴、後端寬 */
export const PHONE_RULE = {
  pattern: /^(\d{4}|\d{4}-\d{6}|\d{2}-\d{8})$/,
  message: '請輸入 10 碼電話或 4 碼校內分機',
}
