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

Modal:器材與數量、借用區間、申請時填的用途與聯絡電話、借用人姓名輸入;`needs_serial` 的器材另顯示一則提醒,請工讀生現場逐件核對機身序號。底部只有「確認借出」一顆鈕。

## 規則

- 排序依起借日升冪(即將領用在前)
- 狀態轉移 `approved` → `checked_out`;不需 advisory lock —— 核准時已佔用區間額度,點交不改變佔用量
- **序號不入系統**:`needs_serial` 只驅動點交畫面的核對提醒,系統不記錄任何序號值(decisions.md ISS-55b)
- 完成後推 Discord 給該社;行政手動借用(`club_id` 為 NULL)顯示「學務處」,沒有社團可推,改推系統 webhook(J1)

## 未完成 / 問題

- 沒有搜尋或篩選,只能翻頁找社團
