# 檔案管理

`/admin/files` · `admin` · 權限鍵 `afiles` · `features/admin/AdminFilesPage.tsx`

## 用途

看磁碟空間怎麼被吃掉,清理報修的大型影片。

## 資料來源

| 動作 | 端點 |
|---|---|
| 空間彙總 | `GET /admin/files/usage` |
| 報修檔案 | `GET /admin/files?module=repair&page=&page_size=`(伺服器分頁,每頁 50,同為大小降冪) |
| 大型檔案 | `GET /admin/files?module=&sort=&page=&page_size=`(伺服器分頁,每頁 50,預設依大小降冪;`module` 可重複帶多值) |
| 刪除 | `DELETE /admin/files/{id}` |
| 下載 | `GET /files/{id}`(**本頁的權限不含下載**,見下方規則) |

## 畫面

**空間使用** — 依模組分段(活動結案 / 評鑑資料 / 活動申請附件 / 線上申請 / 空間報修)+ 「文字內容」(整個 DB 的 `pg_database_size` 估算)+ 實體磁碟總量與可用量。有報修檔案時報修排第一。使用率超過門檻時比例條下方出現水位提示(黃 ≥80%、紅 ≥90%)。

**報修檔案** — 檔名、社團、大小、上傳日期、狀態、動作(可刪),底部分頁。件數取 `meta.total`、佔用取空間彙總的權威值(已歸檔者不佔空間,當頁加總也不是總量);刪掉整頁最後一列時退回前一頁。

**大型檔案** — 檔名、模組、社團、大小、上傳日期、狀態、動作,底部分頁。非報修模組的刪除鈕停用,Tooltip「競賽採計與流程檔案依歸檔政策由系統管理」。

## 規則

- **看得到清單不等於看得到內容**(decisions.md D-02):下載要該類檔案所屬頁面的權限(`core/permissions.FILE_SUBJECT_KEYS`),`afiles` 本身不在任何一列 —— 這頁的用途是看磁碟怎麼被吃掉、清理報修影片,不是取得檔案。列表逐列回 `can_download`,不可下載者的圖示反灰並附說明,不給按了才 404 的連結
- 模組由磁碟路徑前綴推導(`reports`/`eval`/`activities`/`postal`/`maintenance`)
- 大型檔案的「全部模組」= 明列報修以外的四個模組交給後端篩(報修有專屬區);篩選與總數都由後端決定,換模組或換排序都回到第 1 頁,且不沿用上一份查詢結果
- **只有報修檔案可直接刪除**,其餘依歸檔政策由系統管理(回 403)
- **歸檔由 infra 執行**(decisions.md GAP-08):系統不做歸檔介面,`archived_at` 由維運直接設定;系統負責的是歸檔之後的行為 —— 已歸檔(`archived_at` 非 NULL)的檔案已離盤,不計佔用、不計補件份數,再下載回 410
- 刪除先 commit DB 再 unlink 磁碟,失敗只留孤兒檔不會出現「有列無檔」
- 刪除寫 `audit_logs`
- **容量水位**(decisions.md OPS-07):`disk_level` 由後端算,`warn` ≥80%、`alert` ≥90%
- **上傳前置閘**(ISS-43):到 `alert` 水位即不再接受任何上傳(對前端是 507)。閘門同時掛在 nginx 的 `auth_request` 子請求(`GET /auth/precheck`)上 —— 該子請求回的是 **403 + `X-Upload-Gate: closed`**(`auth_request` 只認 2xx/401/403,其餘一律轉成 500,使用者就只看得到「HTTP 500」),nginx 依那個標頭換成 507 的文案 —— 在 Starlette 把 multipart 落到 `/tmp` 之前就回絕,暫存檔完全不落地;`save_upload` 內另擋一次,直呼 API 也繞不過。容量檢查本質是 TOCTOU,決議不做配額預留,改以「離寫滿還遠就放行、接近就一律擋掉」收斂 —— 並發的幾個大檔最多把使用率再往上推一點,而不是把磁碟吃到 0
- **容量告警不必靠人開這頁**:`scripts/check_disk.py`(host cron 每日 08:20)到 80% 推警示、90% 推告警到 Discord;本頁的水位提示是同一份判定的畫面版

## 未完成 / 問題

- 模組篩選與大小排序沒有對應索引
