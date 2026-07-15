# Session Handoff(2026-07-15,需求方第五輪 UI/規則調整)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(全部推 dev;決議全文見 AGENTS.md「UI/規則調整決議(2026-07-15 第五輪)」)

需求方回饋的一整批前端調整,已實作並逐項 commit:

1. 活動申請:日期改起訖區間四欄;「大型活動」改名+InfoCircle 說明卡
2. 活動結案:「二、檢討會議」獨立 section(是→日期/與會人數/討論事項/內容決議必填);popup 同步
3. 借用總覽大改版:配色(不開放無方框、固定借用深灰)、審核中不可點、可借直跳臨時借用、19 場地主檔、單日 `<`/`>`/`<<<`/`>>>` 導航、場地×14 天檢視
4. 固定場地借用重做:週次網格(週一~週日×節次)、10 節上限、晚間連 3 節規則、開放窗 gating(未開放反灰入「其他」)
5. 臨時/固定借用「用途」必填
6. 器材借用:綁定審核通過活動推導區間(±工作天緩衝)、紀錄顯示借用人/歸還人
7. 評鑑:ad7 每場簽到 1.25 分(4 場滿分)、ad8 依簽到、報名管理簽到登錄 UI、行政資料總分上限 100
8. 郵局紀錄不遮罩;違規 1 個月銷案期限(逾期截止,管理端停用銷案)
9. 新增後台「檔案管理」頁(空間利用視覺化+大型檔案清單+報修檔刪除)

驗證:`cd frontend && pnpm test`(15 passed)、`pnpm build` 綠、`pnpm lint` 僅既有警告。

## 後端待同步(本輪只改前端 mock;後端仍是 2026-07-14 版規格)

`docs/data-model.md` 內所有「**後端待同步**」標記,彙總:

1. **activities**:`date/end_date` 起訖區間(migration);結案資格與逾期鎖定改以 end_date 推導;ad1「一天一件」以開始日計
2. **activity_reports**:`review_attendees/review_topics/review_conclusion` 欄位與條件必填驗證
3. **room_booking_requests/slots**:date→weekday(1–7);開放窗(system_settings 6 月/1 月+管理員手動開關)、每社 10 節、晚間(10,A–D)連 3 節、purpose NOT NULL
4. **venue_bookings**:purpose NOT NULL
5. **equipment_loans**:`activity_id` 綁定核准活動、區間推導(工作天緩衝入 system_settings)、`borrower_name/returner_name`
6. **venues seed**:19 處場地(名稱/容量/類別含「宿舍區」)
7. **評鑑**:ad7=1.25×簽到場次、ad8=幹訓簽到、總分 cap 100;簽到登錄 API(session_attendance)
8. **postal**:社團端紀錄回傳完整帳號(移除遮罩)
9. **violations**:銷案期限推導(+1 月)、逾期禁止 resolve
10. **檔案管理**:`/admin/files` 空間彙總+大型檔案列表+報修檔刪除 API

## 交叉檢查(本輪已完成)

- opus 審查一輪:**無 CRITICAL/HIGH**,11 項規格逐項比對全數正確(晚間連 3 節、工作天負向推算、期限當天可銷案等邊界皆過);2 LOW 已修(mock 天數、刪檔連動 usage 聚合)+3 個 UX 微調已修(切場地保留日期窗、今日截止文案、結束日 disabledDate)
- 留待接後端自然消解(opus LOW/NOTE,不修):module-level `dayjs()` 快照(跨日長開頁面)、結案實際時間僅 HH:mm 無法表達跨日結束、幹訓簽到 Checkbox 與 `attendedSessions` mock 兩端未接
- 歷史:後端三輪(opus×2+codex)已完;前端六輪已完(2026-07-14 前)

## ui-polish 分支(等逐項裁決,勿進 dev)

分支 `ui-polish`(worktree `../club-aio-ui-polish`)7 commit 待裁決,裁決點 5 項(操作說明去留/10:30 提示位置/Drawer vs Modal/成員社團下拉 placeholder/佔位按鈕)——上輪 HANDOFF 詳列,需求方尚未回覆,原文備份在 git 歷史(6453f92 的 HANDOFF)。

## 待裁決(使用者回來看,沿上輪)

1. 成員學期歸屬以 `updated_at` 推導;要「名單快照按學期」需加欄位
2. eval_settings 預設語意=無列即開放
3. 成果報告表「社課講師」以 staff_text 帶入;PDF 版型加了「課程/活動名稱」列
4. ad7/ad8 判定已於本輪改為簽到制(上輪疑問已解)
5. 登入限流:每 IP 每 5 分鐘 10 次失敗
6. 低風險不修:改密不輪替 session id(僅撤他裝置)
7. **新增**:固定借用 mock `FIXED_BOOKING_WINDOW.adminOpenNow=true`(7 月能審表單);要看反灰態把它改 false。正式後台需做開放窗開關

## 待需求方提供

- Email 模板;評鑑結果頁(/eval/result)重設計規格

## 環境與慣例提醒

- 本機防火牆擋非 curl 程序對外 443(Python 連 discord 逾時、curl 通);正式 VM 無此問題
- 本機 DB `docker compose up -d db`;dev DB 已 upgrade head + seed(super/Bootstrap!2026,首登需改密)
- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中;UI 禁 emoji
- Vite 8 只綁 IPv6(`localhost:5173`);OrbStack 佔 8000,後端一律 `127.0.0.1:8000`
- Python 3.14 + uv;測試打獨立 `club_aio_test` 庫(conftest 於 import app 前設 env)
- frontend/src/features/auth/LoginPage.tsx 有使用者本人未提交的修改(移除忘記密碼+TODO),**勿動勿收進 commit**
