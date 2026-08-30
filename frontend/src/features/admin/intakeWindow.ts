import type { FixedWindow } from '../../api/bookings'

/** 受理期間的說明句;開放中(或查不到)時不顯示橫幅。
 *  「還沒開始」與「已經結束」是相反的兩句話,不能都寫成「未開放」 */
export function intakeNote(w: FixedWindow | undefined): string | null {
  if (!w || w.state === 'open') return null
  const range = w.openFrom && w.openUntil ? `(${w.openFrom} – ${w.openUntil})` : ''
  if (w.state === 'unset') return `尚未設定受理期間，社團無法送出申請`
  if (w.state === 'upcoming') return `受理期間尚未開始 ${range}，社團無法送出申請`
  return `受理期間已結束 ${range}，社團無法送出申請`
}
