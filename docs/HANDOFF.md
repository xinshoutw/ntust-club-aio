# Session Handoff(2026-07-21,第十四輪:pt/viewer 雙面板實裝 + 需求方 15 項 + 全站表格排序/欄寬)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md` 與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(分支 `dev`,需求方 15 項全數落地;**尚未 push,待使用者確認**)

1. **工讀生端(pt)實裝**:後端新 `/staff/*` router(社團/違規目錄/違規開立/違規查詢/器材借出與歸還點交(依序點交序號、去重)/逾期清單/發送提醒——提醒與 admin 共用 `services/loan_remind.py`);前端五頁全接線、mock 移除;行政借用(club NULL)顯示「學務處」且提醒鈕停用
2. **評審端(viewer)實裝**:migration `f6d2b81c47a9`(eval_groups.award_id);**五獎 rubric 依評分標準 PDF seed(年 116,48 細項,seed 對帳 assert)**——社團端 AwardDetailPage 上傳槽位隨之可用;`/viewer/*` API(assignments/detail/score upsert/done,指派=分組×獎項×年度,檔案下載同維度收斂);前端三頁接線,評分彈窗=雙欄(左受評檔案 FilePreview、右逐項評分+評語+簡報),「儲存並下一社團」流水線;**現場簡報分選填可後補**(表格顯示「簡報未評」,待需求方追認);seed_mock 建兩分組+viewer01/02
3. **禁過去申請時間(前後端)**:`PERIOD_TIMES` 節次時刻表落地(權威=舊 clubclass,14 節);臨時場地(含今天已開始節次)/器材(區間已過、活動已結束)/活動 submit 與重送/報名建立/公告蓋板全擋;**手動借用刻意不擋**(補登歷史);草稿不擋
4. **臨時場地「正在申請/取消」邊界改申請起始時刻**:active=未開始(SQL 以 periods 陣列重疊比對,與序無關);pending/approved 未開始皆可取消,起始時刻一過移「最近申請」不可取消;器材/固定維持日粒度
5. **行政端固定借用窗外反灰置底**(比照社團端;`GET /admin/room-bookings/window`)——**行為反轉待需求方追認**:窗外整頁鎖住,殘留 pending 需先到系統設定延長區間才能審
6. **審核頁四項**:「其他狀態」→「最近審核」,`reviewed_at`(approval_records max,彙總 join)入列表+排序白名單,預設 -reviewed_at;**輔導老師全面改稱承辦人**(顯示層;程式鍵 advisor/pending_advisor 不動),單關不畫章軌;結案審核兩區 50→25/頁,逾期區改 `overdue=true`(含已解鎖)全列可點開唯讀詳情
7. **帳號管理加「社團」tab**(搜尋+分頁 20;建立帳號=新 `POST /admin/clubs/{id}/account`、重設密碼、啟停(社團+帳號連動,文案明示);一社一帳號以鎖列+IntegrityError 守並發)
8. **彈窗/動畫**:全域 motionUnit 0.06(Fast/Mid/Slow=0.06/0.12/0.18s);活動詳情 popup 640→840;高彈窗改 `useModalAutoFocus`(focus preventScroll,標題保持可見;**禁再用原生 autoFocus 於高彈窗**);社團總覽點列即開審核彈窗(ActivityReviewModal 支援 item=null+Skeleton,largeApproved/fundSource 補種)
9. **全站表格改造(需求方 1、11 項)**:後端 `sort` 逗號多鍵(≤3,白名單 422);前端 `useMultiSort`(**最後點擊=最高優先**,同欄升→降→移除)+`MultiSortButton`(方向 caret+優先序小字)+`sortRows`+`Cols`;**全部資料表 `tb fixed`+colgroup 固定欄寬**(行內編輯不再變形);預設排序依五準則逐表定案(佇列公平/急迫優先/時間就近/名冊慣例/需求方拍板),成員預設=身份權重→學號、違規=未銷案+期限近、active 借用=開始日近、逾期=逾越最久在前
10. **Discord webhook 訊息清冊**:`docs/discord-webhook-messages.md`(32 事件/36 文案變體,含可用資料欄位)——**待需求方據此設計風格後回頭改 notify.py**
11. **資料遷移重演練於本機完成**(159 社/30,477 成員/14,234 活動/15,634+7,173 借用);dev 庫已升 `f6d2b81c47a9` 並 seed rubric
12. **交叉審查**:Opus×7(viewer 全套、pt+審核+彈窗、各分支自審)+codex×1(表格 sweep);findings 全修(檔案下載獎項維度、簡報必填改策略、group 鍵、reviewed_at 彙總 join、序號去重、骨架聚焦)

## 驗證現況(全綠)

- 後端 `timeout 300 uv run pytest -q` **262 passed**、`ruff check .` 全綠
- 前端 `pnpm exec tsc -b` 0 錯、`pnpm test` 35 passed、lint 僅既有 fast-refresh warning
- viewer/staff 端對端煙霧測試過(scratch 庫 club_aio_smoke + uvicorn 8001:登入→指派→評分→done、開違規、點交、逾期、跨角色 403)
- **測試庫可平行**:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)

## 本機環境(此台 Mac,2026-07-21 起用)

- host 5432 被 OrbStack VM 佔用:db 走 **55432**(`compose.override.yml` 不入版控 + `.env` `POSTGRES_PORT=55432`);pnpm 走 corepack shim

## 待需求方拍板/追認

- 簡報分數選填可後補(§2);行政端固定借用窗外整頁鎖(§5);手動借用可回填過去(§3);webhook 風格模板(§10);評鑑檔案庫/行政歷史文件歸檔;`aclose` 範圍、器材核准硬性檢核(前輪遺留)

## 下一輪待辦

- **舊機 media 目錄**(~8.7 萬檔)抓回後寫檔案匯入(migration/README.md TODO)
- **簽核流程重做餘項**(2026-07-17 拍板):角色代號改名(admin→staff、staff→pt)、頭銜欄位、superadmin sh 腳本、**退回=退上一級狀態機**、社團端關卡人員顯示(逐項核定 UI 已有)
- **行政端「分組與評審指派」頁**:viewer 面板已實裝但生產環境無法指派(現只有 seed);需 eval_groups CRUD+指派 UI(表與 API 模型已就緒)
- REVIEW_full P2/P3(lib 測試補強、mock 死碼清除含 bookings/mock 瘦身、AGENTS 重組、文件對齊)
- 競賽成績總表(super)、報名競賽斷鏈、統計頁、Email 模板、首頁導覽

## 環境與慣例提醒

- 多 agent 平行絕不可 `git stash`;pytest 必包 timeout;平行 worktree 各設 `CLUB_AIO_TEST_DB`
- 前端 `pnpm exec tsc -b`(--noEmit 是空檢查);lint=`pnpm run lint`
- 確認彈窗一律 `lib/confirm.ts`;Modal open+afterClose 常駐;**高彈窗聚焦一律 `useModalAutoFocus`**;不顯示單號;UI 禁 emoji;Commit 英文一行為一 commit、禁元描述
- **表格慣例**:資料表一律 `tb fixed`+`<Cols>`;排序一律 `useMultiSort`+`MultiSortButton`(伺服器端 `sortParam`);新表照五準則給預設排序
- Python 3.14 lazy annotation:欄位名與型別同名須別名(dt.date)
- `PERIOD_TIMES` 前後端各一份(booking_service.py / api/bookings.ts),改動須同步
