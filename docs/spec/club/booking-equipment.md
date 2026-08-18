# 器材借用

`/bookings/equipment` · `club` · `features/bookings/EquipmentPage.tsx`

## 用途

借器材。借用區間不由社團填,而是從關聯活動推導。

## 資料來源

| 動作 | 端點 |
|---|---|
| 器材主檔 + 可借數 | `GET /club/equipment?activity_id=`(`meta` 回推導區間) |
| 關聯活動下拉 | `GET /club/activities?status=approved&ended=false`(已結束由後端篩掉);查詢失敗時下拉說「活動清單載入失敗」,不說「無審核通過之活動」 |
| 正在借用 / 最近借用 | `GET /club/equipment-loans?active=true\|false` |
| 送出 | `POST /club/equipment-loans` |
| 取消 | `POST /club/equipment-loans/{id}/cancel` |

## 畫面

左右兩欄。

**器材一覽**(左)— 品項、點交方式(一般 / 依序點交)、可借 / 總數。未選關聯活動前可借數顯示 `—` 且整列不可點;可借 0 的列灰底不可點。點列即把品項帶入右側表單。

**借用申請**(右)— 關聯活動(選後在下方顯示「可借用區間 X – Y」)、品項、數量、用途、聯絡電話。

下方兩張表:正在借用(品項、期間、活動/用途、借用人、狀態、取消)、最近借用(多一欄借用/歸還人)。

## 規則

- **借用區間 = 活動開始日 −N 個工作天 ~ 活動結束日 +M 個工作天**(預設 2/1,`system_settings.equipment_workday_buffer`)。工作天排除週末與 `holidays` 表的假日。區間在**申請當下推導後寫死**,之後調設定不回溯
- 可借數 = 總數 − 該區間內重疊的未歸還未退回借用量(pending/approved/checked_out 都算佔用)
- 數量上限 = min(區間可借數, 該器材 `max_lease_count`);兩者都是後端權威
- 換活動即換區間,原選品項在新區間不可借時自動清除
- 一單一品項;多品項要開多單,點交與逾期各自獨立
- 送出時以 `pg_advisory_xact_lock` 鎖器材,序列化「檢核 → 寫入」
- 已結束的活動不能借;推導出來的區間若整段已過去也擋
- 停權中的社團頁首顯示停權標示與到期日,送出鈕停用(後端亦擋);社團資料查詢首載失敗時改顯示「無法確認停權狀態」
- 申請時填的聯絡電話會回給工讀生端的三頁點交畫面(`schemas/staff.py`):現場點交與催還都要當場聯絡得到人

## 未完成 / 問題

- 可借數逐列查詢(N+1),器材主檔每多一項就多一次 DB 往返
