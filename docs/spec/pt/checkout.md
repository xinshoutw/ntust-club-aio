# 器材借出點交

`/pt/checkout` · `staff` · `features/pt/PtCheckoutPage.tsx`

## 用途

已核准的器材借用單現場點交領用。

## 資料來源

| 動作 | 端點 |
|---|---|
| 待借出清單 | `GET /staff/equipment-loans?status=approved` |
| 點交 | `POST /staff/equipment-loans/{id}/checkout` |

## 畫面

表格:社團、器材(含數量)、借用區間、點交方式(一般 / 依序點交)。點列開 Modal。

Modal:器材與數量、借用區間、借用人姓名輸入;`needs_serial` 的器材另逐件列出序號輸入框(件數 = `qty`)。底部只有「確認借出」一顆鈕。

## 規則

- 排序依起借日升冪(即將領用在前)
- 狀態轉移 `approved` → `checked_out`;不需 advisory lock —— 核准時已佔用區間額度,點交不改變佔用量
- 序號規則:`needs_serial=true` 時件數必須等於 `qty` 且不得空白或重複(`SERIALS_REQUIRED` / `SERIALS_DUPLICATED`);`false` 時傳序號會被拒(`SERIALS_NOT_ALLOWED`)
- 完成後推 Discord 給該社;行政手動借用(`club_id` 為 NULL)顯示「學務處」且不推通知

## 未完成 / 問題

- 看不到申請時填的**聯絡電話與用途**,後端 `StaffEquipmentLoanOut` 有 `purpose` 但畫面沒放,電話則從未回傳
- 可點列沒有鍵盤入口,只綁 `<tr onClick>`,鍵盤操作打不開點交 Modal
- **序號只在單張借用單內去重**:`equipment_loans.serials` 是裸 array、無任何約束,同一台實體機的序號可以同時掛在兩張借出中的單上,依序點交的追蹤價值歸零
- 沒有搜尋或篩選,只能翻頁找社團
