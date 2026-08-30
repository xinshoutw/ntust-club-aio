import dayjs, { type Dayjs } from 'dayjs'

/**
 * 台北時區的「今天」(當日 00:00)。
 *
 * 後端所有日界判定都走 `booking_service.today_taipei()`,前端拿 `dayjs()` 的裝置本地日
 * 去比就會在使用者不在 +08:00 時對不上 —— 幹部人在歐洲的清晨,畫面說可以申請、
 * 送出卻吃「借用日期不得早於今天」,而且看不出哪裡違規。日期選擇器的 disabled、
 * 色格能不能點、取消鈕的「開始日之前」全部用這一份。
 */
export const taipeiToday = (): Dayjs =>
  dayjs(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }))
