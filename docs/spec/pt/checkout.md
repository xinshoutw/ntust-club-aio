# 器材借出點交

`/pt/checkout`(行政端 `/admin/pt/checkout`,鍵 `astaff`) · `staff` · `features/pt/PtCheckoutPage.tsx`

## 用途

已核准的器材借用單現場點交領用。

## 資料來源

| 動作 | 端點 |
|---|---|
| 待借出清單 | `GET /staff/equipment-loans?status=approved`(載入時先把區間已過的已核准單撤銷,見規則) |
| 點交 | `POST /staff/equipment-loans/{id}/checkout` |

## 畫面

表格:社團、器材(含數量)、借用區間、點交方式(一般 / 依序點交)。點列開 Modal。

Modal:器材與數量、借用區間、申請時填的用途與聯絡電話、收件人姓名輸入;`needs_serial` 的器材另顯示一則提醒,請工讀生現場逐件核對機身序號。底部只有「確認借出」一顆鈕。

## 規則

- 排序依起借日升冪(即將領用在前)
- **區間過了還沒領的單由系統撤銷**(decisions.md D-40):清單載入時先掃一次 `approved 且 end_date < 今天 且 club_id 非空`(台北日期;結束日當天還算得到領,與側欄徽章同一條界線;行政手動借用是補登入口,不掃),落 `cancelled`、寫 REVOKE 簽核紀錄(簽核者空)與 `role=system` 稽核、推 Discord 給該社(沒有社團可推時推系統 webhook,D13b);社團在借用總覽的「最近申請」點得開撤銷原因。每日催還排程也掃一次(只有上班日)。實作在 `services/loan_expiry.py`
- **清單的正確性不綁在那一次掃描上**:待借出的查詢自己帶 `end_date >= 今天`,掃描失敗(鎖等待、DB 錯誤)只記 log、清單照出;社團「正在借用」與行政「借用中」(`equipment_loan_ongoing_expr`)同樣帶日期界線,週末沒人掃也不會列出過期的已核准
- **區間已過的單點交不了**(409「借用區間已過，不可借出」):昨天開著的頁面今天照樣按得到,但那張單已經不該借出
- 狀態轉移 `approved` → `checked_out`;不需 advisory lock —— 核准時已佔用區間額度,點交不改變佔用量
- **序號不入系統**:`needs_serial` 只驅動點交畫面的核對提醒,系統不記錄任何序號值(decisions.md ISS-55b)
- 完成後推 Discord 給該社;行政手動借用(`club_id` 為 NULL)顯示「學務處」,沒有社團可推,改推系統 webhook(J1)

## 未完成 / 問題

- 沒有搜尋或篩選,只能翻頁找社團
- D-40 的掃描由 GET 觸發,不在 CSRF 的保護範圍;攻擊者只能提早觸發本來就會發生的撤銷,影響極小。清單與各讀取面已各自帶日期界線,要收就把掃描只留在排程
