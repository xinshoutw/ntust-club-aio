# Session Handoff(2026-07-17,第十輪:需求方連續回饋落地)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(40 commit,`61996d4..HEAD`,分支 `dev` 已推)

需求方在同一 session 內連續給了多批回饋,全部前後端落地並補測試。**永久決議已寫入 `AGENTS.md`「UI/規則調整決議(2026-07-17 第十輪)」**,以下只列摘要與驗證狀態。

### 品牌 / 登入頁
- NTUST logo(`public/logo.svg`)= favicon + header 最左圖示;`logo.png` 供 Discord webhook 頭貼(`notify._with_identity`)
- 登入頁移除多餘捲軸(`box-sizing:border-box`);版權宣告自動跨年(`Copyright © 2026[-{今年}]`)+ 維護者資訊 popover(mailto/Discord)

### 公告 / 鈴鐺
- 蓋板「不再顯示」持久化(`announcement_dismissals` 表 + `POST /club/announcements/{id}/dismiss` 冪等)
- 鈴鐺已讀改水位線(`clubs.announcements_read_at`;`POST /club/announcements/read`);開鈴鐺或進總覽即標已讀
- 蓋板右上倒數環→X;總覽公告預覽渲染 markdown、鉗兩行、防爆寬

### 活動申請 / 結案
- 草稿可**部分填寫**(nullable date + status-scoped CHECK;submit/非草稿 update 才檢核完整並列缺漏)
- 結案照片改「**送出結案時才上傳、不進草稿**」(前端暫存 + SHA-256 去重 + 加總上限;送出失敗回滾已上傳照片)
- 修「資工系學會-暑期程式馬拉松」結案草稿全白畫面(seed close_draft 誤用 snake_case;已改 camelCase + 前端防護)

### 借用
- 場況格帶社團名(hover Tooltip);自己審核中→「審核中」(非「我的借用」);**pending 固定借用也顯示**
- 新增 `GET /club/bookings/availability-range`(批次區間,取代單一場地 15 天檢視的 15 個逐日請求)
- 最近借用/器材清單改依日期降冪(新在上)
- 修 `GET /club/members/semesters` 500(`ORDER BY DISTINCT` 非法語法)

### 上傳上限 / 儲存 / 經費科目 / 器材
- 上傳上限改「**依申請性質給加總上限**」(活動 15 / 報修 100 / 結案照片 10 MB);前端常數移除,改讀 `GET /club/config`
- 儲存總量改用**實際磁碟可用空間**(移除 capacity/reserve 設定;per-club 保留)
- 經費科目 `budget_categories` 改 `[{name, hint}]`(hint 移後端;系統設定頁 name+hint 逐列編輯)
- 器材**移除類別**,點交方式改 `needs_serial`(一般/依序點交);新增 `/admin/equipment` super CRUD;系統設定頁「器材主檔」逐列即時 PATCH;seed 17 項
- 系統設定頁「儲存」按鈕移回整頁最底(器材主檔卡片改置設定表單前)

## 驗證現況(全綠)

- 後端:`timeout 300 uv run pytest -q` **197 passed**、`ruff check .` 全綠;四個新 migration `alembic up/down/up` 於 dev 庫驗證過(`4290719adc82` / `007931f1afc7` / `ccb5bc27926e` / `33e4dcd04463`)
- 前端:`pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、`pnpm lint` 僅 6 個既有 fast-refresh warning
- dev 庫已 `reset_db + seed_mock`(17 器材、無 115-1 資料、close_draft camelCase)

## 交叉審查(2026-07-17,本輪 changeset)

opus ×3(儲存/上傳、借用/活動/器材、前端)+ codex ×1(gpt-5.6-sol xhigh)已跑完,**無 CRITICAL**。需求方指示**本 session 不修、findings 寫檔、新 session 修復**——完整清單見 **`docs/REVIEW_2026-07-17.md`**。優先待修(P1):

1. 器材主檔「總數」欄每按鍵送 PATCH(應改 onBlur;可能寫中間值)
2. 結案送出 vs 刪照片跨端點競態 + `/close` 後端未驗證至少一張照片(加列鎖 + 照片數檢核)
3. 結案送出失敗+重載後孤兒照片無回收路徑(結案表單載入 `detail.photos` 為可移除既有照片)
4. 固定借用場況「永久佔格」— `RoomBookingRequest` 缺學期界限,pending 納入後放大(需資料模型決策)

P2/P3(次要/polish)與**已接受取捨**(儲存移除 reserve → 共機 DoS 風險,需求方拍板)亦見該檔。新 session 修復時逐項確認後更新該檔。

## 下一輪待辦 / 待需求方

- `docs/TASK6_REVIEW_HANDOFF.md` §6 可延後 debt 仍未做(`<Spin>`→Skeleton、`seed_mock --yes` 補 `ENV=dev` guard、inner nginx 信任網段收窄等)
- EvalResultPage 仍 mock(待需求方規格);staff/viewer panel、首頁導覽頁、Email MJML 模板未動
- 前端 `bookings/mock.ts` 仍是 admin 借用審核頁的 legacy mock(該頁未接後端);club 端器材已接後端(17 項、無類別)
- 上線切換清單(edge proxy)於 2026-09 執行

## 環境與慣例提醒

- **多 agent 平行作業絕不可 `git stash`**;跑測試務必包 timeout 且不同時開兩個 pytest
- 前端 `pnpm exec tsc --noEmit` 是空檢查(solution-style tsconfig),必須 `pnpm exec tsc -b`
- 確認彈窗一律 `lib/confirm.ts`;Modal 一律 open+afterClose 常駐;前端不顯示單號(稽核除外);Commit 英文一行為一 commit、禁元描述;UI 禁 emoji
- **Python 3.14 lazy annotation**:欄位名若與型別同名(如 `date`)須用別名(`dt.date`),否則 `Mapped[date|None]` 會被靜默解析成 NOT NULL
- 上傳新端點/新申請性質:加總上限走 `files.total_uploaded()` + 鎖列 + 串流後結算回滾的既有模式(見 activities/applications 上傳端點)
