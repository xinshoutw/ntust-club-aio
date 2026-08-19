# Session Handoff

> 「現在進行到哪、接下來做什麼」的交接快照。永久知識在三層 `AGENTS.md` 與 `docs/` 的設計文件;
> 需求方拍板的規則在 `docs/decisions.md`(永久保留);本檔過期即刪。

## 現在在哪

**`decisions.md` 裡「已定案且做得完」的項目全部做完了。** `docs/issues.md` 剩 6 項、
`docs/gaps.md` 的未完成功能剩評鑑鏈與幾項延伸,**全部落在「上線後單獨排程」那一堆**。

也就是說:接下來不是照清單逐項修,而是挑一整條線來做(評鑑鏈是最大的一條),
或先把上線檢查表(`DEPLOY_CHECKLIST.md`)的阻擋項清掉。

## 接下來做什麼

### 一、評鑑彙總鏈(最大的一條,建議當單一開發段落規劃)

GAP-01 → 02 → 03 → 04,連帶 ISS-04、ISS-20、ISS-12c/GAP-08b、GAP-07、GAP-19。
**不要拆散**:分組與評審指派沒有寫入 API(GAP-01)的話,評審端三頁在正式環境永遠是
「尚未被指派評分」(ISS-04),而後面的總表(GAP-03)與結果頁(GAP-04)都建立在它上面。

DEC-01 已定案:這學年評鑑在新系統跑,但**學年末才用** —— 上線本身不擋這條。

### 二、上線檢查表的阻擋項(`DEPLOY_CHECKLIST.md` A 段)

| 項目 | 現況 |
|---|---|
| 備份排程 | 腳本已就緒(`scripts/backup_db.sh`),**cron 還沒掛上** |
| 器材主檔 | 由 `migration/cc_import.py` 從舊 `Device` 表帶入,正式流程必須 seed 之後跑過遷移 |
| 政府行事曆假日 | 匯入腳本已就緒(`scripts/import_holidays.py`),**上線年度還沒跑** |
| `.env` 正式值 | `MAIL_FROM_ADDRESS` 是個人信箱要換;Uptime Kuma 三個變數待填 |

### 三、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試。**前端元件測試環境已建**(jsdom + `@testing-library/react`),可直接動工 |
| ISS-67 / GAP-18 鈴鐺 | 行政/工讀生/評審端的通知鈴鐺永遠是空的(Discord 事件已補齊,缺的是站內鈴鐺) |
| GAP-14 / GAP-16 / GAP-17 | 統計與匯出、社團導覽首頁、公開頁 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動的待審件併看) |

可改進但不排期的方向見 [`improvements.md`](improvements.md)。

## 最新一批已完成(徽章與監控)

| 項目 | 內容 |
|---|---|
| **待審筆數徽章** | `GET /badges` 一支端點回該角色所有頁面的待辦數(鍵=前端 nav item key),四端側欄與行政總覽六張卡共用同一份。只有「有時效性或在等使用者下一步」的頁面給數字;行政端依權限鍵過濾 —— 徽章也是資料量 |
| **Discord 分流** | 社團事件與公告只推各社團自設的 webhook;`.env` 的 `DISCORD_WEBHOOK_URL` 專供 infra 告警(磁碟水位) |
| **Uptime Kuma 心跳** | 後端 lifespan 每 30 秒推一次(cron 到不了這個粒度):backend 以 `SELECT 1` 的來回當 ping,frontend 由後端探測 web 容器成功才推 up。只在 `ENV=prod` 送出 |
| **MIG-08** | 遷移範圍限 114-1 / 114-2 / 115-1 三學期,社員名單全遷;media 與舊評鑑檔案庫不遷。腳本尚未實作學期過濾(MIG-09),邊界待決(MIG-10) |

## 前一批已完成(文件對齊)

| 項目 | 內容 |
|---|---|
| **CI 紅燈** | `tests/conftest.py` 固定行程時區 `Asia/Taipei`。測試裡 84 處 `date.today()` 讀的是行程時區,而後端一律以 `TAIPEI` 推導 —— CI 跑 UTC,台北 08:00 前兩者差一天,`test_large_type_filter_and_locked_boundary` 的日界斷言必翻 |
| **DEC-08 只做了一半** | 前端 `features/eval/scoring.ts` 的 `totalOf` 只有上限 100,後端 `total_of` 兩端都夾。`scoring.ts` 是 spec 指定的可執行規格,兩份必須等價 —— 但**畫面顯示的是後端回傳值**,所以社團不會真的看到負分(交叉審查更正:`totalOf` 目前沒有任何產品呼叫點) |
| **`gaps.md` 過期條目** | 已拍板的 DEC-02/03/04/08/10/12、GAP-06/08/11/12/13、MIG-01/05/06/07、OPS-05 全數移除(decisions.md 自己的規則就是「落地即移除」);`decisions.md` 補上原本只寫在本檔的 DEC-01 |
| **`spec/` 對齊** | 15 頁共 19 條「未完成 / 問題」描述的是已修或已定案的行為,逐條改寫成正面規則 |
| **ISS-91** | 對齊過程驗出:固定借用審核的衝突標示不含臨時借用,畫面標「無衝突」而核准端會擋 |
| **頁級缺口** | spec 各頁的零散缺口(建立後不可修改的幾張單、缺索引的查詢、缺篩選入口)收進 `improvements.md`,不再只存在於單頁 spec |

### 交叉審查(3 opus + 1 codex)抓到的

四輪審查共 20 條 findings,其中 7 條是這批自己製造或誇大的:

| 項目 | 內容 |
|---|---|
| **把沒做的寫成做好了** | `spec/club/booking-venue.md` 寫「聯絡電話回給工讀生端」—— 工讀生端根本沒有臨時場地借用端點 |
| **影響誇大** | `scoring.ts` 的 `totalOf` 沒有任何產品呼叫點,畫面顯示的是後端 `data.total`。「社團會看到負分」不成立,壞掉的是「可執行規格與實作等價」 |
| **問題被縮小** | D-10 鎖的是性質「清單」,而原問題是「個別社團的性質改不了」(`AdminClubUpdate` 沒有 `attribute`)—— 整條原本消失了 |
| **過期敘述被擴散** | 清 spec 時漏掉兩條(蓋板公告被擠出前 20 筆、器材可借數 N+1),下一步「收進 improvements」又把它們原封不動抄了一份。兩條實際上都早已修好 |
| **弄丟兩條待辦** | MIG-01(決策說「關閉當天匯入 media」,但 `cms_import.py` 根本不處理檔案實體)、MIG-05(腳本完整,但「要跑它」與「只解得掉三分之一」只寫在本檔) |
| **測試出現三種「今天」** | 固定 TZ 之後 `date.today()`=台北,而 10 處 `datetime.now(UTC).date()` 仍是 UTC —— 修法前它們在 CI 上一致。已統一 |
| **拆掉了一條絆線** | pin 之前,`app/` 若寫下 `date.today()`,CI(UTC)會抓到;pin 之後 CI 全綠、線上每天錯 8 小時。已補 `tests/test_time_discipline.py` |

### 這一批的教訓

- **時區相依的測試不是「寫法不好」,是整套測試站錯了牆鐘**:業務推導只有台北一個時區,行程時區卻由 CI 決定。逐處改 `date.today()` 要動 84 個地方,固定 `TZ` 只要兩行 —— 但必須早於測試模組 import(有模組層級的 `date.today()` 常數)
- **「同一份判定有幾份」對前後端一樣適用**:DEC-08 的下限只寫進後端;`scoring.ts` 明明就是那份可執行規格,兩邊各自封頂卻只有一邊有底。但**判斷影響時要先確認呼叫點** —— 第一版說「社團會看到負分」,實際上那支函式沒有產品呼叫點,畫面吃的是後端值
- **刪掉一個編號前要問「這條決策有沒有回答原本那個問題」**:MIG-01 的決策談「何時匯入」,而 gaps 的原題是「何時交付」,兩者都不等於「匯入寫好了沒有」—— 決策存在不代表事情做得完
- **清單搬家會把錯誤一起搬走**:漏清的兩條 spec 敘述被原封不動收進 `improvements.md`,等於同一個過期說法多了一份。搬之前要逐條對程式碼,不能只對 spec
- **彙總檔會比 spec 先被清乾淨**:`issues.md` 的條目修完就刪,但 spec 該頁的「未完成 / 問題」段是另一份手抄 —— 這批 19 條全是這樣留下來的。修完一項要順手改 spec,這條慣例已在 AGENTS.md,實際上做漏了很多次

## 本批已完成(2026-08-20)

| 項目 | 內容 |
|---|---|
| **ISS-89** | 前端元件測試環境:vitest 全域 jsdom + `src/test/setup.ts`(補 `matchMedia`/`ResizeObserver`)+ `@testing-library/react`。25 檔 108 測試 |
| **ISS-86** | 節次目錄改由後端 `booking_service.period_catalogue()` 隨 `/auth/me` 下發,前端經 `lib/periods.ts` 取用;`api/bookings.ts` 與 `api/adminBookings.ts` 的兩份常數都刪了,順序規則收斂成 `periodRank` 一份 |
| **ISS-19** | 成員列表加「入社時間」(`created_at`)欄並可排序;所有欄位不換行,寬度不足時依序隱藏(更新時間 → 入社時間),正在依該欄排序時不收 |
| **D-04 / ISS-31** | 固定借用受理期間結束後,行政端照樣審得到:頁面與側欄不再吃開放窗,期間結束以橫幅說明 |
| **D-05 / ISS-29** | 退回件照原日期重送(前後端);新申請仍禁過去 |
| **D-05 / ISS-30** | 結案被退回即 `close_unlocked = True`,補件往返跨過期限也重送得了 |
| **ISS-33** | 固定借用目標學期改由**受理期間結束日**推導,同一輪申請不再落到兩個學期 |
| **D-06 / ISS-09** | 報修與郵局異動列表逐列回 `attachment_count`,0 份給補傳入口(`AttachmentRetryModal`);已完成的單不再收附件 |
| **D-09 / GAP-10** | 報名活動建立後可改(不發通知);截止只能改到現在或未來,一有社團報名就鎖住表單欄位,活動種類與報名開始不可改 |
| **DEC-07** | 補登未線上報名的社團(視為已確認、名單留空),可撤除、會通知社團、一定出現在匯出的 CSV 裡 |
| **GAP-18** | 補齊九個原本靜默的事件(K1–K9)+ 補登通知(K10);`tests/test_gap18_notifications.py` 逐事件釘住 |
| **ISS-43 / OPS-07** | 磁碟水位分級(80% 警示、90% 告警);到告警水位即關閉上傳前置閘,擋在 nginx `auth_request` 子請求上,暫存檔不落地 |
| **ISS-51** | nginx 上傳上限逐端點貼齊各自的 UploadPolicy(只有維修佐證留 256m);`test_upload_gateway.py` 走 OpenAPI 對照白名單 |
| **ISS-65** | 通知的暫時性失敗做記憶體重試(3 次;429 照 `Retry-After`、4xx 一次放棄),不落地佇列表 |
| **MIG-03** | `club_id` 為空字串的 960 筆借用改為保留,掛「學務處」 |
| **MIG-04 / MIG-06** | 兩支遷移腳本加 `--reset`;`cc_import.py --unknown-clubs` 導出認不出單位的借用清單 |
| **OPS-01** | `scripts/backup_db.sh`(每日 pg_dump + 14 天輪替,同機存放)、`scripts/check_disk.py`(容量告警) |
| **GAP-06** | `scripts/import_holidays.py`:人事行政總處辦公日曆表,每年一次,預設只預覽 |

### 這一批踩到的坑

**三輪跨模型審查共 61 條 findings**,絕大多數落在「漏掉的同類呼叫點」與「這批自己製造的問題」兩類 —— 與前幾批同一個分佈。以下是其中會真的出事的:

- **加了旗標就要走完它的整條流程**:`--reset` 沒有 `return`,語意變成「清完立刻重匯」,於是下一支腳本的刪除被剛建好的借用單擋住(外鍵是 NO ACTION)—— **沒有任何順序能讓它跑完一次重置**,而重置正是那個旗標的全部目的
- **錯誤碼要能穿過中間層**:`auth_request` 只認 2xx/401/403,其餘一律轉成 500。上傳前置閘回 507,使用者實際看到的是「HTTP 500」;改成 403 + `X-Upload-Gate` 標頭讓 nginx 換文案
- **可調的設定值要對得上部署層的硬上限**:`upload_limits` 收到 1024MB 而 nginx 擋在 64m,承辦一調高就變成「畫面說 100MB、送出回超過上限」
- **`assert callable(f)` 不是測試**:MIG-04/MIG-06 那兩條就是這樣寫的,所以上面那個 `--reset` 的死結一路過關
- **通知補一半比不補更奇怪**:建立手動借用會推、撤銷不推;補登會通知社團、撤除不通知 —— 每一條「因為 X 所以要推」的理由,反向動作幾乎都同樣成立
- **備份腳本的失敗路徑要自己收尾**:`> "$tmp"` 在指令跑之前就建檔,失敗留下的 `.part` 不會被 `*.dump` 的輪替比對到,一台正在失敗的機器會被自己的殘骸寫滿
- **刪掉「唯一一份」常數之前先 grep 整個前端**:ISS-86 第一版只清了 `api/bookings.ts`,`api/adminBookings.ts` 還有一份完整的節次軸複製(名字叫 `PERIOD_ORDER`),而 AGENTS.md 已經改寫成「只有後端一份」。跨模型審查抓到
- **拿不到值就不要用預設值頂替**:`bookingStartAt` 查不到節次時回 `'00:00'`,等於把每張單都算成「凌晨就開始了」→ 取消鈕全部消失。改回 invalid,讓「算不出來」走到「還沒開始」那一側(後端會再擋一次)
- **斷點量的是 viewport,表格拿到的是 viewport − 304px**:側欄 240 + shell padding 64。照 xl/lg 收欄的話,1200px 筆電上姓名與職稱各剩不到 60px —— 隱藏欄位機制本來就是為了避免這件事。門檻要各升一級(xxl / xl)
- **「所有欄位不換行」要逐格看**:社團端成員列表有三個行內編輯欄與學號欄沒有 `cell-clip`,而 `.tb.fixed td` 的預設是 `overflow-wrap: break-word`

## 更早一批已完成(2026-08-19)

21 個 commit。**`issues.md` 的「阻擋」級已清空**(ISS-23 檔案下載邊界是最後一顆)。

| 項目 | 內容 |
|---|---|
| **ISS-24** | 權限鍵統一:`aact`/`areg` 廢除,revision `e5b3c72a91d4` 就地改寫既有帳號。死線解除 |
| **D-01** | 行政端一頁一權限鍵。單一真相 `core/permissions.ADMIN_PAGES` 隨 `/auth/me` 下發;原 super 專屬六頁改鍵控;`amember` 拆 `aclub`/`amember`/`aclubset`(revision `a2c6f38b9e14`);前端兩份手抄鍵表刪除 |
| **D-02 / ISS-23** | 檔案下載依 `FILE_SUBJECT_KEYS` 對照檔案類型;`afiles` 刻意不在任何一列 |
| **D-03 / ISS-14** | 逐項核定不得高於該項擬請補助 |
| **D-07 / ISS-10** | 郵局表單取消互斥組合、事由外全部選填(revision `b7e4d29a1c85`)、新開戶表 PDF 連結 |
| **D-08 / ISS-74c** | `aclose` 涵蓋核准與退回;逾期未結案對無權限者回 403 而非假的 0 件 |
| **D-11** | 拆「證明管理」與「郵局帳戶管理」兩頁兩把鍵(revision `c8b1a5d73f26`) |
| **ISS-25** | 重設社團密碼歸 `aclubset` |
| **ISS-54** | 大型活動認可後續關卡可補正 |
| **ISS-55b** | 器材序號功能移除(revision `d4f8a1c93b52`),`needs_serial` 只驅動點交提醒 |
| **ISS-66 / DEC-11** | 逾期提醒自動排程(`scripts/send_overdue_reminders.py` + `last_reminded_at`,revision `f1a94e2c8b30`) |
| **ISS-83** | 撤銷 —— `design-guide` §3.3 指定的就是單一字族 Noto Sans TC,從未要求明體 |
| **DEC-08 / DEC-10** | 行政分總分下限 0;最佳活動獎改用 `_260714.pdf`(12 項合計 100,+簡報 20 = 120) |
| **OPS-04 / OPS-06** | 器材主檔由 `cc_import` 帶入不需承辦提供;校方 relay 實測寄達 |
| **MIG-05** | `migration/set_contact_emails.py` |
| **GAP-06** | 新增 [`improvements.md`](improvements.md)(可改進方向,不排期) |

### 那一批踩到的坑

- **只換了門的鎖,沒換門後資料的鎖**:D-01 給了六把新鍵,但 `/admin/venues`、`/admin/equipment-loans`、`/admin/clubs` 還綁在 `abooking` 或 `is_super`,四頁對非 super 全是空殼。跨模型審查抓到
- **權限測試給了假信心**:第一版只驗「剛好有 GET 的五支端點」,正好把那四頁全避開。改成**逐頁跑完該頁 spec「資料來源」表列的每一支端點**,一改就同時抓到三個。新增行政頁時務必把該頁的 GET 加進 `tests/test_admin_permissions.PAGE_READS`
- **擋住「授予」還不夠**:`_check_grantable` 擋了發權限,但 `reset_password` 少了 `_guard_target` —— 只持 `aaccount` 的管理員可重設 superadmin 密碼、拿一次性密碼直接登入(審查者實測復現)。守衛現在還要求「對方持有的鍵我全都有」,停用與刪除同理
- **SMTP 失敗不是設定錯**:`mail.ntust.edu.tw` 憑證鏈可信、主機名相符,但鏈上一張 CA 缺 RFC 5280 的 Subject Key Identifier,而 Python 3.13 起 `create_default_context()` 預設開 `VERIFY_X509_STRICT`。只清那一個旗標,`CERT_REQUIRED` 與 `check_hostname` 全保留(`tests/test_smtp_tls.py` 釘住,擋後人改成 `CERT_NONE`)
- **改權限鍵就要補 revision**:`amember` 拆三鍵沒跟著改既有帳號的話,承辦只是少了兩個側欄項目、沒有任何錯誤,不會知道自己被降權
- **社團聯絡 Email 的自動推導覆蓋率只有三分之一**:159 社中 59 社的負責人來自 114-2/115-1(位址應可用)、68 社名單停在 113-2 以前(最舊 103-1,學號信箱多半已停用)、32 社完全沒有負責人。腳本已分三組輸出

## 更早各批踩過的坑

- ISS-03 第一版只推「當學年」三項,而名單全是 114-*,`applications.py` 逐字比對 `club_members.semester` 反而全查不到 —— 學年期選項只能以名單實際有的學期為來源(`api/applications.ts` `termOptions`)
- ISS-14b 只清 `school_approved` 不夠:畫面的 `approved_total` 是逐項加總,兩個金額來源會打架,逐項也要歸零
- ISS-01 的 `signup_awards` 原本只寫不讀,`RegistrationOut` 補 `awards`(管理彈窗 + CSV),否則學務處收了資料也看不到
- 報名紀錄的獎項改由後端連名稱一起回,不靠啟用中清單反查(獎項停用就會退化成 slug)
- 獎項全停用時社團會看到一張永遠過不了 required 的空卡,改為顯示說明
- `.gitignore` 的 `start-dev.sh` 未錨定,會連帶吃掉版控中的 `backend/`、`frontend/` 同名腳本

段落中值得記著的幾點:

- ISS-46 的 O(n²) 不在 Paragraph 而在 Table:`splitInRow` 每次分頁重算整張表。心得移出表格交給 frame 流排後,合法上限(100 篇 × 5000 字)由 307 秒降到 1.95 秒。表格只放得下有界的內容
- ISS-13 三旗標的語意是「承辦認不認可採計」不是「有沒有繳」—— 照片與心得在送出結案時後端就強制存在,fail-closed 只會製造無回復的歸零
- ISS-74b 撤銷落 `cancelled` 果然零 migration:額度與可借數判定本來就排除它。器材的「已結束」不看日期 —— 核准後沒來領的單區間過了也還沒交出去,那正是要清的對象
- ISS-38 的兩個 advisory lock 命名空間已合一(`venue`),否則補了交叉查詢也不會互相序列化
- ISS-18 的 `useFormUnsavedGuard` 要吃 Form 之外的 local state(時段選取、待上傳附件),那些才是離開後救不回來的

- ISS-83 自架明體:同時列在 B 堆(要不要自架 Noto Serif TC 是決策),先問過再動

`docs/issues.md` 剩下的 26 項全部落在 B 堆(需決策)或 C 堆(單獨排程),已無「修法唯一」的條目。

已修各批中,交叉審查抓到、值得記著的坑:

- **清單頁改伺服器端分頁,`?? 0` 是會說謊的預設值**:header 的數字卡改吃 `page_size=1` 的 `meta.total` 之後,查詢失敗就永遠顯示「未銷案 0 筆」而底下列著 30 筆。全站慣例是 `?? '—'`
- 分頁查詢沒有 `placeholderData` 時,換頁瞬間 `data` 是 undefined:只要有「`total > 0` 才渲染整張卡」這種條件,卡片與分頁器會整個消失再冒出來。key 只差頁碼的表可以放心用 `keepPreviousData`(含篩選的不行,見下)
- **刪除鍵所在的分頁表都要處理「刪掉本頁最後一列」**:留在第 3 頁而總頁數變 2,畫面顯示「尚無帳號」
- 排序鍵直接綁列舉欄位,順序只是字面值巧合:`'open' < 'resolved'` 剛好對,`ViolationStatus` 一改名就靜默倒過來。狀態排序一律走 `sa.case`(維修、違規現在共用同一種寫法),而且測不出來 —— 只能靠等價性測試擋「顯式 sort ≠ 預設排序」
- **判定搬到 SQL 就要留一條「兩邊同答案」的測試**:`window_open_sql`、`can_close_sql` 都是照 Python 版重寫的第二份,測試同時斷言篩選結果與逐列旗標,拿掉任一條件就會紅
- 多值 query 參數改動不會破壞既有單值呼叫端(FastAPI 把 `?status=open` 解析成 `['open']`),但 `Literal` 型別的篩選要記得補齊列舉(`LoanStatusFilter` 原本漏了 `cancelled`,社團總覽的「未結束」集合就少一種)
- **同一條路徑不能有兩個 router**:`/admin/venues` 原本在 `admin_bookings` 已有 GET,新增主檔 CRUD 時整條路徑要搬到同一個模組,否則先註冊的那支贏,新端點靜默失效(症狀是回應少了欄位)
- **「送出關」與「核准關」擋的東西不一樣**:固定借用送出只擋不開放規則,撞到別社已核准的固定/臨時借用是**核准**關才擋(多社競爭同一時段本來就允許,由承辦整單擇一)。寫「兩關同一份判定」的註解與 spec 全是錯的,審查抓到才發現
- 主檔多了停用開關,就要回頭問**「停用之後既有的單怎麼辦」**:待審單不會自己消失,核准端點原本完全不看 `is_active`,核出來的單在場況圖上還看不到(列首只取啟用中場地)
- `PATCH` 的部分更新 schema 把 NOT NULL 欄位宣告成 `X | None`,顯式帶 `null` 就是 500(23502 不在錯誤轉譯表內)。器材主檔也有同一顆
- **推導狀態要一路貫穿到篩選**:畫面把「已核准且逾期鎖定」顯示成「已逾期」,後端的 `status=approved` 卻含它們 —— 清單改伺服器端篩選後,漏斗少一個選項、「已核准」還悄悄變大
- 停用的格子只擋 `pointerdown` 不夠:容器的 `elementFromPoint` 照樣掃得到 disabled 按鈕,從別處起拖再掃過去仍然選得到

- ISS-78 第一版把行政端改成「場地固定借用」,而社團端/系統設定/spec 檔名一直是「**固定場地借用**」—— 同一個功能兩個名字,`admin_rooms.py` 一個檔就有三則 Discord 標題各用一種。定案詞彙只說「用場地不用教室」,沒說詞序,改名前要先數哪個是既有多數
- ISS-86b 的第一版註解換了個同樣不正確的理由:SQLAlchemy 對「賦值等於原值」根本不發 UPDATE,`updated_at` 從來沒有危險。那個守衛真正擋的是 PATCH 的重複學號檢查查到自己(行內編輯整列送回就會 409),而這條路徑當時零測試覆蓋
- ISS-22 的原始描述指向 AntD Button,但 `handleClick` 在 `innerLoading` 時就 `preventDefault()`,隱含送出派給 default button 的 click 一樣被擋。真正會重複送出的是**表單裡根本沒有 submit 鈕**(Modal `onOk` + `form.submit()`)與 `onPressEnter` 直接接 mutation;`signup_item_sessions` 沒有唯一約束,那條是真的會落兩筆
- 元件測試環境已建(vitest 全域 jsdom + `src/test/setup.ts`);在那之前 UI 類修法零護欄,而 `src/api/` 這層本來就可測 —— 稽核批的 `fetchAllAuditLogs` 就是靠補一支測試才擋下 `page_size=200` 超過後端上限這種「按下去必掛」的錯
- **並發測試幾乎測不到真交錯**:兩支 HTTP 請求丟進 `asyncio.gather` 常常會自己排成序列(argon2 錯開、或先跑的那支一路領先到 commit),拿掉鎖照樣綠 —— 兩種寫法(login 在 gather 內/外)都試過。可靠的寫法是另開一個 session 佔住 advisory lock,再斷言請求會 timeout(見 `test_admin_eval.py`、`test_bookings.py`)
- ISS-21 後端改「省略=不動」還不夠:前端原本就是「空值→省略」,等於行為沒變。要改成「只在這次動過才送」才真的擋住跨裝置覆蓋
- ISS-60 的清理掛在 SQLAlchemy session 事件上,兩側都有坑:`after_transaction_end` 每次 commit 會觸發**兩次**(內層連線交易先於 `after_commit` 結束),只認最外層才不會把剛 commit 的檔案刪掉;而 `after_commit` 連 SAVEPOINT release 都會觸發,要用 `in_nested_transaction()` 擋掉
- 稽核的動作顯示詞前後端各一份,`account_restored` 是三元運算式的 else 分支,人工比對必漏 —— 選項清單已改由 `/admin/audit/options` 從實際紀錄取,但顯示詞表仍是第二份真相(ISS-86 同類)
- **加鎖會改變鎖序**:ISS-42 的 `with_for_update()` 讓登入變成「先鎖 sessions 再鎖 users」,與重設密碼/停權剛好相反,交叉審查實測重現 deadlock(40P01 不是 IntegrityError,使用者直接看到 500)。加任何列鎖前先確認同一組表在別處的取用順序
- argon2 要 36ms,鎖不能包住它:一社一帳號共用登入,鎖在驗證外會讓同時登入的人整排排隊並佔滿連線池。改成「驗完再取鎖 + 重讀 hash 比對」
- **一頁修完要問「另一端有沒有同一份判定」**:ISS-07/08 只修了社團端場況圖,行政端同一張圖把每個空格畫成「可借」;抽成 `cells.emptyCellState` 兩頁共用才算修完。同型的還有前端必填 vs 後端 fail-open(ISS-12b 修完又在指導老師姓名、結案與會人數、郵局存簿三處找到同一顆地雷)
- **配色要真的算對比**:「僅固定借用」第一版斜紋兩色只差 1.16:1,肉眼與「可借」同色,等於沒修。挑色前先算 relative luminance
- `fetchAllPages` 的收工條件只能看「不足一頁」:看 `out.length >= total` 的話,抓取期間有人寫入就會提早達標而漏掉尾端 —— 全站六個 CSV 匯出都靠它
- 遷移腳本寫進去的格式沒有人在驗:`staff_text` 舊碼用 `項目>負責人` + `;`,前端讀的是 `項目:負責人` + 換行,每張遷移進來的活動整份工作分配顯示成一行亂碼。新增後端必填時也要順手看 `migration/` 有沒有補得出值
- **「同一份判定有幾份」要數到底**:停權判定原本三份(社團端 `useClubProfile`、行政端逾期追蹤、行政端管理項目),抽成 `lib/status.suspendedNow` 時漏了第三份 —— 而那份正是承辦最常看的頁,`suspended_until` 過期不會自動清空,裸 truthiness 會永遠顯示「停權中」
- **把判定改成獨立查詢,就要一併決定「還沒回來」長什麼樣**:衝突標示改吃全量待審單後,查詢未就緒 = 空 Set = 畫面顯示「沒有衝突」,社團總覽還會把這個空值凍進彈窗 state。分離資料來源時,loading/error 兩態都要接
- **前端判定的軸要對齊後端**:固定借用的衝突,後端是「同場地 × 學期區間重疊 × 已核准」,前端原本只比 `場地|星期|節次`。餵全量待審單後偽陽性反而變多(上一輪沒審完的 pending 會永久留著),補上區間重疊才對得起來
- 效能修法的測試就寫「往返次數不隨資料量成長」:掛 SQLAlchemy `before_cursor_execute` 數 statement,1 社 vs 5 社比較。舊寫法 13 → 49,一眼就紅
- 未啟用的 TanStack Query 恆為 `isPending`:拿它當 loading 旗標前要先 `&&` 回啟用條件,否則沒權限的管理員會看到永遠鋪著的 Skeleton。同一頁的四支查詢只修一支不算修完
- **算出來的判定不要存進 state**:社團總覽把衝突清單在點擊當下算完凍進彈窗 state,查詢晚一步回來就永遠停在「沒有衝突」。改成 prop、每次 render 重算,誤點也會自動修正
- `out.length >= total` 這個收工條件在**五個地方**各寫了一份(四支 CSV 全量抓取 + `bookings.ts` 的私有 `fetchAllPages` 副本),上一輪只修了 `fetchAll.ts` 那一份。共用 helper 抽出來之後要順手 grep `for (let page = 1`
- 前端自行過濾後端回來的那一頁,分頁與總數一定對不上:大型檔案「全部模組」濾掉 repair 列,前 50 大剛好都是報修影片時整張表會空掉。要篩就把條件送給後端(`module` 收多值)
- 「同社同場地同一天只能一張」少了節次條件:上午擺攤與晚上彩排是兩件事。ARRAY 欄位用 `.overlap()` 才是「節次重疊」
- 破壞性腳本的環境防護要擋在 `--yes` 之前:`--yes` 存在的目的就是讓它不問就跑
- `placeholderData: keepPreviousData` 只適合「同一份清單翻頁」:query key 含篩選條件時,換篩選會讓上一個模組的列留在畫面上,而且 `isPending=false` 連 Skeleton 都不鋪。換條件要重設的不只頁碼
- 換了資料來源的頁面要問「舊的選擇還成立嗎」:行政成員列表換社團時沿用上一社的學期,新社根本沒那個學期,查出來的空列表看起來像「這社沒人」
- 後端補了權威值之後,前端那份 fallback 常數就是第二份真相 —— 拿掉,缺欄位視為 API 錯誤
- **測不出來就別假裝測得出來**:「同一格多筆待審依 id 排序」寫了斷言也擋不住拿掉 `ORDER BY` —— 小表的回傳順序由 planner 決定(join `clubs` 之後剛好又回到 id 序)。指定 id 反序寫入也壓不出來,斷言只能當契約標記,別當護欄
- **把格子變成可點的,要先確認那顆格子畫得出來**:不開放格的底色是 `transparent`,一旦允許它承載待審單就成了隱形按鈕。狀態權重蓋掉的東西,得另給一個看得見的記號(內縮橘框)
- **共用查詢加到別頁之前先問「這頁什麼時候真的需要」**:固定借用衝突名單搬到社團總覽時沒加閘門,變成每開一個社團就全校撈一次已核准固定借用,而且擋著整張借用卡轉圈 —— 開放窗一年只開幾週,平常那份清單一個字都用不到
- 原生 `autoFocus` 不是全都要換掉:它對「彈窗第一個輸入欄」正是對的,`useModalAutoFocus` 針對的是**確認鈕**(原生會把 footer 捲進視野)。ISS-84 逐處看下來只有一顆按鈕真的錯:必填輸入型彈窗把焦點放在退回鈕上,Enter 只會送出空原因
- **pointer 事件不能無腦取代 mouse 事件**:舊碼綁 `mousedown`,行動瀏覽器只在「點一下沒捲動」時才補發;改成 `pointerdown` 後手指一碰就套用,從格子上開始橫捲每次都會誤選一格(`pointercancel` 收得掉拖曳狀態、收不回已套用的切換)。觸控要走 `click` —— 捲動不會產生 click
- **AntD 的 Tag 本體是 `<span>`**:只有 close icon 有鍵盤入口。把 `<button className="link-btn">` 換成 Tag 當作觸發器,等於把可鍵盤操作的入口換掉
- `role="button"` 是 children-presentational:再給 `aria-label`,卡片裡的進度數字就全部讀不到了。整塊可點的卡片讓內容自己組名稱,別給 label
- **alembic `op.create_check_constraint(name, ...)` 會再套一次命名慣例**:傳完整的 `ck_表_名` 會變成 `ck_表_ck_表_名`,與模型端對不上。傳短名讓慣例展開
- 遷移鏈測試原本只比對欄位:索引與 CHECK 少了 revision 一樣測得過(這次兩支新約束就是這樣漏掉才被抓到),已補上名稱比對
- **spinner 換 Skeleton 不是換元件,是把「遮罩」換成「不渲染」**:`<Spin spinning>` 的 children 還在(淡化 + `pointer-events:none`),Skeleton 是整段拿掉。所以範圍要重畫 —— 卡框、卡片 marginTop、區塊標題、分頁列都得留在外面,否則同一頁兩段會塌成兩塊分不出來的灰塊,資料到位再整塊往下跳
- **一個載入旗標蓋幾張卡就是幾張卡的載入被綁在一起**:`<Spin>` 時代跨兩張卡只是一起淡化,換成 Skeleton 就是「別支查詢還沒回來、這張卡整個不存在」。總覽的公告卡本來要等「進行中申請」那七支裡最慢的一支;行政分審核換社團時,下面由 `clubsQuery` 驅動的社團清單連分頁器一起在游標底下消失
- 分頁器包在 Skeleton 裡,在**沒有 `placeholderData`** 的頁面就是「每次換頁分頁器自己消失」—— 而那些頁沒有 placeholderData 往往是刻意的(換篩選不留上一份)。分頁器一律留在 LoadingBlock 外面,比逐頁判斷該不該留舊資料省事
- **整頁的載入分支也適用「只換內容」**:`if (query.isPending) return <Skeleton/>` 讀起來合理,但那一頁的 `PageHeader` 與卡框在成功與錯誤分支都在,只有載入分支沒有 —— 資料到位時整個頁首連卡片一起冒出來
- **條件渲染的區塊排在別人上方,就不能各等各的**:活動列表的草稿卡「有草稿才出現」又排在主列表之上,兩支分開等會讓列表先到、草稿卡再插進來把它推下去。原本一個 Spin 等兩支剛好沒有這個問題
- 計數改成「載入中顯示 —」只做了一半:`isError` 時 `isPending` 是 false,badge 會印 0 或殘缺數字,旁邊還配一句「載入失敗」。載入中與失敗對使用者是同一件事;空狀態也要讓位給錯誤說明,否則「載入失敗」與「尚無資料」同時出現
- 觸控拖曳與捲動只能二選一:時段表在手機上都要橫向捲,設 `touch-action: none` 換來批量選取並不划算。改用 pointer 事件統一滑鼠/觸控筆,觸控維持逐格點選並在 spec 寫明是刻意的
- **`isError` 不等於「手上沒有資料」**:TanStack 的 error 態保留既有 `data`(背景重抓失敗只把 status 翻掉),而 `staleTime` 0 + 重開同一列就會重抓。拿 `isError` 當「換成錯誤畫面」的條件,等於把讀得到的單變成不能簽,按重試還毫無變化(data 還在,error 不會被清)。判定一律寫 `isError && !data`
- **Skeleton 沒有終點,一定要配錯誤分支**:「點擊即開、內容補齊」的彈窗只看 `!item` 就會永遠轉圈。而錯誤分支不能只換內容區 —— 需要那份詳情的動作鈕(核准、退回、繳交確認)要一起收掉,否則變成「看不到內容卻簽得下去」
- **「查詢失敗長得像沒有資料」的第二種面貌是 Select 的空選單**:AntD 預設「暫無資料」、頁面硬寫的「無審核通過之活動」「名單尚無資料」都會讓使用者去找自己哪裡沒建資料。全站走 `lib/selectOptions.notFoundText`;popup 裡不放重試鈕(互動元件太脆),改講「重新整理頁面」
- 篩選漏斗的選項來自另一支查詢:它失敗時 `items` 是空的,**使用者連取消自己下的篩選都沒有入口**(而篩選是 fail-closed 的空結果)。`FilterButton` 一律把已選值併回選單
- **共用選擇器失敗要在選擇器本身講**:`ClubCascader` 一支 `useClubOptions` 掛掉 → `clubId` 恆 null → 社團總覽/成員列表/管理項目/行政分審核四頁整頁空白、零錯誤訊息。與其把錯誤往四頁傳,不如讓那顆控制項自己換成失敗說明
- 修完一項要回頭看 spec 有沒有**過期的「未完成」條目**:`certificate.md` 還寫著「學年期下拉硬編 `['114',…]`」,而那顆早在 ISS-03 就改成取名單實際學期了
- **給了 `notFoundContent`,AntD Select 的 `loading` 就不再換成 spinner**:自訂空選單文案等於連載入中都會斬釘截鐵說「目前沒有場地」。`notFoundText` 與 `countText` 一樣要同時看 `isPending` 與 `isError`
- 「失敗」與「還沒選前置欄位」共用同一個 null 值就會**給出錯的指示**:器材品項欄的 `loanWindow` 在查詢失敗時也是 null,畫面照樣說「請先選擇關聯活動」,而活動明明已經選了 —— 使用者只會一直重選活動
- **判「唯讀」不能拿有沒有傳回呼當代理**:頁面對每一列都傳 `onApprove`(含已核准、非本關),真正的判準是 `canReview`
- 篩選值→id 的對照表查不到時,`undefined` 會讓那個查詢參數**整個消失**(= 列出全部):稽核的操作者篩選就是這樣 fail-open,而漏斗圖示還是紅的、選單還顯示著勾選。一律補 sentinel(`?? -1`),與 `ReviewPage` 的 `clubIds=[-1]` 同一寫法
- **有保底值的選項清單失敗最難察覺**:`semesterOptions` 一定補當學期,查詢掛掉時下拉看起來正常,只是歷史學期全不見 —— 空選單靠 `notFoundText`,這種「不完整卻看不出來」要靠選擇器旁邊的 `OptionsError`
- **`enabled:false` 不會清掉先前的 error**:query key 不含社團的共用查詢(全校待審/已核准固定借用)失敗後,換到不需要它的社團仍會 `isError`。把它納入某張卡的失敗判定時要一併帶上啟用條件
- 收斂類的修法要**回頭 grep 一次再宣稱「全部」**:第二輪說「四處裸紅字已修」,第三輪 grep 出還有十處(第四輪又抓到第十一處 —— 字樣不同,grep 抓不到)。commit message 與 HANDOFF 的「全部」是會被後人當事實讀的
- **狀態機的「終局狀態」只有一個出口就是地雷**:`setBooting(false)` 只寫在 `verify()` 的 `finally` 裡,而世代序號會把在途請求的 `finally` 一起作廢 —— 登入成功卻停在永久白畫面。加世代/取消機制時要逐一問「這條路徑還有誰負責關掉 loading」
- **`isError` 有兩種**:`isLoadingError`(首載失敗、手上沒資料)才該換成錯誤畫面;`isRefetchError` 換掉的是已知事實(停權日期就這樣變成「無法確認」)。TanStack 兩個旗標都有現成的,別自己用 `isError` 推
- 全域的 401 → 登出 listener 要**排除登入端點**:那裡的 401 是「密碼錯」,已登入者開著 `/login` 打錯一次就把自己登出了
- 繞過 `api()` 直接 `fetch()` 的地方(檔案下載、docx 預覽)不會走 401 → 登出那條路,session 過期只會顯示「無法取得檔案」。共用 `fetchFile`

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **456 passed**;前端 `pnpm test` → **120 passed**(27 檔)、`pnpm exec tsc -b --force` 0 錯、`pnpm run lint` 8 個既有的 fast-refresh warning
- `ruff check . ../migration` 全綠(CI 也 lint `migration/`);測試含 `test_migrations.py`(另開一個庫跑 `alembic upgrade head`,比對欄位、索引名與 CHECK 名 —— 後兩者是子集斷言,擋的是「模型有、revision 漏了」)
- `git log --all` 確認 `.env` 與 `migration/out` 從未進版控
- 每一個 commit 都做過 mutation 驗證:把修法改回舊寫法,確認新測試真的會紅

## 其他待處理

- **`MAIL_FROM_ADDRESS` 目前是開發者個人信箱**(`.env`,僅供測試)。正式環境要換成不綁個人的位址,且**必須與 `SMTP_USERNAME` 同網域**,否則校方 relay 拒收
- **結案退回的自動解鎖是永久的**:`close_unlocked` 沒有任何地方會設回 false,被退回過一次的結案從此不受期限約束(仍在逾期清單裡供追蹤)。這是 D-05 字面上的意思,但等於期限有一條誰都能走的路;若承辦覺得不妥,需要另外定「寬限幾天」的規則
- 開機的 `/auth/me` 沒有 timeout:後端連上但不回應時,前端會白畫面到 nginx 的 `proxy_read_timeout`(預設 60 秒)才顯示「無法確認登入狀態」。要收的話得先決定 timeout 值(`AbortSignal.timeout`)與失敗文案
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受此語意
- 內層 nginx 信任所有 RFC1918 網段,目前依賴 GCP firewall;正式部署可收窄至 edge/compose 實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`.env`、`start-dev.sh`(db 埠若被佔用另加 `compose.override.yml`)
