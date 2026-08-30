# 器材歸還點交

`/pt/checkin`(行政端 `/admin/pt/checkin`,鍵 `astaff`) · `staff` · `features/pt/PtCheckinPage.tsx`

## 用途

借出中的器材現場點收歸還。

## 資料來源

| 動作 | 端點 |
|---|---|
| 借出中清單 | `GET /staff/equipment-loans?status=checked_out` |
| 點交 | `POST /staff/equipment-loans/{id}/checkin` |

## 畫面

表格:社團、器材(含數量)、借用區間(逾期單加「已逾期」標記)、收件人、出借人(辦理借出點交的工讀生)。點列開 Modal。

Modal:器材與數量、收件人與出借人、逾期標記、歸還人姓名(必填)、備註(選填,如外觀損傷、配件缺漏)。底部只有「確認歸還」一顆鈕。

## 規則

- 排序依結束日升冪(應歸還時限單調)
- 狀態轉移 `checked_out` → `returned`;歸還後區間佔用立即釋放,可借數推導自動生效
- 完成後推 Discord 給該社;行政手動借用沒有社團可推,改推系統 webhook(J2)
