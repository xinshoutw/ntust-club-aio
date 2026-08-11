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

**逾期未結案**(下)— 表格:社團、活動名稱、結案期限、狀態(已逾期 / 已解鎖)、動作(僅鎖定中出現「解鎖」)。逾期最久的在前。點列開**唯讀**的活動詳情彈窗(重用 `ActivityReviewModal`)。

**結案審核彈窗** — 社團、活動日期、實際時間/地點/人數、送件時間、經費(核定補助 · 自籌 · 實支;超出總經費時實支標紅)、成果(照片張數 · 影片連結 · 心得人數;照片 <5 張且無影片時紅字提示不計分)、活動重點 / 達成目標 / 其他成果 / 檢討會議、照片縮圖牆(點開原圖)、學習心得全文。

底部「繳交確認」三個勾選框(活動照片 / 成果報告表 / 學習心得),說明「未確認項目評鑑以 0 分計」。動作:退回(必填原因)、核准結案。

詳情載入失敗時內容換成失敗原因與重試鈕,並收掉退回與核准 —— 繳交確認三旗標預設全勾,看不到照片與心得還能核准等於整份 fail-open。背景重抓失敗(手上已有詳情)不動內容,否則讀得到的單反而變成不能簽。

## 規則

- 結案是**承辦人單關**;核准後狀態轉 `closed`,退回則轉回 `approved` 讓社團補件重送
- 繳交確認寫進 `activity_reports.{photos,report,reflections}_confirmed`,`services/scoring.py` 據此把未確認項目算 0 分
- 解鎖只對「已核准 + 已逾期鎖定」的活動有效;**未逾期不得預先解鎖**,否則等於永久繞過鎖定
- 逾期清單 `overdue=true` 含已鎖定與已解鎖兩種,由回應的 `close_locked` 區分
- 逾期清單在 DB 端篩(`activity_service.close_overdue_sql`),與 `is_close_locked` 共用同一條期限與 `close_lock_months`

## 未完成 / 問題

- **繳交確認四層全部 fail-open**:前端初值三項全勾 → 後端 `body` 可整個省略 → schema 三旗標預設 `True` → model 欄位本身也是 `default=True, server_default=true`。承辦人不看就按核准 = 全部視為已繳
- 只持 `approve_advisor`(不持 `aclose`)的帳號進得了本頁,但受限視野與逾期分支的條件交集恆空 —— 「逾期未結案」區塊會**靜默顯示 0 件**,而不是告知無權限
- 結案在期限內送出但被退回,社團補件時若已逾鎖定期限就無法重送,只能再請行政解鎖
- `aclose` 權限鍵是否應涵蓋「結案核准」動作尚未確認 —— 目前核准要 `approve_advisor`,只持 `aclose` 的帳號進得了頁面但按不了核准
- 沒有批次核准
