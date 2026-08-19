# 結案審核

`/admin/close-review` · `admin` · 權限鍵 `aclose` / `approve_advisor` · `features/admin/CloseReviewPage.tsx`

## 用途

結案的承辦人單關審核,以及逾期未結案的解鎖。

## 資料來源

| 動作 | 端點 |
|---|---|
| 待審結案 | `GET /admin/activities?status=closing_pending_advisor&sort=-date` |
| 逾期未結案 | `GET /admin/activities?overdue=true&sort=date` |
| 詳情 | `GET /admin/activities/{id}` |
| 核准 / 退回 | `POST /admin/activities/{id}/close-approve`、`/close-reject` |
| 解鎖 | `POST /admin/activities/{id}/unlock`(需 `aclose`) |

## 畫面

**待審結案**(上)— 活動名、社團 · 活動日期、核定補助、「審核」鈕。伺服器分頁每頁 25。

**逾期未結案**(下)— 表格:社團、活動名稱、結案期限、狀態(已逾期 / 已解鎖)、動作(鎖定中且持 `aclose` 才出現「解鎖」—— 核准與退回另有 `approve_advisor` 這條路,解鎖沒有)。逾期最久的在前。點列開**唯讀**的活動詳情彈窗(重用 `ActivityReviewModal`)。

**結案審核彈窗** — 社團、活動日期、實際時間/地點/人數、送件時間、經費(核定補助 · 自籌 · 實支;超出總經費時實支標紅)、成果(照片張數 · 影片連結 · 心得人數;照片 <5 張且無影片時紅字提示不計分)、活動重點 / 達成目標 / 其他成果 / 檢討會議、照片縮圖牆(點開原圖)、學習心得全文。

底部「繳交確認」三個勾選框(活動照片 / 成果報告表 / 學習心得),說明「未確認項目評鑑以 0 分計」。動作:退回(必填原因)、核准結案。

詳情載入失敗時內容換成失敗原因與重試鈕,並收掉退回與核准 —— 繳交確認三旗標預設全勾,看不到照片與心得還能核准等於整份 fail-open。背景重抓失敗(手上已有詳情)不動內容,否則讀得到的單反而變成不能簽。

## 規則

- 結案是**承辦人單關**;核准後狀態轉 `closed`,退回則轉回 `approved` 讓社團補件重送
- 繳交確認寫進 `activity_reports.{photos,report,reflections}_confirmed`,`services/scoring.py` 據此把未確認項目算 0 分。三個旗標問的是**承辦認不認可採計**,不是「社團有沒有繳」—— 照片與心得在送出結案時後端就強制存在,所以預設全勾;改成預設不勾(fail-closed)只會在承辦沒動它時無故把評鑑分數歸零,而且沒有回復路徑。**刻意保留的只有前端初值** —— `CloseApproveIn` 的三個旗標與 `body` 本身都是必填,直呼 API 繞不過這個確認動作
- 解鎖只對「已核准 + 已逾期鎖定」的活動有效;**未逾期不得預先解鎖**,否則等於永久繞過鎖定
- **退回結案即自動解鎖**(decisions.md D-05):結案已在期限內送到,補件往返不該再被期限擋下。該活動仍在逾期清單裡,只是狀態顯示「已解鎖」、沒有解鎖鈕。自動解鎖會寫 `activity_close_unlocked` 稽核與一筆 `UNLOCK` 簽核紀錄 —— 「這張單是誰解的鎖」要查得到
- **解鎖是永久的**:`close_unlocked` 沒有任何地方會設回 false,也就是說被退回過一次的結案從此不受期限約束。仍列在逾期清單裡供承辦追蹤,但期限本身對它不再生效
- 逾期清單 `overdue=true` 含已鎖定與已解鎖兩種,由回應的 `close_locked` 區分
- 逾期清單在 DB 端篩(`activity_service.close_overdue_sql`),與 `is_close_locked` 共用同一條期限與 `close_lock_months`

- **`aclose` 涵蓋核准與退回**(decisions.md D-08):能看就能簽,不必另持 `approve_advisor`
- 「逾期未結案」全是 `approved` 狀態:看不到該狀態的帳號查詢直接回 403,**不給一個假的 0 件**

## 未完成 / 問題

- 沒有批次核准
