# 器材歸還點交

`/pt/checkin` · `staff` · `features/pt/PtCheckinPage.tsx`

## 用途

借出中的器材現場點收歸還。

## 資料來源

| 動作 | 端點 |
|---|---|
| 借出中清單 | `GET /staff/equipment-loans?status=checked_out` |
| 點交 | `POST /staff/equipment-loans/{id}/checkin` |

## 畫面

表格:社團、器材(含數量)、借用區間、借用人。點列開 Modal。

Modal:器材與數量、借用人、歸還人姓名(必填)、備註(選填,如外觀損傷、配件缺漏)。底部只有「確認歸還」一顆鈕。

## 規則

- 排序依結束日升冪(應歸還時限單調)
- 狀態轉移 `checked_out` → `returned`;歸還後區間佔用立即釋放,可借數推導自動生效
- 完成後推 Discord 給該社

## 未完成 / 問題

- Modal 不顯示借出時登記的序號,依序點交器材無從核對是不是同幾件
- 逾期單在此頁沒有任何標示,點收時看不出這單已經逾期
- 可點列沒有鍵盤入口
