# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;本檔過期即刪。

## 現在在哪

1. **第十四輪(2026-07-21)已完成**:pt/viewer 雙面板實裝、需求方 15 項、全站表格排序與欄寬
2. **全面 code review(2026-07-25)已完成**:11 個獨立審查者平行審查,119 項 findings。原始 HTML 報告已刪除,結論全數併入 `issues.md` / `gaps.md`;需要逐項檔案行號時到 git 歷史取回
3. **頁面規格(2026-08-10)**:逐頁盤點全部 51 個頁面 → `docs/spec/`;問題與缺口彙整為 `issues.md`(當時 104 項)與 `gaps.md`
4. **問題分堆(2026-08-10)**:全部條目依「修法是否唯一」分成下方 A/B/C 三堆,經一輪跨模型交叉審查修正
5. **A1 五項全數修畢(2026-08-10)**:ISS-01、ISS-02、ISS-03、ISS-14b、ISS-53,已從 `issues.md` 移除;跨模型交叉審查後又補了六處(見下)。驗證數字見下方「驗證現況」
6. **A2 十二項全數修畢(2026-08-10)**:ISS-05、06、13(含 55)、13b、15+16、18、32、36、45、46、74b+38+38b、77b,已從 `issues.md` 移除。驗證數字見下方「驗證現況」
7. **A3 進行中(2026-08-11)**:已完成 34 項(ISS-17 + 六個子批次共 33 項),其餘 30 項見下方 A3 清單

**DEC-01 已定案:這學年評鑑要在新系統跑,但學年末才用** —— 2026-09 上線當下只需競賽報名(ISS-01)可用,整條彙總鏈排在上線之後。其餘 DEC-02~12 仍無答案。

## A — 保證可修

修法唯一、不需任何人決策,改動限於程式碼 + 必要時單一 Alembic revision。

**A1 上線阻擋 — 已全數修畢**(ISS-01/GAP-09、ISS-02、ISS-03、ISS-14b、ISS-53)

交叉審查後補的六處,踩過的坑值得記著:

- ISS-03 第一版只推「當學年」三項,而名單全是 114-*,`applications.py` 逐字比對 `club_members.semester` 反而全查不到 —— 學年期選項只能以名單實際有的學期為來源(`api/applications.ts` `termOptions`)
- ISS-14b 只清 `school_approved` 不夠:畫面的 `approved_total` 是逐項加總,兩個金額來源會打架,逐項也要歸零
- ISS-01 的 `signup_awards` 原本只寫不讀,`RegistrationOut` 補 `awards`(管理彈窗 + CSV),否則學務處收了資料也看不到
- 報名紀錄的獎項改由後端連名稱一起回,不靠啟用中清單反查(獎項停用就會退化成 slug)
- 獎項全停用時社團會看到一張永遠過不了 required 的空卡,改為顯示說明
- `.gitignore` 的 `start-dev.sh` 未錨定,會連帶吃掉版控中的 `backend/`、`frontend/` 同名腳本

**A2 高嚴重度 — 已全數修畢**

段落中值得記著的幾點:

- ISS-46 的 O(n²) 不在 Paragraph 而在 Table:`splitInRow` 每次分頁重算整張表。心得移出表格交給 frame 流排後,合法上限(100 篇 × 5000 字)由 307 秒降到 1.95 秒。表格只放得下有界的內容
- ISS-13 三旗標的語意是「承辦認不認可採計」不是「有沒有繳」—— 照片與心得在送出結案時後端就強制存在,fail-closed 只會製造無回復的歸零
- ISS-74b 撤銷落 `cancelled` 果然零 migration:額度與可借數判定本來就排除它。器材的「已結束」不看日期 —— 核准後沒來領的單區間過了也還沒交出去,那正是要清的對象
- ISS-38 的兩個 advisory lock 命名空間已合一(`venue`),否則補了交叉查詢也不會互相序列化
- ISS-18 的 `useFormUnsavedGuard` 要吃 Form 之外的 local state(時段選取、待上傳附件),那些才是離開後救不回來的

**A3 已修**:ISS-17;一致性文案子批次 ISS-85、85b、86b、78、79;前端錯誤處理與快取子批次 ISS-22、27、28、34、35、58、88;正確性與錯誤處理子批次 ISS-21、57、59、60、87;稽核子批次 ISS-61、62、63、64;併發子批次 ISS-39、41、42;畫面與資料落差子批次 ISS-91、92、12b、11、76、07、08、77c、12。前五個子批次各跑一輪跨模型交叉審查(7、20、約 25、約 25、約 30 條 findings,全數處理完;第三輪抓到併發批自己引入的 deadlock)

**A3 其餘 30 項**(可上線後補)

- 併發與完整性:ISS-37、ISS-40、ISS-44、ISS-26
- 停權與衝突顯示:ISS-93、ISS-94、ISS-95(第四輪交叉審查新發現)
- 效能:ISS-47、ISS-48、ISS-49、ISS-50、ISS-52
- 資料正確性:ISS-56(金額/數量非負約束,需 Alembic revision)
- 畫面與資料落差:ISS-68~ISS-73、ISS-74、ISS-74d、ISS-74e、ISS-75、ISS-77
- 文案樣式無障礙:ISS-80、ISS-81、ISS-82、ISS-84
- 維運:OPS-02、OPS-08、OPS-09、OPS-10
- 補做:GAP-05 場地主檔 CRUD(照抄器材主檔)

含新增 Alembic revision 的:ISS-26、ISS-44、ISS-50、ISS-56。

已修各批中,交叉審查抓到、值得記著的坑:

- ISS-78 第一版把行政端改成「場地固定借用」,而社團端/系統設定/spec 檔名一直是「**固定場地借用**」—— 同一個功能兩個名字,`admin_rooms.py` 一個檔就有三則 Discord 標題各用一種。定案詞彙只說「用場地不用教室」,沒說詞序,改名前要先數哪個是既有多數
- ISS-86b 的第一版註解換了個同樣不正確的理由:SQLAlchemy 對「賦值等於原值」根本不發 UPDATE,`updated_at` 從來沒有危險。那個守衛真正擋的是 PATCH 的重複學號檢查查到自己(行內編輯整列送回就會 409),而這條路徑當時零測試覆蓋
- ISS-22 的原始描述指向 AntD Button,但 `handleClick` 在 `innerLoading` 時就 `preventDefault()`,隱含送出派給 default button 的 click 一樣被擋。真正會重複送出的是**表單裡根本沒有 submit 鈕**(Modal `onOk` + `form.submit()`)與 `onPressEnter` 直接接 mutation;`signup_item_sessions` 沒有唯一約束,那條是真的會落兩筆
- 前端無 DOM 測試環境(ISS-89),UI 類修法**沒有測試護欄**;但 `src/api/` 這層本來就可測(vitest 共 13 檔,其中 9 檔在 `src/api/`),稽核批的 `fetchAllAuditLogs` 就是靠補一支測試才擋下 `page_size=200` 超過後端上限這種「按下去必掛」的錯
- **並發測試幾乎測不到真交錯**:兩支 HTTP 請求丟進 `asyncio.gather` 常常會自己排成序列(argon2 錯開、或先跑的那支一路領先到 commit),拿掉鎖照樣綠 —— 兩種寫法(login 在 gather 內/外)都試過。可靠的寫法是另開一個 session 佔住 advisory lock,再斷言請求會 timeout(見 `test_admin_eval.py`、`test_bookings.py`)
- ISS-21 後端改「省略=不動」還不夠:前端原本就是「空值→省略」,等於行為沒變。要改成「只在這次動過才送」才真的擋住跨裝置覆蓋
- ISS-60 的清理掛在 SQLAlchemy session 事件上,兩側都有坑:`after_transaction_end` 每次 commit 會觸發**兩次**(內層連線交易先於 `after_commit` 結束),只認最外層才不會把剛 commit 的檔案刪掉;而 `after_commit` 連 SAVEPOINT release 都會觸發,要用 `in_nested_transaction()` 擋掉
- 稽核的動作顯示詞前後端各一份,`account_restored` 是三元運算式的 else 分支,人工比對必漏 —— 選項清單已改由 `/admin/audit/options` 從實際紀錄取,但顯示詞表仍是第二份真相(ISS-86 同類)

- **加鎖會改變鎖序**:ISS-42 的 `with_for_update()` 讓登入變成「先鎖 sessions 再鎖 users」,與重設密碼/停權剛好相反,交叉審查實測重現 deadlock(40P01 不是 IntegrityError,使用者直接看到 500)。加任何列鎖前先確認同一組表在別處的取用順序
- argon2 要 36ms,鎖不能包住它:一社一帳號共用登入,鎖在驗證外會讓同時登入的人整排排隊並佔滿連線池。改成「驗完再取鎖 + 重讀 hash 比對」

## B — 需決定

| 編號 | 要決定什麼 |
|---|---|
| ISS-09 | 報修/郵局附件:前端改非必填對齊後端,還是後端改必填並補逐列補傳入口 |
| ISS-10 | 郵局新代理人必填條件以哪端為準(牽 DEC-06) |
| ISS-14 | 核定金額可否高於擬請補助(= DEC-09) |
| ISS-19 | `MemberOut` 加回 `created_at` 之後,那欄標「入社日期」(對新建列語意不符)還是另加 `joined_on` |
| ISS-23 | 檔案下載要拆成哪幾類、哪個權限鍵看哪類 |
| ISS-25 | 重設社團密碼歸 super 還是 `amember` |
| ISS-29 | 過期退回件重送:允許保留原日期,還是強制改未來 |
| ISS-30 | 結案逾鎖定期限的退回件可否自行重送 |
| ISS-31 | 開放窗結束後承辦要不要還能審(= DEC-03) |
| ISS-33 | 開放窗跨學期時目標學期以何為準 |
| ISS-43 | 磁碟 TOCTOU:改預留配額還是上傳前置閘 |
| ISS-51 | 上傳大小改 streaming 檢查還是中介層擋 |
| ISS-54 | 大型活動認可可否於後續關卡補正 |
| ISS-55b | 序號跨單去重:應用層 `&&` 檢核,還是拆子表 + 回填 + 改寫點交端點(`serials` 是 `ARRAY(Text)`,PG 建不了跨列 UNIQUE) |
| ISS-65 | Discord/Email 重試:記憶體重試還是落地佇列表 |
| ISS-66 | 提醒次數上限(牽 DEC-11) |
| ISS-74c | `aclose` 是否涵蓋結案核准(= DEC-05) |
| ISS-83 | 要不要自架 Noto Serif TC |
| ISS-86 | `PERIOD_TIMES` 單一真相:後端出端點還是共用產生器 |
| — | 前端要不要改資料 router(決定 ISS-18 能否攔頁內導航) |
| GAP-06 | 政府行事曆假日的資料來源與匯入格式 |
| GAP-08 | 檔案歸檔政策 |
| GAP-10 | 報名活動修改/關閉時已報名者怎麼處理 |
| GAP-11 | `Club.attribute` 是 PG enum 不是主檔表,`ClubProfileUpdate` 也沒這欄:要 enum 轉查表,還是只做「指派社團性質」 |
| GAP-12 | 逾時待審自動駁回的天數與適用類別 |
| GAP-13 | 批次核准/衝突連鎖自動駁回的規則 |
| GAP-15 | 待審申請彙整要併哪些類別 |
| GAP-17 | 公開頁要做哪幾頁 |
| GAP-18 | 7 類未發通知的動作與文案 |
| OPS-01 | 備份標的、保留週期、存放位置 |
| OPS-04 | 正式器材主檔的實際清單資料從哪來 |
| OPS-05 | Edge proxy 六項切換的執行時點 |
| OPS-06 | SMTP relay 用哪個 |
| OPS-07 | 容量告警門檻與通報管道 |
| MIG-01~07 · DEC-02~12 | 全部待決 |

## C — 單獨排程

| 項目 | 內容 |
|---|---|
| 評鑑彙總鏈 | GAP-01 → 02 → 03 → 04,連帶 ISS-04、ISS-20、ISS-12c/GAP-08b、GAP-07、GAP-19。當**單一開發段落**規劃,不要拆散;學年末前完成即可 |
| ISS-24 | 權限鍵 `areview`/`aact`、`asignup`/`areg` 統一。**死線在正式建帳號之前,比上線還早** |
| ISS-89 / ISS-90 | 前端元件測試環境 + 併發/權限矩陣/時區邊界測試 |
| GAP-14 | 統計與匯出 |
| GAP-16 | 社團導覽首頁 |
| ISS-67 / GAP-18 | 行政/工讀生/評審端通知鈴鐺 |

## 驗證現況(2026-08-11 實測)

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → 292 passed;`ruff check .` 全綠;覆蓋率上次量測 95%(較低者:notify 73%、audit 77%、signup_service 82%)
- 前端 `pnpm exec tsc -b --force` → 0 錯;`pnpm test` → 56 passed(13 檔);`pnpm run lint` → **8** 個 fast-refresh warning(全為既有的 `only-export-components` 類;先前記的 9 個是誤記,已用 `git archive` 對舊 commit 跑同一顆 oxlint 核對過)
- `git log --all` 確認 `.env` 與 `migration/out` 從未進版控

## 其他待處理

- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受此語意
- 內層 nginx 信任所有 RFC1918 網段,目前依賴 GCP firewall;正式部署可收窄至 edge/compose 實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`start-dev.sh`(db 埠若被佔用另加 `compose.override.yml`)
</content>
