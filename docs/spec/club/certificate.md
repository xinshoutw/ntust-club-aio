# 幹部證明

`/certificates` · `club` · `features/applications/CertificatePage.tsx`

## 用途

申請正/副負責人的幹部證明。副標寫「製作需 2 個工作天」。

## 資料來源

| 動作 | 端點 |
|---|---|
| 學年期選項 | `GET /club/members/semesters`(名單實際有的學期,不種當學期) |
| 姓名預覽 | `GET /club/members?semester=&kind=`(前端逐頁抓齊) |
| 列表 | `GET /club/officer-certificates?status=`(正在申請=未完成全部;最近申請=已完成 `page_size=5`) |
| 送出 | `POST /club/officer-certificates` |

## 畫面

表單:擔任學年度或學期(下拉)、社團名稱(唯讀)、擔任職位(社長/會長 或 副社長/副會長,顯示詞依社團 `kind` 推導)、姓名(唯讀,自動帶出)。

姓名欄有五種狀態:未選完 → placeholder「請選擇學年期與職位」;查詢中 → 「查詢名單中…」;找到 1 位 → 顯示姓名,送出鈕啟用;0 位 / 多位 → 紅字說明並停用送出;查詢失敗 → 錯誤與重試。

下方兩張表:正在申請(非 `completed`)、最近申請(`completed` 近 5 筆)。

## 規則

- **姓名不可自填**,由成員名單依「學年期 × 身份」推導;0 位或多位都擋送出(前後端各一道)
- 學年期可選整學年(如 `114`)或單一學期(`114-1`);整學年時查兩學期名單取聯集
- 學年期選項一律取自**名單實際有的學期**(`termOptions`,不種當學期);選項載不到時下拉的 placeholder 說「學年期載入失敗」並附重試,不說「名單尚無資料」—— 後者是把責任推給社團自己的名單,而整張表單其實永遠送不出去
- 狀態與郵局異動共用 `ApplicationStatus`:`pending` → `processing` → `completed`,無退回;行政端**可跳過處理中直接完成**(D-25),所以這裡看得到單子從「審核中」一步變「已完成」
