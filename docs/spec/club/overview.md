# 總覽(社團端首頁)

`/` · `club` · `features/overview/OverviewPage.tsx`

## 用途

登入後第一眼:該處理的事、公告、進行中的申請。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 待辦、進行中申請(活動) | `GET /club/activities?status=`(僅送審中/結案審核中/已核准五種;待辦的鎖定與可結案都落在「已核准」裡) |
| 公告 | `GET /club/announcements?page=1&page_size=20` |
| 標為已讀 | `POST /club/announcements/read` |
| 進行中申請(線上申請) | `GET /club/maintenance`、`/club/postal-changes`、`/club/officer-certificates` |

## 畫面

三塊卡片,標題右側都有數量徽章。

**待辦** — 只列需要結案的活動:
- `closing_due`:「『X』請於 YYYY/MM/DD 前完成結案(剩 N 天)」+ 主要鈕「去結案」
- `locked`:「『X』應於 YYYY/MM/DD 前結案,現已鎖定;請洽課外活動指導組解鎖」+ 次要鈕「查看活動」
- 排序:已鎖定在前,其餘依期限近到遠

**公告**(左)— 標題、`公告`/`通知` 標籤、日期、內容 Markdown 節錄;點擊開 Modal 看全文。進入本頁即自動標記全部已讀。

**進行中申請**(右)— 依「活動 / 借用 / 線上申請」分組,每列是名稱 + 狀態 pill,點擊導向對應列表頁。

## 規則

- 結案期限、鎖定與可結案一律讀後端的 `close_deadline` / `close_locked` / `can_close`(鎖定月數在系統設定可調)
- 「進行中」的活動狀態集合:`pending_advisor`、`pending_chief`、`pending_dean`、`approved`、`closing_pending_advisor`;草稿、退回、已結案不列入
- 線上申請只列 `pending`(報修另含 `in_progress`)
- 借用三類只列 `pending`:已核准的是「正在借用」,在借用總覽頁看
- 組成這張卡的七支查詢一起看載入與錯誤:任一支失敗就顯示錯誤與重試,而不是安靜少掉一個分類
- 公告的 `scope` 由 `is_auto` 推導:系統自動通知標「通知」,行政發布標「公告」

## 未完成 / 問題

- 用 `<Spin>` 而非設計規範偏好的 Skeleton
