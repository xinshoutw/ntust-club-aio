# Discord Webhook 訊息完整清冊

> 供需求方設計視覺/文案模板用。內容逐一對照 `backend/app/services/notify.py` 與全部呼叫點核實(2026-07-21,第十三輪程式碼為準)。設計定稿後回頭改 `notify.py` 套模板。

## 1. 投遞機制總述

### 1.1 兩條路徑

| 路徑 | 設定位置 | 說明 |
|------|----------|------|
| **全域 webhook** | `.env` `DISCORD_WEBHOOK_URL`(`config.py` `settings.discord_webhook_url`,空值=停用並僅記 log) | 學務處自己的頻道,**每個事件必推** |
| **社團 webhook** | `clubs.discord_webhook_url`(社團於「管理項目」自行設定,格式驗證 `https://discord.com/api/webhooks/...`) | 該社團相關事件**有設才另推一份**,內容與全域完全相同 |

路由函式(`notify.py`):

- `club_event(kind, title, description, club_webhook)`:先推全域,`club_webhook` 非空再推社團——**全部 31 個一般事件都走這條**。
- `announcement_broadcast(title, content, date, emails, club_webhooks)`:公告專用,推全域 + 逐一推目標社團(Components V2 格式),並逐一寄 Email。
- `discord(kind, title, description)`:只推全域。**目前無任何呼叫點單獨使用**(僅被 `club_event` 內部呼叫)。

### 1.2 統一識別身分

`_with_identity()` 為每個 payload 補上:

- `username = "臺科大社團管理系統"`(`SYSTEM_NAME`)
- `avatar_url = "https://clubs.ntust.edu.tw/logo.png"`(`WEBHOOK_AVATAR_URL`;前端 `public/logo.png`,開發站無法解析時 Discord 僅略過頭貼)

payload 以 `{username, avatar_url, **payload}` 展開,現行 payload 從不自帶這兩鍵,故等同固定值。

### 1.3 投遞方式與失敗處理

- **一律 FastAPI `BackgroundTasks`(fire-and-forget)**:所有呼叫點皆在 `await db.commit()` **之後** `background.add_task(...)`,回應不被通知阻塞;通知內容取自已提交的資料。
- **無重試、無佇列**:`_post_webhook()` 以 `httpx.AsyncClient(timeout=5.0)` 單次 POST,任何失敗(HTTP 錯誤、逾時)只 `logger.exception()`,**絕不影響業務交易**,也不會補送。
- 全域 URL 為空字串時記 `discord disabled` 後跳過(開發環境常態)。

### 1.4 兩種 payload 格式(現行)

1. **單一 embed(31 個一般事件)**——`discord_to()`:

   ```json
   {"embeds": [{"title": "<title 截 256>", "description": "<desc 截 2000>", "color": <依 kind>}]}
   ```

   **無** fields、footer、timestamp、url、author、image;所有資訊擠在 description 單行字串。

2. **Components V2(僅公告)**——`announcement_components()`:`flags = 1<<15`(IS_COMPONENTS_V2),Container(type 17,`accent_color` 藍)內含一個 Text Display(type 10),文字為 `**{title}**\n\n{content}`(**標題+內文合併截 3800**)再附加 `\n\n-# {date}`(Discord 小字語法,日期不會被截掉)。發送需帶 query param `with_components=true`。

### 1.5 顏色表 `_COLORS`(kind → embed color)

| kind | 色碼 | 語意 |
|------|------|------|
| `announce` | `0x3B82F6` 藍 | 公告/一般通知(也是未知 kind 的 fallback) |
| `submit` | `0xF59E0B` 橙 | 送審/新申請 |
| `approve` | `0x22C55E` 綠 | 通過/完成 |
| `reject` | `0xEF4444` 紅 | 退回/拒絕 |
| `alert` | `0x8B5CF6` 紫 | 系統事件(鎖定解除、逾期提醒、停權、評鑑調整) |

### 1.6 長度限制注意(設計模板時)

- 現行程式自截:embed title 256、description 2000(Discord 實際上限 4096,程式取保守值)、公告 Text Display 3800(Discord 上限 4000)。
- 活動名、社團名、退回原因(≤500 字)、公告內文皆為使用者輸入,模板要容忍長字串被截斷。
- Discord webhook 速率限制約每 2 秒 5 則/每分鐘 30 則:公告逐社團推送(60+ 社團)時可能觸頂,現行無退避機制,失敗即丟棄。

## 2. 事件總覽表

共 **32 個事件**(其中 4 個依狀態有兩種文案,合計 36 種訊息變體)。目的地欄:「兩者」=全域必推+該社團有設 webhook 才推(`club_event` 標準行為)。

| # | 事件 | 觸發動作 | 端點 | kind(顏色) | 目的地 | 現行訊息一行摘要 |
|---|------|----------|------|--------------|--------|------------------|
| A1 | 公告發布 | 管理員發布公告且勾「通知」 | `POST /admin/announcements` | Components V2(藍) | 全域+**全部目標社團**+Email | `**標題**` + 內文 + 日期 |
| B1 | 活動申請送審 | 社團送出活動申請 | `POST /club/activities/{id}/submit` | submit(橙) | 兩者 | 社名:活動名(日期 @ 地點) |
| B2 | 活動申請通過關卡/已核准 | 管理員核准(中間關/終關) | `POST /admin/activities/{id}/approve` | submit(橙)/approve(綠) | 兩者 | 活動名(關卡:stage) |
| B3 | 活動申請退回 | 管理員退回(必填原因) | `POST /admin/activities/{id}/reject` | reject(紅) | 兩者 | 活動名:原因 |
| C1 | 活動結案送審 | 社團送出結案 | `POST /club/activities/{id}/close` | submit(橙) | 兩者 | 社名:活動名(日期) |
| C2 | 活動結案已核准 | 輔導老師核准結案 | `POST /admin/activities/{id}/close-approve` | approve(綠) | 兩者 | 活動名 |
| C3 | 活動結案退回 | 輔導老師退回結案 | `POST /admin/activities/{id}/close-reject` | reject(紅) | 兩者 | 活動名:原因 |
| C4 | 結案鎖定已解除 | 管理員解鎖逾期活動 | `POST /admin/activities/{id}/unlock` | alert(紫) | 兩者 | 活動名 |
| D1 | 教室固定借用申請 | 社團送出固定借用 | `POST /club/room-bookings` | submit(橙) | 兩者 | 帳號名:場地(N 個每週時段) |
| D2 | 臨時場地借用申請 | 社團送出臨時借用 | `POST /club/venue-bookings` | submit(橙) | 兩者 | 帳號名:場地(日期 節次) |
| D3 | 器材借用申請 | 社團送出器材借用 | `POST /club/equipment-loans` | submit(橙) | 兩者 | 帳號名:器材 ×數量(區間,活動) |
| D4 | 臨時場地借用已核准 | 管理員核准 | `POST /admin/venue-bookings/{id}/approve` | approve(綠) | 兩者* | 場地(日期 節次) |
| D5 | 臨時場地借用退回 | 管理員退回 | `POST /admin/venue-bookings/{id}/reject` | reject(紅) | 兩者* | 場地(日期):原因 |
| D6 | 器材借用已核准 | 管理員核准 | `POST /admin/equipment-loans/{id}/approve` | approve(綠) | 兩者* | 器材 ×數量(區間) |
| D7 | 器材借用退回 | 管理員退回 | `POST /admin/equipment-loans/{id}/reject` | reject(紅) | 兩者* | 器材 ×數量:原因 |
| D8 | 教室固定借用已核准 | 管理員核准 | `POST /admin/room-bookings/{id}/approve` | approve(綠) | 兩者 | 場地(N 個每週時段) |
| D9 | 教室固定借用退回 | 管理員退回 | `POST /admin/room-bookings/{id}/reject` | reject(紅) | 兩者 | 場地:原因 |
| D10 | 器材歸還提醒 | super 於逾期追蹤頁手動發送 | `POST /admin/equipment-loans/{id}/remind` | alert(紫) | 兩者+Email | 社名:器材 ×數量(區間、期限)請儘速歸還 |
| E1 | 幹部證明申請 | 社團送出申請 | `POST /club/officer-certificates` | submit(橙) | 兩者 | 帳號名:學年期 職位 |
| E2 | 郵局帳戶異動申請 | 社團送出申請 | `POST /club/postal-changes` | submit(橙) | 兩者 | 帳號名:事由們 |
| E3 | 空間報修申請 | 社團送出報修 | `POST /club/maintenance` | submit(橙) | 兩者 | 帳號名:地點(損壞項目) |
| E4 | 幹部證明狀態更新 | 管理員推進狀態 | `POST /admin/officer-certificates/{id}/status` | alert(紫)/approve(綠) | 兩者 | 社名:學年期 職位 幹部姓名 |
| E5 | 郵局帳戶異動狀態更新 | 管理員推進狀態 | `POST /admin/postal-changes/{id}/status` | alert(紫)/approve(綠) | 兩者 | 社名:事由們 |
| E6 | 空間報修狀態更新 | 管理員推進狀態 | `POST /admin/maintenance/{id}/status` | alert(紫)/approve(綠) | 兩者 | 社名:地點(損壞項目) |
| F1 | 線上報名送出 | 社團完成報名 | `POST /club/signup-items/{id}/signup` | submit(橙) | 兩者 | 社名:活動名(N 人)[(待確認)] |
| F2 | 報名已確認 | 管理員確認審核制報名 | `PUT /admin/signup-items/{item_id}/registrations/{club_id}/confirm` | approve(綠) | 兩者 | 社名:活動名 |
| G1 | 違規勸導已銷案 | 管理員銷案 | `POST /admin/violations/{id}/resolve` | approve(綠) | 兩者 | 社名:發生日 地點 |
| H1 | 行政分手動調整 | 管理員覆寫評分項 | `POST /admin/eval/clubs/{id}/override` | alert(紫) | 兩者 | 社名:key → 分數(原因) |
| H2 | 行政分回到自動計算 | 管理員撤銷覆寫 | `POST /admin/eval/clubs/{id}/revert` | alert(紫) | 兩者 | 社名:key(原因) |
| H3 | 表現優良加分登錄 | 管理員登錄加分 | `POST /admin/eval/clubs/{id}/merit` | alert(紫) | 兩者 | 社名:+分數(原因) |
| I1 | 社團停權通知 | super 停權社團 | `POST /admin/clubs/{id}/suspend` | alert(紫) | 兩者 | 社名:即日起至日期暫停借用(原因) |
| I2 | 社團停權解除 | super 解除停權 | `DELETE /admin/clubs/{id}/suspend` | alert(紫) | 兩者 | 社名:即日起恢復借用申請 |

\* D4–D7 經 `admin_bookings._notify_club`:`club_id` 為 NULL(行政手動借用)或社團不存在時**直接跳過不通知**。

**不發任何通知的相近動作**(設計時可問需求方是否要補):三種借用的社團自行取消(`/cancel`)、違規勸導開立(僅銷案通知)、行政手動借用建立(manual-venue/manual-equipment)、報名簽到登錄、公告蓋板切換/刪除、活動草稿儲存/刪除、器材借出與歸還點交。

## 3. 共通資料欄位(所有事件皆可取得)

每個呼叫點 scope 內都有 `club`(ORM 物件)與 `user`(操作者),以下欄位不再逐事件重列,模板皆可用:

| 欄位 | 型別 | 範例值 | 目前是否已用上 |
|------|------|--------|----------------|
| `club.id` | int | `42` | — |
| `club.name` | str | `熱舞社` | 部分事件(見各節) |
| `club.kind` | enum | `社團` / `學會` | — |
| `club.attribute` | enum \| None | `藝術性` | — |
| `club.contact_emails` | list[str] | `["a@mail.ntust.edu.tw"]` | 僅 D10、A1(Email) |
| `club.suspended_until` | date \| None | `2026-08-31` | 僅 I1(取自 body) |
| `user.id` | int | `7` | — |
| `user.name` | str | 社團端=社團帳號顯示名;管理端=承辦/審核人姓名 | 社團端申請類 desc 用 |
| `user.role` | enum | `admin` / `club` | — |
| `notify.SYSTEM_NAME` | const | `臺科大社團管理系統` | webhook username |
| `notify.SITE_URL` | const | `https://clubs.ntust.edu.tw` | 未用於 webhook(僅 Email footer) |

**可組出的頁面連結**(`SITE_URL` + 前端路由;現行 webhook 完全未附連結,模板可加):

| 模組 | 社團端 | 行政端 |
|------|--------|--------|
| 活動申請/列表 | `/activities`、`/activities/:id/edit` | `/admin/review` |
| 活動結案 | `/activities/close`(支援 `?id=` 預選) | `/admin/close-review` |
| 借用 | `/bookings`、`/bookings/fixed`、`/bookings/venue`、`/bookings/equipment` | `/admin/bookings`、`/admin/rooms`、`/admin/overdue` |
| 線上申請 | `/maintenance`、`/postal`、`/certificates` | `/admin/applications`、`/admin/maintenance` |
| 線上報名 | `/signup`、`/signup/:id` | `/admin/signups` |
| 違規 | `/violations` | `/admin/violations` |
| 評鑑 | `/eval`、`/eval/result` | `/admin/eval` |
| 公告 | `/`(總覽) | `/admin/announcements` |

註:除列出者外前端無 per-id 詳情路由(詳情皆為列表內彈窗),深連結大多只能到列表頁。

以下各節「已用」欄:✓=已出現在現行訊息;—=在 scope 內但未用;「需補查」=多查一次 DB 即可取得。

## 4. 公告

### A1. 公告發布通知(唯一 Components V2 事件)

- **觸發情境**:管理員於「發布公告」建立公告並勾選「通知」(`body.notify=true`)。目標=全校 / 多個性質 / 單一社團。
- **端點/呼叫點**:`POST /admin/announcements`(`admin_announcements.py:59`,通知於 `:103-107`)→ `notify.announcement_broadcast`。
- **目的地**:全域 webhook + 每個目標社團的自設 webhook(逐一發送,payload 相同);同時寄 Email 給各目標社團 `contact_emails` **前 3 組**。
- **現行 Discord 訊息**(Components V2,Container `accent_color=0x3B82F6`):

  ```
  **{title}**

  {content}          ← markdown 原文;title+content 合併截 3800

  -# {date}          ← 台北時區 %Y/%m/%d,小字
  ```

- **現行 Email**:subject `【臺科大社團管理系統】{title}`;HTML 模板 `announcement_email_html()`(深藍 #14304A header 卡片、`<pre>` 呈現原文、footer 連回 SITE_URL);純文字版 `{title}\n{date}\n\n{content}\n\n-- 臺科大社團管理系統 https://clubs.ntust.edu.tw`;template 標記 `announcement` 寫入 `email_logs`。
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `row.id` | int | `15` | — |
| `row.title` | str | `114-2 社團評鑑說明會` | ✓ |
| `row.content` | str(markdown) | `## 時間\n3/1 18:00…` | ✓ |
| `date_str` | str | `2026/07/21` | ✓ |
| `row.target_type` | enum | `all` / `attr` / `club` | — |
| `row.attrs` | list[str] \| None | `["藝術性","體育性"]` | — |
| `row.club_id` | int \| None | `42` | — |
| `row.takeover_until` | date \| None | `2026-08-01`(蓋板截止) | — |
| 發布人 `user.name` | str | `王承辦` | — |
| 目標社團清單 `clubs` | list[Club] | 各社 id/name/attribute | —(僅取 emails/webhooks) |
| `emails` | list[str] | 收件清單 | ✓(Email) |
| `webhooks` | list[str] | 目標社團 webhook | ✓ |

## 5. 活動申請與審核

### B1. 活動申請送審

- **觸發情境**:社團填妥活動申請(名稱/類型/起訖/地點/人數/工作分配/經費明細/附件)按「送出」,進入第一關(輔導老師)。
- **端點/呼叫點**:`POST /club/activities/{activity_id}/submit`(`activities.py:226`,通知 `:249-255`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`活動申請送審`
  - Description:`{club.name}:{activity.name}({activity.date} @ {activity.location})`,例:`熱舞社:期末成果展(2026-12-20 @ 學生活動中心201)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `activity.id` | int | `88` | — |
| `activity.name` | str | `期末成果展` | ✓ |
| `activity.type` | enum | `社課或會議` / `活動` | — |
| `activity.is_large` | bool | `true`(申請認定為大型) | — |
| `activity.date` / `end_date` | date | `2026-12-20` | ✓(僅開始日) |
| `activity.start_time` / `end_time` | time \| None | `18:00` | — |
| `activity.location` | str | `學生活動中心201` | ✓ |
| `activity.content` | str | 活動內容(≤150 字) | — |
| `activity.participants_in` / `participants_out` | int | `30` / `5`(社員/非社員) | — |
| `activity.staff_text` | str | 工作分配 | — |
| `activity.budget_items[]` | list | 各項 `category`/`description`/`self_fund`/`requested_subsidy` | — |
| 擬請補助總額 | int(加總可得) | `8000` | — |
| 是否走三關 | bool(擬請>0 推導) | `true` | — |
| `activity.status` | enum | `pending_advisor` | — |
| `lock_months` | int(設定) | `1` | — |
| 附件清單/數量 | list[File] | 企劃書.pdf | 需補查(`svc.activity_files`) |

### B2. 活動申請通過關卡 / 活動申請已核准

- **觸發情境**:管理員(輔導老師/組長/學務長)於活動申請審核核准。有補助走三關,無補助輔導老師單關即核准;第一關同時逐項核定金額、認定經費來源、認可大型活動。
- **端點/呼叫點**:`POST /admin/activities/{activity_id}/approve`(`admin_activities.py:264`,通知 `:330-337` 經 `_notify_decision` helper `:109-113`,helper 內以 `club_id` 取 `club` 讀 webhook)。
- **kind**:終關 `approve`(綠);中間關卡 `submit`(橙)。
- **現行訊息**(兩變體):
  - Title:`活動申請已核准`(終關)/ `活動申請通過關卡`(中間關卡)
  - Description:`{activity.name}(關卡:{stage})`,`stage` ∈ `advisor`/`chief`/`dean`(英文代碼直出),例:`期末成果展(關卡:advisor)`
- **現況問題**:desc 無社團名(全域頻道認不出是哪個社團)、無核定補助金額、stage 是英文代碼。
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `activity.*` | — | 同 B1 全部欄位 | 僅 name |
| `stage` | str | `advisor` / `chief` / `dean` | ✓(英文直出) |
| `final` | bool | `true`=終核 | ✓(決定文案) |
| 下一關 | str(推導) | `chief` | — |
| `activity.school_approved` | int \| None | `6000`(核定補助總額,第一關後有值) | — |
| `activity.fund_source` | str \| None | `學生會補助` | — |
| `budget_items[].approved_subsidy` | int \| None | 逐項核定 | — |
| `activity.is_large_approved` | bool \| None | `true`(認可 ×3) | — |
| 審核人 `user.name` | str | `王承辦`(dean 關=學務長本人) | — |
| `club.name` | str | helper 內已取得 | — |

### B3. 活動申請退回

- **觸發情境**:任一關卡管理員退回,必填原因;活動回 `rejected`,社團可修改後重送。
- **端點/呼叫點**:`POST /admin/activities/{activity_id}/reject`(`admin_activities.py:344`,通知 `:372-379`)。
- **kind**:`reject`(紅)。
- **現行訊息**:
  - Title:`活動申請退回`
  - Description:`{activity.name}:{body.reason}`,例:`期末成果展:經費明細與活動內容不符,請調整後重送`
- **可提供的資料欄位**:同 B2(activity 全欄位、`stage`=退回關卡、審核人 `user`、`club`),另:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `body.reason` | str(1–500 字) | `經費明細與活動內容不符` | ✓ |

## 6. 活動結案

### C1. 活動結案送審

- **觸發情境**:活動結束後社團填成果調查(實際人數/時間/地點、重點/目標/其他、檢討會議、心得 ≥3 篇、照片 ≥1 張、實際支出)送出結案,進輔導老師單關。
- **端點/呼叫點**:`POST /club/activities/{activity_id}/close`(`activities.py:439`,通知 `:497-503`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`活動結案送審`
  - Description:`{club.name}:{activity.name}({activity.date})`,例:`熱舞社:期末成果展(2026-12-20)`
- **可提供的資料欄位**(activity 同 B1,另有整份結案資料):

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `report.member_count` / `non_member_count` | int | `28` / `4`(實際人數) | — |
| `report.actual_start` / `actual_end` | time | `18:10` / `21:00` | — |
| `report.actual_location` | str | `學生活動中心201` | — |
| `report.highlights` / `goals` / `others` | str | 成果文字 | — |
| `report.review_meeting` | bool | `true` | — |
| `report.review_date` / `review_attendees` / `review_topics` / `review_conclusion` | 各型別 | 檢討會議四欄 | — |
| `report.video_url` | str \| None | `https://youtu.be/...` | — |
| `report.expense` | int | `9500`(實際支出) | — |
| `body.reflections[]` | list | 心得(姓名/系級/內文,≥3 筆) | — |
| `photo_count` | int | `6`(照片張數) | — |
| `now` | datetime | 送出時刻 | — |

### C2. 活動結案已核准

- **觸發情境**:輔導老師核准結案(可勾繳交確認:照片/成果/心得,未確認項評鑑以 0 分計);活動轉 `closed`,始計入行政分。
- **端點/呼叫點**:`POST /admin/activities/{activity_id}/close-approve`(`admin_activities.py:383`,通知 `:414-416`)。
- **kind**:`approve`(綠)。
- **現行訊息**:
  - Title:`活動結案已核准`
  - Description:`{activity.name}`(僅活動名,無社團名)
- **可提供的資料欄位**:activity 全欄位、審核人 `user`、`club`(helper 內),另:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `body.photos_confirmed` / `report_confirmed` / `reflections_confirmed` | bool | `true` | — |
| `report`(整份結案資料) | — | 同 C1 | 需補查(`db.get(ActivityReport, id)`) |

### C3. 活動結案退回

- **觸發情境**:輔導老師退回結案(必填原因);活動回 `approved`,社團可修正後重送。
- **端點/呼叫點**:`POST /admin/activities/{activity_id}/close-reject`(`admin_activities.py:420`,通知 `:452-459`)。
- **kind**:`reject`(紅)。
- **現行訊息**:
  - Title:`活動結案退回`
  - Description:`{activity.name}:{body.reason}`
- **可提供的資料欄位**:同 C2 + `body.reason`(str,1–500,✓ 已用)。

### C4. 結案鎖定已解除

- **觸發情境**:活動逾期未結案被鎖定(活動結束日 + `close_lock_months` 個月),管理員(權限鍵 `aclose`)手動解鎖,社團恢復可結案。
- **端點/呼叫點**:`POST /admin/activities/{activity_id}/unlock`(`admin_activities.py:463`,通知 `:488-490`)。
- **kind**:`alert`(紫)。
- **現行訊息**:
  - Title:`結案鎖定已解除`
  - Description:`{activity.name}`
- **可提供的資料欄位**:activity 全欄位、操作人 `user`、`club`,另:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `lock_months` | int | `1`(鎖定門檻設定) | — |
| 原鎖定期限 | date(推導) | `2027-01-20` | — |

## 7. 空間與器材借用

### D1. 教室固定借用申請

- **觸發情境**:開放窗期間,社團申請下一學期每週固定時段(星期×節次網格,每社至多 10 節)。
- **端點/呼叫點**:`POST /club/room-bookings`(`bookings.py:200`,通知 `:264-270` 經 `_notify_submit` helper `:48-50`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`教室固定借用申請`
  - Description:`{user.name}:{venue.name}({len(body.slots)} 個每週時段)`,例:`熱舞社:活動中心201(4 個每週時段)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `row.id` | int | `310` | — |
| `venue.name` | str | `活動中心201` | ✓ |
| `venue.category` / `capacity` | enum / int | `教室` / `60` | — |
| `body.slots[]` | list | `[{weekday:1, period:"9"}, …]`(1=週一;節次 1–10、A–D) | 僅數量 |
| `row.purpose` | str | `每週社課` | — |
| `row.start_date` / `end_date` | date | `2026-08-01` / `2027-01-31`(目標學期起訖快照) | — |
| `used_count` | int | `4`(本學期已佔節數) | — |
| 目標學期 | str(推導) | `115-1` | — |

### D2. 臨時場地借用申請

- **觸發情境**:社團為某個審核通過的活動申請單日臨時場地(多節次)。
- **端點/呼叫點**:`POST /club/venue-bookings`(`bookings.py:309`,通知 `:352-358`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`臨時場地借用申請`
  - Description:`{user.name}:{venue.name}({body.date} 節次 {','.join(body.periods)})`,例:`熱舞社:活動中心201(2026-12-18 節次 8,9,10)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `row.id` | int | `522` | — |
| `venue.name` | str | `活動中心201` | ✓ |
| `body.date` | date | `2026-12-18` | ✓ |
| `body.periods` | list[str] | `["8","9","10"]` | ✓ |
| `row.purpose` | str | `成果展彩排` | — |
| `row.phone` | str \| None | `0912345678`(敏感,建議不入訊息) | — |
| `activity.id` / `activity.name` | int / str | `88` / `期末成果展`(關聯活動) | — |

### D3. 器材借用申請

- **觸發情境**:社團為審核通過的活動借器材;借用區間由活動起訖 ± 工作天緩衝自動推導。
- **端點/呼叫點**:`POST /club/equipment-loans`(`bookings.py:406`,通知 `:449-455`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`器材借用申請`
  - Description:`{user.name}:{equipment.name} ×{body.qty}({start}~{end},活動:{activity.name})`,例:`熱舞社:無線麥克風 ×4(2026-12-16~2026-12-21,活動:期末成果展)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `loan.id` | int | `701` | — |
| `equipment.name` | str | `無線麥克風` | ✓ |
| `equipment.total_qty` / `max_lease_count` / `needs_serial` | int / int\|None / bool | `10` / `4` / `true` | — |
| `body.qty` | int | `4` | ✓ |
| `start` / `end` | date(推導快照) | `2026-12-16` / `2026-12-21` | ✓ |
| `available` | int | `6`(區間內可借數) | — |
| `loan.purpose` | str | `舞台音響` | — |
| `loan.phone` | str \| None | 敏感 | — |
| `activity.name` | str | `期末成果展` | ✓ |
| `buffer` | int(設定) | `2`(工作天緩衝) | — |

### D4. 臨時場地借用已核准

- **觸發情境**:管理員核准臨時場地借用(核准前系統擋時段衝突與不開放規則)。
- **端點/呼叫點**:`POST /admin/venue-bookings/{booking_id}/approve`(`admin_bookings.py:157`,通知 `:195-203` 經 `_notify_club` helper `:66-75`)。**`club_id` 為 NULL(行政手動借用)或社團不存在時不通知**。
- **kind**:`approve`(綠)。
- **現行訊息**:
  - Title:`臨時場地借用已核准`
  - Description:`{venue.name}({booking.date} 節次 {','.join(booking.periods)})`(無社團名)
- **可提供的資料欄位**:booking 全欄位(同 D2:date/periods/purpose/phone/activity_id)、`venue`、審核人 `user`、`club`(helper 內),另:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| 關聯活動名 | str | `期末成果展` | 需補查(`activity_id` → Activity) |

### D5. 臨時場地借用退回

- **端點/呼叫點**:`POST /admin/venue-bookings/{booking_id}/reject`(`admin_bookings.py:209`,通知 `:232-240`)。
- **kind**:`reject`(紅)。
- **現行訊息**:
  - Title:`臨時場地借用退回`
  - Description:`{venue.name}({booking.date}):{body.reason}`(無社團名、無節次)
- **可提供的資料欄位**:同 D4 + `body.reason`(✓)。

### D6. 器材借用已核准

- **端點/呼叫點**:`POST /admin/equipment-loans/{loan_id}/approve`(`admin_bookings.py:315`,通知 `:337-344`)。可借數不足仍可核准(管理員裁量)。
- **kind**:`approve`(綠)。
- **現行訊息**:
  - Title:`器材借用已核准`
  - Description:`{equipment.name} ×{loan.qty}({loan.start_date}~{loan.end_date})`(無社團名)
- **可提供的資料欄位**:loan 全欄位(qty/start/end/purpose/phone/activity_id)、`equipment`、審核人 `user`、`club`;關聯活動名需補查。

### D7. 器材借用退回

- **端點/呼叫點**:`POST /admin/equipment-loans/{loan_id}/reject`(`admin_bookings.py:350`,通知 `:373-381`)。
- **kind**:`reject`(紅)。
- **現行訊息**:
  - Title:`器材借用退回`
  - Description:`{equipment.name} ×{loan.qty}:{body.reason}`(無社團名、無區間)
- **可提供的資料欄位**:同 D6 + `body.reason`(✓)。

### D8. 教室固定借用已核准

- **觸發情境**:管理員整單核准固定借用(衝突整單擇一,無部分核准)。
- **端點/呼叫點**:`POST /admin/room-bookings/{request_id}/approve`(`admin_rooms.py:106`,通知 `:144-152` 經 `_notify_club` helper `:99-103`;此 helper 無 NULL 檢查,固定借用必有社團)。
- **kind**:`approve`(綠)。
- **現行訊息**:
  - Title:`教室固定借用已核准`
  - Description:`{venue.name}({len(booking.slots)} 個每週時段)`(無社團名、無具體時段)
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `booking.slots[]` | list | `[{weekday, period}]` 具體時段 | 僅數量 |
| `booking.start_date` / `end_date` | date | 學期起訖 | — |
| `booking.purpose` | str | `每週社課` | — |
| `venue.name` | str | `活動中心201` | ✓ |
| 審核人 `user.name` | str | `王承辦` | — |

### D9. 教室固定借用退回

- **端點/呼叫點**:`POST /admin/room-bookings/{request_id}/reject`(`admin_rooms.py:158`,通知 `:179-187`)。
- **kind**:`reject`(紅)。
- **現行訊息**:
  - Title:`教室固定借用退回`
  - Description:`{venue.name}:{body.reason}`
- **可提供的資料欄位**:同 D8 + `body.reason`(✓)。

### D10. 器材歸還提醒(Discord + Email)

- **觸發情境**:super 於逾期追蹤頁對「借出中」(`checked_out`)的借用單手動發送提醒(逾期與否由管理員判讀,系統不自動發)。行政手動借用(`club_id` NULL)409 拒絕。
- **端點/呼叫點**:`POST /admin/equipment-loans/{loan_id}/remind`(`admin_overdue.py:40`,Discord 通知 `:77`、Email `:78-81`)。
- **kind**:`alert`(紫)。
- **現行 Discord 訊息**:
  - Title:`器材歸還提醒`
  - Description:`{club.name}:{equipment.name} ×{loan.qty}(借用區間 {loan.start_date}~{loan.end_date},歸還期限 {deadline:%Y-%m-%d %H:%M}),請儘速辦理歸還點交。`
- **現行 Email**:同文案(純文字)逐一寄 `club.contact_emails` 全部,subject `【臺科大社團管理系統】器材歸還提醒`,template `loan_reminder`。
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `equipment.name` | str | `無線麥克風` | ✓ |
| `loan.qty` | int | `4` | ✓ |
| `loan.start_date` / `end_date` | date | 借用區間 | ✓ |
| `deadline` | datetime | `2026-12-22 10:30`(結束日隔天上班日 10:30,排除假日) | ✓ |
| `loan.borrower_name` | str \| None | `張同學`(借出點交登記) | — |
| `loan.checkout_at` | datetime \| None | 借出時刻 | — |
| `loan.serials` | list[str] \| None | 序號清單 | — |
| 關聯活動名 | str | — | 需補查 |
| 操作人 `user.name` | str | super 管理員 | — |

## 8. 線上申請

### E1. 幹部證明申請

- **觸發情境**:社團申請幹部(正/副負責人)證明;姓名由成員名單依學年期+職位自動帶出。
- **端點/呼叫點**:`POST /club/officer-certificates`(`applications.py:77`,通知 `:106-108` 經 `_notify_submit` helper `:53-55`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`幹部證明申請`
  - Description:`{user.name}:{body.term} {body.position.value}`,例:`熱舞社:114-1 社長或會長`(position 實值=`社長或會長`/`副社長或副會長`)
- **注意**:desc 用 `user.name`(操作帳號)而非 `row.applicant_name`(實際幹部姓名)。
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `row.id` | int | `55` | — |
| `body.term` | str | `114-1` 或 `114`(全學年) | ✓ |
| `body.position.value` | enum | `社長或會長` | ✓ |
| `row.applicant_name` | str | `李小明`(名單帶出的幹部) | — |
| `row.status` | enum | `pending` | — |
| 依 `club.kind` 顯示詞 | str(推導) | 社→`社長`、會→`會長` | — |

### E2. 郵局帳戶異動申請

- **端點/呼叫點**:`POST /club/postal-changes`(`applications.py:136`,通知 `:155-158`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`郵局帳戶異動申請`
  - Description:`{user.name}:{'、'.join(reasons)}`,例:`熱舞社:更換代理人、印鑑變更`(reasons ∈ 更換代理人/新開戶/印鑑變更/帳簿遺失/結清銷戶/存簿密碼異動)
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `row.reasons` | list[str] | `["更換代理人"]` | ✓ |
| `row.account_name` | str | 戶名(敏感) | — |
| `row.account_number` | str | 局號帳號(**敏感,勿入訊息**) | — |
| `row.new_agent_name` / `new_agent_phone` | str \| None | 新代理人(電話敏感) | — |
| `row.status` | enum | `pending` | — |

### E3. 空間報修申請

- **端點/呼叫點**:`POST /club/maintenance`(`applications.py:204`,通知 `:216-218`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`空間報修申請`
  - Description:`{user.name}:{body.location}({body.items})`,例:`熱舞社:社辦B12(冷氣不冷、日光燈閃爍)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `row.location` | str | `社辦B12` | ✓ |
| `row.items` | str | `冷氣不冷、日光燈閃爍` | ✓ |
| `row.status` | enum | `pending` | — |
| 佐證檔案 | list[File] | 通知當下必為 0 筆(照片/影片為後續上傳) | — |

### E4. 幹部證明狀態更新

- **觸發情境**:管理員推進狀態(審核中 → 處理中 → 完成,單步前進、無退回)。
- **端點/呼叫點**:`POST /admin/officer-certificates/{cert_id}/status`(`admin_applications.py:117`,通知 `:141-149`)。
- **kind / 訊息**(兩變體,`done = body.status == COMPLETED`):
  - 完成:kind `approve`(綠),Title `幹部證明已完成,請洽學務處領取`
  - 處理中:kind `alert`(紫),Title `幹部證明處理中`
  - Description(共用):`{club.name}:{row.term} {row.position.value} {row.applicant_name}`,例:`熱舞社:114-1 社長或會長 李小明`
- **可提供的資料欄位**:row 全欄位(同 E1)、`body.status`(enum)、操作管理員 `user.name`;皆已用上主要欄位。

### E5. 郵局帳戶異動狀態更新

- **端點/呼叫點**:`POST /admin/postal-changes/{change_id}/status`(`admin_applications.py:155`,通知 `:181-189`)。
- **kind / 訊息**(兩變體):
  - 完成:`approve` / `郵局帳戶異動已完成,請洽學務處`
  - 處理中:`alert` / `郵局帳戶異動處理中`
  - Description(共用):`{club.name}:{'、'.join(row.reasons)}`
- **可提供的資料欄位**:row 全欄位(同 E2,含敏感帳號)、`body.status`、`user`。

### E6. 空間報修狀態更新

- **端點/呼叫點**:`POST /admin/maintenance/{request_id}/status`(`admin_maintenance.py:85`,通知 `:117-125`)。狀態機:待處理 → 處理中 → 已完成(單步前進)。
- **kind / 訊息**(兩變體,`done = status == DONE`):
  - 已完成:`approve` / `空間報修已完成`
  - 處理中:`alert` / `空間報修處理中`
  - Description(共用):`{club.name}:{row.location}({row.items})`
- **可提供的資料欄位**:row 全欄位 + `body.handle_note`(str ≤500,處理註記,**現行未入訊息**)、`body.status`、`user`。

## 9. 線上報名

### F1. 線上報名送出

- **觸發情境**:社團對管理員建立的報名活動送出報名(可多人、自訂表單欄位;競賽項須勾獎項;一經報名不得更改)。
- **端點/呼叫點**:`POST /club/signup-items/{item_id}/signup`(`signups.py:137`,通知 `:200-208`)。
- **kind**:`submit`(橙)。
- **現行訊息**:
  - Title:`線上報名`
  - Description:`{club.name}:{item.name}({len(body.participants)} 人){pending}`,`pending` = 審核制時 `(待確認)` 否則空字串。例:`熱舞社:社團負責人研習營(3 人)(待確認)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `item.name` | str | `社團負責人研習營` | ✓ |
| `item.kind` | enum | `normal` / `cadre_training` / `leader_meeting` | — |
| `item.event_at` / `place` | datetime \| None / str \| None | 活動時間/地點 | — |
| `item.signup_end` | datetime \| None | 報名截止 | — |
| `item.max_participants` | int | `5`(每社上限) | — |
| `item.requires_confirmation` | bool | `true`(審核制) | ✓(僅後綴) |
| `item.is_eval` | bool | 競賽報名項 | — |
| `body.participants` | list | 人數+各欄答案 | 僅人數 |
| `body.awards` | list[str] | 勾選獎項 id | — |
| `signup.id` / `confirmed` | int / bool | `93` / `false` | — |

### F2. 報名已確認

- **觸發情境**:審核制報名活動,管理員確認該社報名後才算成功。
- **端點/呼叫點**:`PUT /admin/signup-items/{item_id}/registrations/{club_id}/confirm`(`admin_signups.py:201`,通知 `:232-239`)。
- **kind**:`approve`(綠)。
- **現行訊息**:
  - Title:`報名已確認`
  - Description:`{club.name}:{item.name}`
- **可提供的資料欄位**:`item` 全欄位(同 F1)、`signup.confirmed`、操作管理員 `user`;報名人數/名單需補查(`signup.entries`)。

## 10. 違規

### G1. 違規勸導已銷案

- **觸發情境**:社團於期限內(開立日 +1 個月)完成改善,管理員銷案;逾期即不再受理、−1 扣分成立。**開立違規不發通知,僅銷案發**。
- **端點/呼叫點**:`POST /admin/violations/{violation_id}/resolve`(`admin_violations.py:106`,通知 `:138-145`)。
- **kind**:`approve`(綠)。
- **現行訊息**:
  - Title:`違規勸導已銷案`
  - Description:`{club.name}:{violation.occurred_on} {violation.location}`,例:`熱舞社:2026-06-10 社辦B12`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `violation.occurred_on` | date | `2026-06-10` | ✓ |
| `violation.location` | str | `社辦B12` | ✓ |
| `violation.items` | list[str] | `["未關冷氣","環境髒亂"]`(違規項目) | — |
| `violation.other` | str \| None | 其他說明 | — |
| `body.note`(=`resolve_note`) | str | 銷案註記 | — |
| `filler`(開單工讀生 User) | User | `filler.name`(回應已取,通知 scope 需補查) | 需補查 |
| 操作管理員 `user.name` | str | `王承辦` | — |

## 11. 評鑑

### H1. 行政分手動調整

- **觸發情境**:管理員於行政分審核頁覆寫某評分項(ad1–ad8 等)的自動計算分數,必填原因。
- **端點/呼叫點**:`POST /admin/eval/clubs/{club_id}/override`(`admin_eval.py:118`,通知 `:149-155`)。
- **kind**:`alert`(紫)。
- **現行訊息**:
  - Title:`行政分手動調整`
  - Description:`{club.name}:{body.key} → {body.score}({body.reason})`,例:`熱舞社:ad3 → 4.5(照片重複僅計一件)`(key 為評分項代碼直出,非中文名)
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `body.key` | str | `ad3`(白名單驗證) | ✓(代碼直出) |
| `body.score` | float | `4.5` | ✓ |
| `body.reason` | str(1–500) | `照片重複僅計一件` | ✓ |
| `window.year` | int | `116`(評鑑學年) | — |
| 調整後 `total` / `scores` 明細 | float / list | 通知後計得,同函式 scope 可移前取得 | — |
| 操作人 `user.name` | str | `王承辦` | — |

### H2. 行政分回到自動計算

- **端點/呼叫點**:`POST /admin/eval/clubs/{club_id}/revert`(`admin_eval.py:160`,通知 `:180-186`)。
- **kind**:`alert`(紫)。
- **現行訊息**:
  - Title:`行政分回到自動計算`
  - Description:`{club.name}:{body.key}({body.reason})`
- **可提供的資料欄位**:同 H1(無 `body.score`;回復後的自動分可從 `scores` 取)。

### H3. 表現優良加分登錄

- **端點/呼叫點**:`POST /admin/eval/clubs/{club_id}/merit`(`admin_eval.py:191`,通知 `:232-238`)。最新一筆生效,舊列註銷留痕。
- **kind**:`alert`(紫)。
- **現行訊息**:
  - Title:`表現優良加分登錄`
  - Description:`{club.name}:+{body.score}({body.reason})`,例:`熱舞社:+5(全國競賽特優)`
- **可提供的資料欄位**:`body.score`(int 0–5,✓)、`body.reason`(✓)、`window.year`、調整後總分、`user`。

## 12. 帳號與停權

### I1. 社團停權通知

- **觸發情境**:super 於逾期追蹤/停權管理停權社團(通常因器材逾期);停權期間借用申請被攔截。
- **端點/呼叫點**:`POST /admin/clubs/{club_id}/suspend`(`admin_overdue.py:85`,通知 `:111-117`)。
- **kind**:`alert`(紫)。
- **現行訊息**:
  - Title:`社團停權通知`
  - Description:`{club.name}:即日起至 {body.until} 暫停借用申請(原因:{body.reason})`,例:`熱舞社:即日起至 2026-08-31 暫停借用申請(原因:器材逾期未歸還)`
- **可提供的資料欄位**:

| 欄位 | 型別 | 範例值 | 已用 |
|------|------|--------|------|
| `body.until` | date | `2026-08-31` | ✓ |
| `body.reason` | str(1–500) | `器材逾期未歸還` | ✓ |
| 操作人 `user.name` | str | super 管理員 | — |

### I2. 社團停權解除

- **端點/呼叫點**:`DELETE /admin/clubs/{club_id}/suspend`(`admin_overdue.py:121`,通知 `:146-152`)。
- **kind**:`alert`(紫)。
- **現行訊息**:
  - Title:`社團停權解除`
  - Description:`{club.name}:即日起恢復借用申請`
- **可提供的資料欄位**:`club` 全欄位、操作人 `user`。**注意**:原 `suspended_until` / `suspend_reason` 於 commit 時已清空,模板若要顯示原停權資訊,需在程式清空前先取值(小改動)。

## 13. 模板設計的技術約束

### 13.1 Discord webhook 支援的格式(上限為 Discord 官方限制)

- `content`:純文字 ≤2000 字(**現行未使用**)。
- `embeds`:單訊息至多 10 個;每個 embed 可有 `title`(≤256)、`description`(≤4096)、`url`(標題超連結)、`color`、`timestamp`(ISO8601,右下角在地化顯示)、`fields[]`(≤25 個,name ≤256 / value ≤1024,可 `inline`)、`footer`(text ≤2048 + icon_url)、`author`(name ≤256 + url + icon_url)、`image` / `thumbnail`;**單訊息所有 embed 文字合計 ≤6000 字**。
- `username` / `avatar_url`:逐則覆寫顯示身分(現行固定為系統名+logo)。
- Components V2(`flags=1<<15` + `with_components=true`):Container(可設 `accent_color`)、Text Display(全訊息文字合計 ≤4000)、Section、Separator、Media Gallery 等;**啟用後不得再用 content/embeds**。
- 速率限制:約每 2 秒 5 則/每分鐘 30 則(逐社團廣播時注意)。

### 13.2 現行程式只用到

- 一般事件:單一 embed 的 `title` + `description` + `color` 三欄,無其他任何欄位。
- 公告:Components V2 的 Container(`accent_color`)+ 單一 Text Display。

### 13.3 套模板要改哪裡

- **共通版型**(加 fields/footer/timestamp/url 等):只改 `notify.py` 的 `discord_to()`(embed 組裝)與 `announcement_components()`(公告版型),21 處呼叫點簽名不動。
- **逐事件差異化版型**:現行呼叫點把資料先扁平化成 `title`/`description` 兩個字串才進 `notify`,若模板需要結構化欄位(社團名、金額、連結各自成 field),需把 `club_event(kind, title, description, club_webhook)` 介面改為吃結構化參數(如 dict/dataclass),並同步調整各呼叫點傳入原始欄位——本清冊各事件的「可提供的資料欄位」即是屆時可傳的原料;標註「需補查」者需在該端點多查一次 DB。
- **全域版 vs 社團版分流**(如全域補社團名、社團版省略):在 `club_event()` 內分岔即可,單點改動。
