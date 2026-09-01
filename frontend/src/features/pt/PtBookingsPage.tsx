import PageHeader from '../../components/ui/PageHeader'
import BookingGrid from '../bookings/BookingGrid'

/** 借用總覽(工讀生):只有借用情形色格圖,櫃台查詢用。
 *
 *  工讀生不提出借用申請,也不審核 —— 沒給 `onBook*` 就不畫可點的格子,
 *  與未登入首頁一樣是純預覽(同一個 `BookingGrid`,不另做一份)。 */
export default function PtBookingsPage() {
  return (
    <div>
      <PageHeader title="借用總覽" sub="僅供查詢,不可申請借用" />
      <BookingGrid />
    </div>
  )
}
