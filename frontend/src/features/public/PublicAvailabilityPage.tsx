import PageHeader from '../../components/ui/PageHeader'
import BookingGrid from '../bookings/BookingGrid'
import PublicShell from './PublicShell'

/** 免登入的借用情形:色格圖的公開預覽(`/availability`)。
 *
 *  看得到、翻得動、點不了 —— `BookingGrid` 沒收到借用入口就不畫可點的格子。
 *  首頁已改成社團導覽,這一頁由 topbar 的「借用情形」進來;回去的路是同一顆鈕
 *  (在這一頁它顯示「社團導覽」),所以不另外放返回鈕。 */
export default function PublicAvailabilityPage() {
  return (
    <PublicShell mobileTitle="借用情形">
      <PageHeader title="借用情形" sub="登入後才能提出借用申請" />
      <BookingGrid />
    </PublicShell>
  )
}
