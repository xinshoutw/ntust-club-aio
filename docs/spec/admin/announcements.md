# 發布系統公告

`/admin/announcements` · `admin` · 權限鍵 `aannounce` · `features/admin/AnnouncementsPage.tsx`

## 用途

發布公告給全校 / 特定性質 / 單一社團,可設蓋板與 Email + Discord 通知。

## 資料來源

| 動作 | 端點 |
|---|---|
| 列表 | `GET /admin/announcements?page&page_size`(每頁 20) |
| 發布 | `POST /admin/announcements` |
| 切換蓋板 | `PATCH /admin/announcements/{id}` |
| 刪除 | `DELETE /admin/announcements/{id}` |
| 社團選項 | `GET /admin/clubs/options` |

## 畫面

**發布表單** — 標題、內容(Markdown)、發布對象(全校社團 / 依社團性質 / 單一社團;後兩者出現對應的性質複選或社團 Cascader)、蓋板勾選 + 蓋板截止日期、通知勾選、發布鈕。

社團 Cascader 與行政端四頁共用 `ClubCascader`:社團選項載不到時它整個換成「社團清單載入失敗 + 重試」,此時「單一社團」這種對象選不出來(送出另有 fail-closed 檢查,見下)。

**已發布公告** — 每列:標題、蓋板標記(蓋板至 YYYY/MM/DD)、對象標籤、日期、刪除;下方一行內容節錄。點列開詳情 Modal,底部可即時切換蓋板(開關 + 日期選擇器)與刪除。

## 規則

- 蓋板開關要**先選截止日才生效**:切到「開」只會顯示日期欄,選了日期才 PATCH
- `notify=true` 時在交易內就把收件者解析完(各社聯絡 Email 至多 3 組 + 有設 webhook 的社團),背景任務不再碰業務 DB
- 停用社團不列入通知對象
- 社團端的可見性由 `target_type` 決定:全體 / 性質命中 / 指定本社;停社社團 `attribute` 為 NULL,不命中任何性質分眾
- 發布、切換蓋板、刪除都寫 `audit_logs`

## 未完成 / 問題

- 公告發布後**內容與對象都不能改**,只能切蓋板或整篇刪除
- 蓋板公告會被後續公告擠出社團端取的前 20 筆而靜默失效(見 [shared/shell.md](../shared/shell.md))
- Email/Discord 廣播無 429 處理、無重試,程序重啟即遺失;`email_logs` 只記結果不重送
- `announcements` 表除主鍵外沒有任何索引
