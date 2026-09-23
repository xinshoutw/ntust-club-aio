# Session Handoff

> 交接快照:現在到哪、接下來做什麼。永久知識在三層 `AGENTS.md` 與 `docs/`,
> 需求方拍板的規則在 `docs/decisions.md`;本檔過期即刪。

## 現在在哪

開發庫用的是**正式資料 snapshot**,demo 與後續開發都以它為準。
`docs/issues.md` 剩 15 項,`docs/gaps.md` 剩評鑑鏈與幾項延伸。

接下來挑一整條線做(評鑑鏈最大),或先清上線檢查表的阻擋項。

**分支 `feat/club-directory` 已完成整條線**:`clubs` 的對外公開欄位、形象圖上傳
(轉 3:1 WebP)、`files.public`、社團端「對外公開資料」區塊、行政端唯讀與下架開關、
四支公開端點,以及 `/`(社團導覽)、`/clubs/:clubId`、`/availability` 三頁前端。
規格在 `spec/shared/club-directory.md`、`club-detail.md`、`public-availability.md`。

**上線前還要做一件事**:edge 的台灣 IP 白名單要改成只套在需要登入的 API 上
(`../../nginx`),導覽頁一半的價值是給校外看的。設定寫法見 `DEPLOY_CHECKLIST.md` E 段。

## 接下來做什麼

### 一、評鑑彙總鏈(建議當單一開發段落)

GAP-01 → 02 → 03 → 04,連帶 ISS-04、ISS-20、ISS-12c/GAP-08b、GAP-07、GAP-19。
**不要拆散**:分組與評審指派沒有寫入 API(GAP-01),評審端三頁在正式環境永遠是
「尚未被指派評分」(ISS-04),後面的總表與結果頁都建立在它上面。

DEC-01:這學年評鑑在新系統跑,但學年末才用 —— 不擋上線。

### 二、上線檢查表的阻擋項(`DEPLOY_CHECKLIST.md`)

| 項目 | 現況 |
|---|---|
| 備份排程 | 腳本就緒(`scripts/backup_db.sh`),**cron 未掛** |
| 政府行事曆假日 | 腳本就緒(`scripts/import_holidays.py`),**上線年度未跑** |
| 遷入借用的打錯日期 | 腳本就緒(`scripts/fix_booking_dates.py`),開發庫已跑、**正式庫未跑** |
| `.env` 正式值 | `MAIL_FROM_ADDRESS` 是個人信箱;Uptime Kuma 兩支 push URL 待填 |
| 借用的遷移範圍 | 活動已依 `SCOPE_FIRST/LAST_SEMESTER` 過濾,借用是否同受此限未定(MIG-10) |
| 行政帳號權限 | 遷移進來的 15 個 admin 權限鍵全空,只有 `super` 看得到東西;分工由承辦決定 |
| 工讀生帳號 | 舊系統沒有這個角色,遷移後 `role=staff` 是 0 筆,上線前要開 |

### 三、下一個 session 一件

**UI 標點全形化**(`design-guide.md` §7):現況待改 —— 句號 2、半形逗號 15、半形括號 23、半形冒號 22。

### 四、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試(前端元件測試環境已建) |
| ISS-94 | 兩處清單無分頁(行政端社團總覽、報名名單;報名那支後端也沒有) |
| ISS-95 / ISS-96 | 徽章與評鑑卡導向的頁面看不到它們數的東西;要先讓 `/club/activities` 收「全部學期」 |
| ISS-67 / GAP-18 | 行政/工讀生/評審端的站內鈴鐺永遠是空的(Discord 事件已補齊) |
| GAP-03 | 全校評分進度總表 —— 行政端「我負責的評分」看的是自己被指派的分組,管理員沒被指派就是空的 |
| GAP-14 / GAP-17 | 統計與匯出、舊系統公開頁三件套 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動併看) |

不排期的方向見 [`improvements.md`](improvements.md)。

## 本批已完成(2026-08-27)

理由與細節在 `decisions.md`,這裡只記做了什麼。

| 決策 | 內容 |
|---|---|
| D-17～D-20 | 結案重點依活動類型改字;經費來源預填「學務處補助」;英文名稱改行政端維護;網頁連結與簡介必填;借用電話限 09 開頭 10 碼或 4 碼分機 |
| D-21～D-22 | 成員與指導老師都不記錄電話 —— 兩支 drop column(`d7b2c85f4a19`、`c9a4f1e72d38`),遷移端也不再讀 |
| D-23～D-25 | 終態顯示詞改「已完成」;結案鎖定預設 30 → 21 天;幹部證明與郵局帳戶異動可跳過「處理中」 |
| D-26 | 工讀生與評審頁面鏡射到行政端(`/admin/pt/*`、`/admin/viewer/*`),`astaff` / `aviewer` 一組一把鍵 |
| D-27 | 負責人與副負責人不寫職稱;舊系統的非標準寫法仍用來認人,原文捨棄 |

**社團評鑑入口反灰**(2026-08-31):社團端「資料總覽」與行政端「行政分審核」不可點,
hover 顯示「目前未開放」(`lib/nav.EVAL_UNBUILT`)。收的**只有側欄入口** —— 路由與頁面都還在,
直接輸入網址進得去;評審端三頁不收(那是評審帳號唯一的工作面)。GAP-01～04 做完就把那兩個常數拿掉。

**活動審核的「備註」**(2026-08-31,D-33/D-34):`activities.admin_note`,承辦人留給社團的話,
**任一關都寫得動**、空字串即清空。與經費來源一起印進申請表的「意見回饋」,
**原本固定接在後面的結報提醒一併移除**(系統自己會催結案,那句樣板還會蓋掉承辦想說的話)。
社團端的活動詳情**改用行政端那支審核彈窗**(`viewer="club"`),`ActivityPreviewModal` 已刪除 ——
章軌、大型認可、繳交確認與關卡說明都收掉,footer 換回繼續編輯/前往結案。

**借用情形色格圖三端共用**(2026-08-31):社團端借用總覽那張圖抽成 `features/bookings/BookingGrid.tsx`,
資料改走免登入的 `/public/*`(節次、場地、場況、器材佔用),社團端、行政端「臨時場地器材借用」
與免登入的 `/availability` 讀同一份。呼叫端只決定點格去哪一頁:社團去申請頁、行政帶參數去手動借用
(`allowPast`,補登照樣點得動)、未登入不給入口即純預覽。
行政端原本那張專用場況圖的能力**疊回共用元件**:每格的 `pending`(該格全部待審單,含被
已核准或不開放蓋掉的)由 `availability_grids(with_pending=)` 一併回傳,**只給持 `abooking`
的承辦**(`api/v1/public._sees_pending`);有可審的格子就地開審核彈窗,多筆出選單。
原本的行政專用端點 `/admin/bookings/availability` 與 `admin_availability_grid` 已刪除。

**未登入的 `/`**:社團導覽(借用情形移到 `/availability`,由 topbar 的「借用情形」進去);
其餘社團路徑未登入仍轉 `/login`。
匿名看得到借用社團名與不開放原因 —— 判定為可接受(等同貼在場地門口的資訊),要收就改後端。

**幹部證明可駁回**(2026-09-01,D-37):`/admin/certificates` 的狀態下拉多一個終態「已駁回」
(`ApplicationStatus.DECLINED`),審核中與處理中皆可直接駁回、不附原因,和「已完成」一樣不可再改。
社團端落在「最近申請」那張表;下拉選了駁回會先跳確認(只有這個選項問,損害不對稱)。
**郵局帳戶異動不跟進** —— 值域(CHECK)兩張表一起放寬,狀態機分兩份
(`_CERT_NEXT` / `_ALLOWED_NEXT`),郵局那頁連選項都不列。要跑遷移(`c4e8b17d2f60`)。
順帶把社團端郵局徽章的 `!= COMPLETED` 改成白名單(值域放寬後那寫法會多算)。

**學務長的視野只有第三關**(2026-09-01,D-38):持 `approve_dean` 的帳號在 `/admin/review`
待審佇列只有 `pending_dean`、最近審核只有**簽過第三關**的單(`approval_records` 有 dean 那一列,
核准與退回皆算),側欄徽章數同一個集合。判定不是狀態 —— 核定 0 元當場核准(D-16)的單同樣是
`approved` 卻沒到過他手上。收的是整個行政端活動讀取面(清單、學期下拉、詳情、申請表 PDF 共用
`activity_service.scope_sql`),`super` 與頁面鍵都壓不過這條。

**器材歸還時限與放假日進系統設定頁**(2026-09-02):`equipment_return_time`(HH:MM)與 `holidays`
表都能在 `/admin/settings` 改了 —— 原本前者只能直接動 DB、後者只能進主機跑
`scripts/import_holidays.py`。整年份仍走腳本(一次 20 幾筆),卡片是補漏與臨時放假(颱風假)用;
週六日不收(兩端都擋),刪除要先確認。稽核多 `holiday_created`/`updated`/`deleted` 三個動作。
讀取端另補了 fail-safe(`booking_service.parse_return_time`):壞值(手改 DB、`"10:30:00"`)
退回預設 10:30 並記 warning,不再讓側欄徽章、三張點交清單、逾期追蹤與 cron 催還一起變 500。

**器材借用核准可改數量**(2026-09-07):`POST /admin/equipment-loans/{id}/approve` 收選填 `{qty}`
(1 到申請數,只能往下調),審核彈窗多一格「核准數量」(預設=申請數,可借數警示改比這個數)。改了就覆寫
`equipment_loans.qty`,申請數只留在 `approval_records.reason`(「數量調整:5 → 3」)與稽核 detail,
Discord 通知尾綴「申請 5 件、核准 3 件」。社團總覽那張共用彈窗一併吃到。

**違規勸導可附現場照片/影片**(2026-09-07):`POST /staff/violations/{id}/attachments`,與空間報修
同一套兩段式(先主體、再逐檔),**選填**、至多 5 檔、不設加總上限(單檔上界 × 5 就是天花板)。
上限由新開的 `GET /staff/config` 供給(工讀生打不進 `/club/config`)。附件掛在被勸導的社團名下
(`files.club_id`,`subject_type=violation`),**三端列表都帶**:社團在自己的違規紀錄頁看得到、
行政端 `aviol` 下載得到(`FILE_SUBJECT_KEYS` 本來就有這一列)、工讀生端「違規紀錄查詢」多一欄
「附件」給未銷案的單補傳(開立時第二步失敗不必再開一張 —— 每張都扣行政分)。
只收未銷案的單、不限填寫人。檔案管理多一個模組 `viol`(磁碟前綴 `violations/`);
nginx 上傳白名單那條 location 改成同時涵蓋報修佐證與勸導附件。
**待拍板**:社團看得到附件是我判的(被勸導的依據理應給對方看),要收回就把 `club_id` 改 None
並把社團端 `attachments` 拿掉。Opus 交叉審查後補的:`FILE_SUBJECT_KEYS["violation"]` 加 `astaff`
(鏡射頁補傳得了就要開得了);前端佐證選檔與驗證改成只放行 mp4 / mov(webm/avi 後端本來就不收,
以前是到後端才 415,報修那頁一併改);核准改數量那句「數量調整:5 → 3」社團端借用列可點開
「核准說明」看到(`attach_decisions` 連留了話的 APPROVE 一起帶)。

**所有場地借用 / 所有器材借用**(2026-09-09):行政端「借用審核」多兩頁查閱用清單
(`/admin/venue-bookings`、`/admin/equipment-loans`),全校、全狀態、依學期,與「所有活動」同一種頁;
各配一把查閱鍵 `avenuelist` / `aloanlist`(帳號管理的權限彈窗自動多兩格)。**只開 GET**,
核准/退回/撤銷仍是 `abooking` 的事 —— 兩把都持有的人在本頁的彈窗一樣簽得動。後端兩支清單
多收 `semester=` 與可重複的 `club_id=`,各加一支 `/semesters`。共用彈窗補顯示送件時間與
退回/撤銷原因(含經手人),而且**沒接 `onApprove` 就不畫審核鈕**(原本會畫出按了只得到假成功的鈕)。
一個元件 `AdminBookingListPage` 吃 `kind`,兩條路由各帶 `key` 才不會互切時帶著上一頁的排序鍵。
頁名依 `design-guide.md` §7 用「場地」不用「教室」。
Opus 交叉審查後補的:`status=checked_out` 不帶 `overdue` 時**排除已逾期的列**(兩者底層同為
`checked_out`,原本勾「已借出」會連逾期單一起撈回,`test_equipment_overdue_filter` 的那句斷言跟著改);
固定場地借用那第三份 DTO 也接上 `created_at` 與處置三欄,`/admin/rooms` 與社團總覽的固定借用彈窗
從此看得到退回原因;新增跨鍵負向測試(`CROSS_READS`,兩個讀取鍵常數對調會紅)與 `useBookingList`
的查詢字串測試。**沒做**:社團漏斗仍只列啟用中社團(所有活動頁同一份判定,要改就兩頁一起);
`/admin/room-bookings` 的 `club_id` 仍是單值(三種借用兩支吃多值一支不吃,要用到再改)。

**學期下拉改數字排序、遷入的打錯日期有腳本修**(2026-09-09):所有列學期的端點
(`/admin/venue-bookings/semesters`、`/admin/equipment-loans/semesters`、`/admin/activities/semesters`、
`/club/activities/semesters`)與前端 `semesterOptions` 原本都拿字串比大小,民國 99 年會排在 100 年前面;
現在一律走 `core/semesters.semester_sort_key` / `lib/semester.semesterRank`。下拉裡的 90-1、-1909-1
這種學期**是資料問題**:clubclass 讓人手打日期,遷入的臨時場地借用有 89 筆借用日離建單時間超過一年
(2004、0110、2030 這種年),除了一筆已核准全是退回件;器材借用一筆都沒有。
`scripts/fix_booking_dates.py` 依「月日照舊、年份改成建單之後最先遇到的那一年」改回去,
不加 `--yes` 只預覽,冪等。**開發庫已跑過**(89 筆,`venue_bookings.date` 現在落在 2020–2026),
**正式庫還沒跑**(已列入 `DEPLOY_CHECKLIST.md`)。你點名的四組(118-1 → 2023、101-1 兩筆 → 2024、
105-2 與 106-2 → 2022)規則算出來的年份與你說的一致。

**核准後沒去領的器材借用由系統撤銷**(2026-09-09,D-40):`approved` 且結束日已過 → `cancelled`,
簽核紀錄一筆 REVOKE(簽核者空=系統;`approval_records.actor_id` 放寬可空,**要跑遷移 `e5a1c9d47b23`**)、
稽核 `role=system`、Discord D13b。掃的時機:點交清單每次載入(`GET /staff/equipment-loans?status=approved`)
與每日催還排程 `send_overdue_reminders.py`。實作 `services/loan_expiry.py`;ISS-93 據此收掉 ——
`equipment_loan_ongoing_expr` 與待借出清單都補了 `end_date >= today`,三份判定從此同一條。
**手動借用(`club_id` 空)不掃**(補登入口)。Opus 交叉審查後補的:掃描失敗不擋點交清單(rollback + log)、
點交端擋區間已過的單、`tests/test_migrations` 連 nullable 一起比(原本漏跑這支遷移不會紅)、
稽核頁補 `equipment_loan_expired` 與 `system` 角色的對照詞、`seed_mock` 的已核准借用改相對真實今天。

**HEIC 預覽、借用清單版面**(2026-09-09):iPhone 拍的結案照片是 HEIC,Chrome 解不了,縮圖與預覽彈窗一片破圖。
`GET /files/{id}` 現在看 `Sec-Fetch-Dest: image`(`<img>` 才帶)—— HEIC/HEIF/TIFF/BMP 轉成 JPEG 回去(AVIF 瀏覽器原生解得了,直接 inline)
(`services/files.preview_of`,pi-heif;快取 `<path>.preview.jpg`,`unlink_quiet` 連它一起刪),下載與 fetch 照舊原檔,
前端一行都沒改。轉失敗、來源超過 20MB 或超過 5,000 萬像素就給原檔並 log;同時最多轉 2 張(正式機 2 vCPU 與 PostgreSQL 同住);
暫存檔帶 uuid、失敗不留 `.part`;回應帶 `Vary: Sec-Fetch-Dest`。**新相依 `pi-heif`**(pillow-heif 的 decode-only 版:
wheel 只帶 LGPL 的 libheif/libde265,沒有 GPLv2 的 x265 —— codex 交叉審查抓到 pillow-heif 的 wheel 整個標 GPLv2,
映像推上 GHCR 就有散佈義務),映像重建即帶入。codex 那輪另補的:磁碟到 90% 告警就不再建新快取(已有的照給)、
轉檔改用專屬 2 條 thread pool(Semaphore 在請求被取消時會提早放行)、`media_import --reset` 不管原檔在不在都清快取、
兩頁的載入失敗改用 `isLoadingError`、日期欄補 `title`、「帳篷×2」不留空格;測試的 HEIC 改用固定位元組
(decode-only 編不出來),EXIF 方向是解碼器套的,那支測試驗的是結果。沒做的:轉檔與刪除同時發生時
快取可能被放回來(要 per-path 鎖,不值得),記在 `improvements.md`。
Opus 交叉審查後補的:`media_import --reset` 改走 `unlink_quiet`(原本裸 unlink 會留快取孤兒)、AVIF 改直接 inline、
場地頁不再打器材主檔(只持 `avenuelist` 會 403)、日期欄也截斷。沒做的(報修/違規/郵局那幾頁仍是下載連結、
縮圖沒有小尺寸、`<img>` 沒有 onError)記在 `improvements.md` §5。
「所有場地/器材借用」每一格改單行截斷(`useFitRows` 量第一列,一換行整頁列數算成一半)、器材欄 240px、
器材頁多一個器材漏斗(`equipment_id=` 可重複,`GET /admin/equipment` 讀取鍵多 `aloanlist`)。

**公開頁的 RWD 與活動紀錄改版**(2026-09-16):

- **匿名進 `/clubs` 會永遠停在骨架上**(已修):開機的 `/auth/me` 對匿名一定回 401,
  `auth.tsx` 的 401 handler 照著 `qc.clear()`,把同一時間抓回來的 `/public/clubs` 一起清掉 ——
  而被 `qc.clear()` 移走的查詢**不會自己重抓**。守衛改成「沒登入過就沒有 session 可以過期」
  (`if (!user) return`),login/logout 本來就各有自己的 clear。登入中開這一頁看不出問題,
  所以整條對外的路徑一直沒人踩到。`src/app/auth.test.tsx` 兩則正反測試
- **topbar 文字鈕在 <768px 收成圖示鈕**:抽出 `components/layout/TopbarButton.tsx`,
  AppShell 與 PublicShell 共用(CSS 由 `.topbar-directory*` 改名 `.topbar-cta*`)。
  連帶修兩件本來就歪的事:`.topbar-mobile-title` 的 `text-align: center` 搭上同樣 `flex: 1`
  的 `.topbar-spacer`,字是排在左半邊的正中間、而且只分得到一半餘裕(社團頁在 320px 被截成
  「開源技術…」);`.sidebar-item` 掛在 `<a>` / `<span>` / `<button>` 三種元素上,只有連結吃到
  版面 —— button 的 UA 樣式自帶 `text-align: center`、自己的 font 與 shrink-to-fit 寬度,
  抽屜底部的「更換密碼 / 登出」因此置中在一個比整列窄的盒子裡。reset 收進 class,
  AppShell 兩份 inline style 一起退休
- **導覽頁工具列三段式**:991px 以下四個控制項各縮一號;680px 以下標題自己一列、三個下拉由
  grid 平分(`auto-fit` + `minmax(106px, 1fr)`,320px 自動收成兩欄)。**不靠 flex-wrap** ——
  落單那顆會被 grow 拉成整列寬
- **排序與過濾拆開**:過濾不會改變剩下那些社團的相對順序,所以 zh-Hant collator 那一趟只跟
  資料有關;順帶共用一份 `Intl.Collator`、options 提到模組層、字卡加 `memo`。
  **正式 build 在 4x CPU throttle 下**:套用篩選 56ms → 48ms(JS 25 → 21ms)、最慢的一次
  按鍵 23ms → 15ms。**「點篩選很慢」的主因是 dev server**(同一份操作在 dev 是 168 → 128ms),
  正式 build 本來就在門檻內 —— 之後有人再回報這一頁慢,先問是不是在 `vite dev` 上量的
- **活動紀錄改成四欄 grid**(`.act-list`,design-guide §6 的唯一例外):`tb fixed` 的固定欄寬
  得先猜地點多寬,200px 讓「趨勢科技 Trend Micro 股份有限公司」在 1440px 上照樣折行,而旁邊的
  活動名稱欄空著三百多 px;手機更糟 —— `min-width: 600px` 配水平捲軸,只看得到日期與時間兩欄。
  現在日期、時間與地點各取自己的 `max-content`,名稱吃掉剩下的全部並有 `12em` 下限
  (庫裡最長的地點 42 字 = 518px,沒有下限會把名稱壓到見底);≤767px **同一份標記**變成
  一列一張字卡。`ClubDetailPage.test.tsx` 三則
- **Opus 交叉審查後補的**:活動紀錄的無障礙樹原本整段塌成一個文字節點,跨日日期與開始時間
  黏成「2025/12/0713:00」,而 `<table aria-label="活動紀錄">` 那份名字也一起沒了 ——
  每一格改成自帶 `.sr-only` 欄位名(新的全站工具 class)、表頭 `aria-hidden`、section 具名。
  **刻意不用 ARIA 的 `role="row"/"cell"`**:`.act-row` 是 `display: contents`,舊版引擎會把
  這種元素連同 role 一起從無障礙樹拿掉,`table` 少了 `row` 只剩孤兒 `cell`,比現在更糟。
  另外:地點圖示 `--muted` 在白底只有 2.60:1(非文字門檻 3:1)改 `--steel`;
  跨日日期在 360px 上把 `nowrap` 的時間擠成 36px 衝出卡片外(`.act-row > *` 的
  `min-width: 0` 打掉了時間欄的自動最小值),**修法第二欄一定要留成 flexible track** ——
  兩欄都寫 `max-content` 的話,跨兩欄的長活動名稱會把整列撐成它的 600px;
  社團簡介貼 YouTube 網址(56 字)會把整頁推成可以左右拉(`pre-wrap` 不拆無空白字串),
  社團自填的長文欄位一律補 `overflow-wrap: anywhere`;抽屜標題改放帳號名稱
  (`.topbar-username` 在 ≤767px 是 display:none,手機上本來看不出登入的是誰)
- **PR #30 的 bot 審查後補的**:活動紀錄只有欄位標籤、沒有紀錄邊界 —— 輔助技術數不出有
  幾場活動。列從 `display: contents` 改成 **`grid-template-columns: subgrid`**(真盒子,
  `role="listitem"` 才立得住;`display: contents` 的元素在舊引擎會連 role 一起被拿掉),
  `.act-list` 掛 `role="list"`,分隔線順勢掛回列上。欄寬與字卡版面零變動。
  另外 topbar 六個圖示補 `aria-hidden`(AntD 的 icon 自帶 `role="img"` 與名稱,
  按鈕已有 `aria-label` 時等於唸兩遍;側欄的 `.sidebar-item-icon` 本來就是這樣)。
  **駁回一條**:CodeRabbit 說 `.sidebar-item { cursor: pointer }` 會讓反灰項目看起來可點 ——
  `.sidebar-item.disabled` 的 `not-allowed` 特異性 0,2,0 壓得過,實測 computed cursor 正確,
  而且 `<span>` 版一定同時帶 `disabled`
- **版面本身沒有自動測試**:repo 沒有 Playwright/e2e,jsdom 量不到欄寬與斷點。上面所有寬度
  都是這一輪用 playwright 手動掃過(6 頁 × 11 個寬度,零水平溢位),**改動這幾條 CSS 之後
  要自己重掃**,`pnpm test` 不會替你發現破版

**要跑遷移**:D-21/D-22 是 drop column,`alembic upgrade head` 之後舊號碼就沒了。
D-27 的殘留職稱不會被重跑遷移修好(`cms_import` 不更新既有列)—— 走 `--reset` 重灌,
或把該學期匯出再匯入一次。

**只換形象圖時「儲存」按了像壞掉**(2026-09-21):同學回報「只更新 banner/avatar 時無法儲存」。
查證:按鈕從頭到尾都按得下去(只有存檔進行中才 disabled),壞的是按下去之後 —— 形象圖走自己的
上傳端點(選檔即上傳),所以只換圖時表單一欄都沒動,而**指導老師姓名與聯絡信箱 1 的必填沒有
D-19 那道「只在真的要存 profile 時擋」的閘**,於是那一按跳的是紅字「請輸入指導老師姓名」,
看起來就是圖存不了(開發庫 87 個啟用社團裡 36 個 `advisor_name` 空、`contact_emails` 87 個全空 ——
`migration/set_contact_emails.py` 還沒跑)。必填齊全的社團則是得到「沒有變更」,同樣像被拒絕。
修法兩件:四個必填(指導老師姓名、聯絡信箱 1、網頁連結、詳細介紹)改走同一個 `requiredOnProfileSave`
閘 —— 真的要存時照擋,什麼都沒改時不擋(反正一個請求都不會送);段落標題改成
「形象圖（選擇後即儲存）」,全頁唯一不走右下角「儲存」的一段要自己說出來。
`ClubSettingsPage.test.tsx` 三則(三處改回舊寫法各會紅)。

**導覽頁移除標籤篩選**(2026-09-22):`/`、`/clubs` 的工具列剩兩個下拉(性質 / 招生)加搜尋框 ——
至多 3 個標籤在 60 個社團上切不出有意義的集合。**標籤改由搜尋框涵蓋**:關鍵字同時比對名稱、
英文名稱、一句話介紹與標籤,否則「武術」這種主題詞會一個入口都不剩(標籤照舊顯示在字卡與詳細頁,
主檔與社團端挑選器不動;後端本來就沒有 `tag=` 這個查詢字串)。
標籤主檔的存在理由原本寫「自由填寫會讓導覽頁的**篩選**長歪」,四份(`schemas/clubs.py`、
`models/clubs.py`、`data-model.md`、`club-settings.md`)一起改成「一整面字卡各說各話」。
**手機斷點跟著重量**:680px 是為四個控制項調的,少一個之後提早約 120px 觸發 —— 561–680px
被硬拆成三列,而兩顆 select 在 680px 各被拉成 319px。改成 **560px**(縮一號後三控制項需 510px,
≤767px 內容寬 = viewport − 32,542 以下才排不下),grid 從 `auto-fit + minmax(106px, 1fr)`
簡化成 `1fr 1fr`(106px 那個實測值是為「三欄收成兩欄」存在的,兩欄用不到)。
**量法是 CSS harness,不是整頁掃描**:同一份 `publicClubs.css` 加 shell 的內容寬規則,
320–1200px 逐 px 量工具列列數與水平溢位(零溢位)—— 上面 2026-09-16 那條的
「991px 以下**四個**控制項」「**三個**下拉」已經過期,**整頁的 playwright 寬度掃描這次沒有重跑**。

**社團頁的活動彈窗、多時段臨時場地借用、全站圖片預覽改 AntD**(2026-09-23,D-42 / D-43):

- `/clubs/:clubId` 的活動紀錄整列可點(滑鼠)、名稱是 `.row-open-btn`(鍵盤),開 AntD Modal:
  日期、時間、地點、活動內容;**結案通過**的活動多一段「活動照片」(`Image.PreviewGroup` 預覽,
  載不出來的那張收掉)。`/public/clubs/{id}/activities` 多回 `content` 與 `photo_file_ids`
  (金額照樣不出去);照片走新通道 `/public/files/activity-photos/{id}`,與清單共用
  `public._public_photos`,**一律送 1600px 的 JPEG 預覽、不送原檔**(不帶 EXIF/XMP/註解,ICC 保留),
  轉不出來 404。申請表的「活動內容」欄下方常駐提示「審核通過後公開在社團頁」(`extra`,
  tooltip 鍵盤與手機拿不到;design-guide §7 已寫成例外)。
  **待拍板**:照片是結案佐證,社團上傳時不知道會公開,也沒有撤下單張的入口(D-42 末段)
- `/bookings/venue` 的時段區改成多列:每列日期 + 節次,右側「+」「−」,至多 10 列。
  `POST /club/venue-bookings` 改收 `slots: [{date, periods}]`,一列一張單、**整批同一個交易**
  (一列不成立就一張都不建,錯誤訊息開頭「第 N 筆 日期」,信封 `meta.slot` 帶同一個 N,
  前端把那一列標紅並捲過去);同一天節次重疊前後端都擋;
  Discord 一批一則、稽核一張單一筆並帶是哪一格。**API 形狀是破壞性的**:舊前端送的
  `date`/`periods` 會 422(還沒上線,沒有開著舊分頁的人;前後端在同一個 commit)
- **全站圖片預覽一律 AntD 內建的 `Image`**(使用者指定,design-guide §6 已寫成規則):
  `features/eval/FilePreview` 的圖片分支改成受控的 `Image.PreviewGroup`(縮放、旋轉、同一組左右切換),
  PDF/Word 仍開彈窗;`useFilePreview().preview(f, group)` 是唯一入口 —— 評鑑上傳頁與評審評分頁
  原本各自接 `FilePreview`,現在也走它,group 是同一細項的檔案;活動審核彈窗(行政端與社團端共用)
  的照片牆換成 AntD `Image` 縮圖。成組時 rc-image 不把 alt 交給預覽層,`preview.alt` 要自己給
- 兩輪 Opus 交叉審查後補的(各自一個 commit):
  - 全站那條「預覽不從點擊位置飛出」的 CSS(需求方 2026-07-21)在 AntD 6 早就失效
    (`.ant-image-preview-wrap` 已不存在,origin 掛在 `.ant-image-preview-body`),`index.css.test.ts`
    現在拿 AntD 實際的 DOM 釘住那個 class
  - `files.preview_of` 轉不出來的來源記在行程內(`_PREVIEW_FAILED`,10 分鐘後才重試)——
    開發庫就有一張截斷的 JPEG(活動 818),匿名打得到;照片通道排隊轉檔前先 `db.close()` 還連線
  - 借用頁:日期欄 Enter 不再隱式送出整批;增刪列後焦點不掉到 body;列寬不到 914px 就兩行版面
    (container query,依列本身的寬度 —— 用視窗斷點的話 Windows 的常駐捲軸會讓 1280px 的一行版面裁掉 D 節),
    窄到日期欄不足 140 時收起日曆圖示;重疊紅框從目前的列當場推;
    未存檔守衛不再把「多一列空白」「今天已開始的節次」算成修改;每列 `role=group`
- 版面用 playwright 量過(數值,不是截圖):社團頁 1440/375/320 零水平溢位;借用頁 320–1440 零溢位、
  日期欄不被遮、一行版面時 14 節全露。**headless Chromium 預設 `--hide-scrollbars`**:要量 Windows 的常駐捲軸,
  得 `launch(ignore_default_args=["--hide-scrollbars"])` 再注入 `::-webkit-scrollbar` 寬度,只注入 CSS 沒有用。
  兩行版面的節次在整列 < 664px 時照舊橫捲(常駐捲軸下 1024px 差 11px、768px 差 27px,既有的窄螢幕行為);
  活動審核彈窗用真實的 `/club/activities/{id}` 回應在瀏覽器內攔截重放,照片牆與預覽在 1440/375 正常
- 第三輪 Opus 審查後補的:報修佐證、存簿影本、違規附件與社團總覽報修詳情的圖片也改走 AntD 預覽
  (`components/ui/AttachmentLinks` 統一);結案頁縮圖可點開(`PhotoThumbs`);借用頁改 container query、
  逐列錯誤訊息帶「第 N 筆」、場況圖不給今天已開始的節次;`/files/{id}` 排隊轉檔前也釋放 DB 連線;
  同一張照片並發只轉一次、轉檔失敗冷卻 10 分鐘後重試
- 第三輪的 LOW 與第四輪 Opus 審查(同日傍晚)後補的,各自一個 commit:
  - 預覽:ICC 超過 64 KB 丟掉(可夾帶任意資料出公開通道);公開彈窗在預覽開著、淡出跑完之前
    不收壞圖(不再停在「5 / 4」),收掉的只記到彈窗關掉為止;拿掉無效的 `loading="lazy"`(rc-image
    另開 Image() 驗圖,一掛上就整張下載);檢視器底部顯示「檔名（2 / 5）」;可預覽縮圖一律 §8 藍框
    (`index.css` 一條全域規則);附件列的圖片又是 `<a href>` 了,一般左鍵開預覽、Ctrl/⌘/中鍵拿原檔
    (預覽畫不出來的 TIFF 掃描檔、磁碟告警時的 HEIC 才有退路,表格格子的省略號也回來了)
  - 轉檔資源:形象圖轉 WebP 另走一條 thread(`_CLUB_IMAGE_POOL`)—— 它拿著全站唯一的上傳鎖在等,
    排在照片預覽後面的話匿名灌照片通道就能卡住全站上傳;照片通道轉檔池已有 16 張在排
    (`public.PUBLIC_PREVIEW_BACKLOG`)就不排新的、回 404 不記失敗,每分鐘至多記一筆 log
    (uvicorn 斷線不取消 handler,排進去的一律跑完)
  - 借用:「已開始」改用台北牆鐘(`lib/today.taipeiNow`,紐約的裝置原本把今天整排算成已開始);
    container query 改範圍語法(縮放 125%/150% 的 913.5px 兩條都不中);後端逐列錯誤帶 `meta.slot`
    (`AppError(meta=...)`,前端 `ApiError.meta`),頁面在 onError 當下依列的 key 捲過去
    (onError 不在 React 事件裡,「等紅框畫出來再找」在 Chromium 與 Firefox 都找不到 —— jsdom 重現不了,
    測試改成要求 onError 當下就捲);前端驗證失敗不再擦掉後端標的那一列;
    停權判斷(`lib/status.suspendedNow`,借用三頁的送出鈕靠它)與行政端撤銷鈕改用台北日
  - 測試補齊:申請附件與結案附件的 group、檢視器對話框名稱、`index.css.test.ts` 兩支選擇器 regex
    只收整條選擇器、已開始那一筆的批次錯誤(`freeze_taipei` 搬到 `tests/test_bookings.py`)、
    15 天場況圖、只缺日期的列也捲得到、修飾鍵點附件(Ctrl/⌘/Shift/Alt/中鍵)、登入端 HEIC 預覽
    不吃排隊上限、`api()` 把信封的 `meta` 掛上 `ApiError`
  - 文件:design-guide §7 的「提示放 `extra`」例外、§8 改成照實寫「刻意不響應 `prefers-reduced-motion`」
    (2026-08-31 事故後的決定,原本寫「全關」);D-43 講清楚批內重疊是 schema 的 422、沒有 `meta.slot`
- **沒做**:社團設定與行政端的形象圖只有顯示沒有預覽(不在這次的範圍);
  活動審核彈窗的 docx 附件仍無法線上預覽(評鑑兩頁會先抓 blob,彈窗沒有,既有的不一致);
  公開照片的預覽快取是被看到才轉,沒有預先暖好(全部轉一輪約 950 MB,`DEPLOY_CHECKLIST.md` 已補)——
  要讓匿名通道完全不轉檔,得改成結案通過時就先轉好並補一支 backfill,現在靠的是排隊上限
- **審查提出、這次沒修的 LOW**(下個 session 可接):
  - 其他借用端點的稽核沒帶單號:`manual_venue_booking_created`(之後會以 `venue_booking={id}` 撤銷,
    建立那筆對不上)、`manual_equipment_loan_created`,`room_booking_submitted` 與
    `equipment_loan_submitted` 連 detail 都沒有 —— 修法同 384fd23a(先 flush 再記 `{kind}={id};...`)
  - 場況圖的「已開始」只在重畫時判斷:頁面開著跨過節次起點,那一格仍可點,點進去是有日期、
    沒節次的一列;今天已開始的空格仍標「可借」、同色,看不出為什麼點不動
  - 借用頁 Form 的 `scrollToFirstError` 沒有測試(AntD 用 scroll-into-view-if-needed,jsdom 攔不到)
  - 轉檔池、single-flight、冷卻與排隊上限都是每個 worker 行程一份(現在單一 worker,註解已寫)
  - 還在拿裝置時鐘比台北時間的既有程式(審查列的,這次只修了停權與撤銷鈕):
    時刻 —— `ActivityFormPage` 新申請的開始時刻(後端 `_require_future_start` 用台北時間)、
    `SignupBuilderPage`、`SignupEditModal`;日界 —— `TakeoverOverlay`、`ViolationsPage`、
    `api/overview`、`OverduePage`、`AnnouncementsPage`、`SignupBuilderPage`、`PtViolationFormPage`、
    `ActivityFormPage`、`api/adminSignups`(design-guide 規定一律 `taipeiToday` / `taipeiNow`)
  - `index.css.test.ts` 的選擇器 regex 仍會接受包在 `@media` 裡的規則
- 開發機上既有的 15 個 `.preview.jpg` 是舊規則轉的(帶 COM、沒 ICC):要看新結果就
  `find backend/data/uploads -name '*.preview.jpg' -delete`,被看到時會重轉

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **743 passed**;`ruff check .` 全綠
- 前端 `pnpm exec tsc -b --force` 0 錯、`pnpm test` → **388 passed**(71 檔)、
  `pnpm run lint` 56 個既有 warning(fast-refresh / set-state-in-effect / refs;
  基準值,新增變更前後要一樣)
- 新測試做過 mutation 驗證(改回舊寫法會紅;已知例外:`exif_transpose` 那行拿掉不會紅,見測試 docstring);借用色格圖那支另在 `TZ=UTC` 與 `TZ=Pacific/Honolulu` 下各跑過一次

## 開發庫(正式資料 snapshot,2026-08-29 dump)

`legacy_clubs`(pg 容器內)、`legacy/clubclass/cc_2026-08-29.sql`、
`legacy/club_media/`(17 GB)都在本機。**`club_aio` 就是這份 snapshot 本身**
(2026-08-29 整庫重建,舊 demo 資料已全數清掉,以遷移結果為準),數字可以直接對。重建:

```bash
cd backend
uv run python scripts/reset_db.py --yes
rm -rf data/uploads/*                             # reset_db 不動盤上檔案,不清就是孤兒
uv run python ../migration/cms_import.py          # 157 社、30,575 成員、1,551 活動、2,256 簽核、8 公告
docker run -d --name cc-legacy -p 127.0.0.1:3307:3306 \
    -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cc mysql:8.0
docker exec -i cc-legacy mysql --default-character-set=utf8mb4 -uroot -proot cc \
    < ../../legacy/clubclass/cc_2026-08-29.sql
uv run python ../migration/cc_import.py           # 15,152 場地借用、8,154 器材借用、25 器材
uv run python ../migration/media_import.py        # 4,054 張結案照片、4,893 MB
uv run python ../migration/text_fields.py --import ../migration/out/activity_texts_2026-08-29_filled.csv
uv run python scripts/set_passwords.py --all --password 'Demo@12345' --no-change-required --yes
```

端到端實跑(這個庫的實際值):`activities.content` 有值 1,530 / 1,551、`activity_reports` 973、
`activity_reflections` 2,323 篇、`files` 4,054、`approval_records` 2,992
(簽核 2,256 + 活動退件 59 + 借用退件 677)、`club_members` 30,575。

- 照片佔 `backend/data/uploads/` 4.9 GB;`media_import.py --reset` 連盤上檔案一起清,
  **必須跑在 `cms_import.py --reset` 之前**(cms 那支會刪光 system=cms 的 id-map,
  先跑它照片就成了清不掉的孤兒;已加防呆擋下)。整庫重建走 `reset_db` 時 id-map 一起沒了,
  所以要自己 `rm -rf data/uploads/*`
- **別在這個庫跑 `seed_mock.py`** —— 它會 `rmtree` 整個 UPLOAD_DIR
- 查舊 MySQL 一律加 `--default-character-set=utf8mb4`,否則中文顯示成 `????`(資料是好的)
- 帳號密碼分兩批:**93 個啟用帳號**(7 管理員 + 86 社團)已用
  `set_passwords.py --all --random --yes` 換發成一帳號一組的隨機密碼、首登強制改密,
  明碼在 `migration/out/passwords_*.csv`(不入版控,發放後銷毀);
  其餘 76 個停用帳號(停社 73、`_migration`、停用評審 2)還是舊的 `Demo@12345`。
  要整庫回到方便登入的狀態就重跑 `--all --password 'Demo@12345' --no-change-required --yes`
  (`--password` 不跳過停用帳號)。`_migration` 是 `is_active=false`,密碼設了也登不進去

## MIG-13 人工轉錄(2026-08-29 完成)

`migration/out/activity_texts_2026-08-29_filled.csv`,**936/936 列全填**
(另 272 列不派工:活動未結案,成果與心得在 import 端本來就跳過,活動內容已由 `cms_import` 預帶)。
匯入實跑:活動內容 1,194 筆、成果 859 筆、心得 2,323 篇;4 列因活動未結案跳過,屬預期。

```bash
python3 migration/doc_text.py --all                      # 附件 → 純文字(2,713 檔,有快取)
python3 migration/fill_shards.py split --budget 200000   # 依文字量切工作包
python3 migration/fill_shards.py merge                   # *.jsonl → *_filled.csv + 問題報告
```

轉錄規則在 `migration/out/fill/INSTRUCTIONS.md`。merge 是**欄位級疊加**,補某一欄只需另寫
`shard-NN-fix.jsonl`(一行放 `legacy_id` + 那幾欄)。

**換 dump 是增量的,不重跑 split**:`*.jsonl` 以 `legacy_id` 為鍵、與 dump 無關,merge
會拿最新母 CSV 重併,舊 dump 的 924 列原封不動。8/24→8/29 新增的 12 列另收在
`shard-33.jsonl`(桌遊社 7 列、絃韻吉他社、弓道社、機器人研究社、美術社、全校不分系各 1 列)。
其中 `16295`(弓道社幹部交接)來源只有會議紀錄,依 INSTRUCTIONS 只輸出 `_note`、成果與心得全空;
`16378`(新生茶會)的簽到表掃描件與簡報同樣不轉錄,但回饋表單的統計有填進 `填_成果_目標達成`。

**已知未處理** —— 匿名回饋可能漏抄:「無署名的參與者回饋 → `填_成果_目標達成`」這條規則是
第一波 agent 派出**之後**才補進 INSTRUCTIONS.md 的,`shard-01`~`shard-11` 與 `shard-32`
遇到「像心得但沒署名」的段落會整組丟掉(實例 `14856`、`15020`)。待複查 = 那些 shard 裡
沒輸出心得的 **86 列**。2026-08-24 決定不做:漏的是補充性質的回饋,成果三欄與具名心得沒受影響。
(`shard-33` 已照新規則做:`15698` 的無署名助教心得進 `填_成果_目標達成`。)

另有「其他執行狀況與成果:無」的列,有的照抄「無」、有的留空 —— 兩種讀法都成立,不統一。

抽查兩批各 15 列對回原始檔:batch A 全乾淨,batch B 13 乾淨、2 列踩到上述問題。
沒有捏造、沒有姓名系級對調、沒有檢討內容漏進成果三欄。

## 其他待處理

- **D-14 讓遷移件的 ad2 / ad4 往上跳**:評鑑視窗內已結案的遷移活動,照片與心得確認多數是 true
  (來自舊系統旗標)。照片已補遷(MIG-12),心得列仍是 0。學年末跑評鑑前,承辦要知道 ad4
  這批分數來自舊系統旗標,不是庫裡真的有心得
- **`MAIL_FROM_ADDRESS` 是開發者個人信箱**;正式環境要換,且**必須與 `SMTP_USERNAME` 同網域**,
  否則校方 relay 拒收
- **結案退回的自動解鎖是永久的**:`close_unlocked` 沒有地方設回 false,被退回過一次就從此不受期限
  約束(仍在逾期清單裡)。這是 D-05 的字面意思,但等於期限有一條誰都能走的路
- 開機的 `/auth/me` 沒有 timeout:後端連上但不回應時會白畫面到 nginx `proxy_read_timeout`
  (預設 60 秒)。要收得先決定 timeout 值與失敗文案
- **舊系統的長審核意見現在有地方放了**:`cms_import` 把 `Opinions` 的殘留寫進 `fund_source`,超過
  100 字的直接丟掉(`too_long`)。`admin_note` 是 text 且上限 1000,要撈回那批就改寫入端
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受
- 內層 nginx 信任所有 RFC1918 網段,依賴 GCP firewall;正式部署可收窄至實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,
  兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`.env`、`start-dev.sh`、`migration/out/`
