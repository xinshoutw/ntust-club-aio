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

/**
 * 台北的現在(牆鐘時刻,以裝置時區的 Dayjs 表示 —— 只拿來和同樣是台北牆鐘的節次時刻比)。
 *
 * 節次起點是台北的上課時間:拿 `dayjs()` 比,台北 09:30 時紐約的裝置會把今天整排算成已開始、
 * 倫敦的裝置則一節都還沒開始(送出才吃後端的「已開始」)。
 */
export const taipeiNow = (): Dayjs =>
  dayjs(new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }))
