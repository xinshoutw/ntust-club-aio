# 臨時場地借用

`/bookings/venue`(可帶 `?venue=&date=&period=`) · `club` · `features/bookings/VenueBookingPage.tsx`

## 用途

單日、指定節次的場地借用。必須綁定一個審核通過且尚未結束的活動。

## 資料來源

| 動作 | 端點 |
|---|---|
| 場地主檔 | `GET /club/venues`(取 `allow_temp`) |
| 關聯活動下拉 | `GET /club/activities?status=approved&ended=false`(已結束由後端篩掉);查詢失敗時下拉說「活動清單載入失敗」,不說「無審核通過之活動」 |
| 正在申請 / 最近申請 | `GET /club/venue-bookings?active=true\|false` |
| 送出 | `POST /club/venue-bookings` |
| 取消 | `POST /club/venue-bookings/{id}/cancel` |

## 畫面

表單:場地、關聯活動、用途、聯絡電話、日期 + 節次複選(`PeriodPicker`,滑鼠/觸控筆可拖曳批量選取;觸控只認單點,見 `booking-fixed`)。下方兩張表:正在申請(可取消)、最近申請。

從借用總覽點空格進來時,`venue` / `date` / `period` 自動帶入。日期經嚴格格式驗證,過去日期不帶入;場地待主檔載入後才回填。

## 規則

- **過去時間全面禁止**:日期選擇器禁過去;選「今天」時已開始的節次禁選,已選到的會自動剔除。後端同樣擋
- 同社、同場地、同一天**節次重疊**時只能有一筆未退回/未取消的申請(節次完全不重疊即可各送一張);檢核前先取該社團的 advisory lock,雙擊送出不會落兩筆
- 送出時檢核場地不開放規則(`venue_block_rules`),命中即 422
- 停權中的社團送出時被擋;頁首同時顯示停權標示與到期日,送出鈕停用
- 可取消的界線是**最早節次的起始時刻**,審核中與已核准一致 —— 與 `active=true` 的分界同一條,所以「正在申請」表內必定有取消入口

## 未完成 / 問題

- 送出時不檢核他社已核准的借用(核准端會擋,含臨時 × 固定的交叉檢核)
- 聯絡電話送出後,行政端與工讀生端都拿不到 —— 後端從未回傳這個欄位
