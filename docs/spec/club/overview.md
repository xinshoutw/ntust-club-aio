# 總覽(社團端首頁)

`/` · `club` · `features/overview/OverviewPage.tsx`

## 用途

登入後第一眼:該處理的事、公告、進行中的申請。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 待辦、進行中申請(活動) | `GET /club/activities`(前端 `fetchAllPages` 抓完所有分頁後推導) |
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

- 結案期限 = 活動 `end_date` + 1 個月,前端 dayjs 推導;鎖定與可結案由後端 `close_locked` / `can_close` 決定
- 「進行中」的活動狀態集合:`pending_advisor`、`pending_chief`、`pending_dean`、`approved`、`closing_pending_advisor`;草稿、退回、已結案不列入
- 線上申請只列 `pending`(報修另含 `in_progress`)
- 公告的 `scope` 由 `is_auto` 推導:系統自動通知標「通知」,行政發布標「公告」

## 未完成 / 問題

- 「進行中申請」永遠不含借用 —— `tracked` 只組活動與線上申請。`categories` 列了「借用」但無資料來源,該分類會被 `filter` 濾掉,所以畫面連空標題都不會出現,更難察覺
- 待辦與進行中都靠 `fetchAllPages` 把該社所有非結案活動抓回前端再篩,分頁形同虛設
- 用 `<Spin>` 而非設計規範偏好的 Skeleton
