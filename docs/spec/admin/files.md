# 檔案管理

`/admin/files` · `admin` · 權限鍵 `afiles` · `features/admin/AdminFilesPage.tsx`

## 用途

看磁碟空間怎麼被吃掉,清理報修的大型影片。

## 資料來源

| 動作 | 端點 |
|---|---|
| 空間彙總 | `GET /admin/files/usage` |
| 報修檔案 | `GET /admin/files?module=repair` |
| 大型檔案 | `GET /admin/files?module=&sort=`(固定第 1 頁,依大小降冪) |
| 刪除 | `DELETE /admin/files/{id}` |
| 下載 | `GET /files/{id}` |

## 畫面

**空間使用** — 依模組分段(活動結案 / 評鑑資料 / 活動申請附件 / 線上申請 / 空間報修)+ 「文字內容」(整個 DB 的 `pg_database_size` 估算)+ 實體磁碟總量與可用量。有報修檔案時報修排第一。

**報修檔案** — 檔名、社團、大小、上傳日期、狀態、動作(可刪)。

**大型檔案** — 檔名、模組、社團、大小、上傳日期、狀態、動作。非報修模組的刪除鈕停用,Tooltip「競賽採計與流程檔案依歸檔政策由系統管理」。

## 規則

- 模組由磁碟路徑前綴推導(`reports`/`eval`/`activities`/`postal`/`maintenance`)
- **只有報修檔案可直接刪除**,其餘依歸檔政策由系統管理(回 403)
- 已歸檔(`archived_at` 非 NULL)的檔案已離盤,不計佔用;再下載回 410
- 刪除先 commit DB 再 unlink 磁碟,失敗只留孤兒檔不會出現「有列無檔」
- 刪除寫 `audit_logs`

## 未完成 / 問題

- **檔案下載對 admin 一律放行**:`can_access` 對 `UserRole.ADMIN` 直接 `return True`,只持 `afiles` 的管理員可下載全系統檔案,包含郵局存簿影本這類個資
- **歸檔政策定義了但沒有任何操作介面**:`archived_at` 沒有地方可以設,磁碟只增不減
- 大型檔案清單固定只取第一頁,沒有分頁也沒有標示「只顯示前 N 筆」
- 模組篩選與大小排序沒有對應索引
- 容量告警尚未建置,磁碟滿了只會在上傳時回 507
