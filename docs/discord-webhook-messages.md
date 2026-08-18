# Discord Webhook 訊息清冊

供需求方設計訊息模板用;內容對照 `backend/app/services/notify.py` 與全部呼叫點。設計定稿後回頭改 `notify.py`。

## 1. 投遞機制

**兩條路徑**,內容完全相同:

| 路徑 | 設定位置 |
|------|----------|
| 全域 webhook | `.env` `DISCORD_WEBHOOK_URL`(學務處頻道,**每個事件必推**;空值=停用並僅記 log) |
| 社團 webhook | `clubs.discord_webhook_url`(社團於管理項目自設,有設才另推一份) |

路由函式:`club_event()` 先推全域再推社團,一般事件全走這條;`announcement_broadcast()` 為公告專用,推全域 + 逐一推目標社團並寄 Email。

**身分**:`_with_identity()` 為每個 payload 補 `username="臺科大社團管理系統"`、`avatar_url=SITE_URL/logo.png`(開發站無法解析時 Discord 略過頭貼)。

**投遞**:一律在 `db.commit()` 之後以 `BackgroundTasks` fire-and-forget,回應不被通知阻塞。`httpx` POST(timeout 5s),**暫時性失敗在記憶體裡重試**(最多 3 次;429 照 `Retry-After` 等、5xx 與連線失敗退避 1s/3s,4xx 一次就放棄),**不落地佇列表**(decisions.md ISS-65)—— 程序重啟仍會遺失。最終失敗只記 log,絕不影響業務交易。Email 同一套重試,但**永久錯誤不重試**(收件人不存在、寄件人被拒、認證失敗),結果照樣寫 `email_logs`。公告廣播對社團 webhook 與 Email 走上限 5 的並發(逐筆序列 × 60+ 社 × 重試等待會拖成小時級)。

**格式**:一般事件用單一 embed(`title` + `description` + `color`,無 fields/footer/timestamp);公告用 Components V2(`flags=1<<15`,Container + Text Display,需帶 `with_components=true`)。

**顏色**(kind → color):

| kind | 色碼 | 語意 |
|------|------|------|
| `announce` | `0x3B82F6` 藍 | 公告/一般通知(未知 kind 的 fallback) |
| `submit` | `0xF59E0B` 橙 | 送審/新申請 |
| `approve` | `0x22C55E` 綠 | 通過/完成 |
| `reject` | `0xEF4444` 紅 | 退回/拒絕 |
| `alert` | `0x8B5CF6` 紫 | 系統事件(解鎖、逾期提醒、停權、評鑑調整) |

**長度**:程式自截 title 256、description 2000(Discord 上限 4096)、公告 Text Display 3800(上限 4000)。活動名、社團名、退回原因(≤500 字)、公告內文皆為使用者輸入,模板要容忍被截斷。Discord 速率限制約每 2 秒 5 則,公告逐社團推送(60+ 社)可能觸頂;429 會照 `Retry-After` 退避重試(上限 30 秒 × 3 次)。

## 2. 事件與現行文案

48 個事件(7 個依狀態有兩種文案)。目的地未註明者=全域必推 + 該社團有設 webhook 才推。

**公告**

- **A1 公告發布** `POST /admin/announcements`(勾「通知」時)· Components V2 藍 · 全域 + **全部目標社團** + Email
  `**{title}**\n\n{content}\n\n-# {date}`(title+content 合併截 3800;content 為 markdown 原文)
  Email:subject `【臺科大社團管理系統】{title}`,HTML 模板 `announcement_email_html()`,寄給各目標社團 `contact_emails` 前 3 組

**活動申請與審核**

- **B1 活動申請送審** `POST /club/activities/{id}/submit` · submit
  `活動申請送審` / `{club.name}:{activity.name}({date} @ {location})`
- **B2 活動申請核准** `POST /admin/activities/{id}/approve` · 終關 approve、中間關 submit
  `活動申請已核准` 或 `活動申請通過關卡` / `{activity.name}(關卡:{stage})` —— stage 經 `_STAGE_LABEL` 轉為 承辦人/組長/學務長
- **B3 活動申請退回** `POST /admin/activities/{id}/reject` · reject
  `活動申請退回` / `{activity.name}:{body.reason}`

**活動結案**

- **C1 結案送審** `POST /club/activities/{id}/close` · submit
  `活動結案送審` / `{club.name}:{activity.name}({date})`
- **C2 結案已核准** `POST /admin/activities/{id}/close-approve` · approve
  `活動結案已核准` / `{activity.name}`(無社團名)
- **C3 結案退回** `POST /admin/activities/{id}/close-reject` · reject
  `活動結案退回` / `{activity.name}:{body.reason}`
- **C4 結案鎖定已解除** `POST /admin/activities/{id}/unlock` · alert
  `結案鎖定已解除` / `{activity.name}`

**空間與器材借用**

- **D1 固定借用申請** `POST /club/room-bookings` · submit
  `固定場地借用申請` / `{user.name}:{venue.name}({n} 個每週時段)`
- **D2 臨時借用申請** `POST /club/venue-bookings` · submit
  `臨時場地借用申請` / `{user.name}:{venue.name}({date} 時段 {periods})`
- **D3 器材借用申請** `POST /club/equipment-loans` · submit
  `器材借用申請` / `{user.name}:{equipment.name} ×{qty}({start}~{end},活動:{activity.name})`
- **D4 臨時借用已核准** `POST /admin/venue-bookings/{id}/approve` · approve
  `臨時場地借用已核准` / `{venue.name}({date} 時段 {periods})`(無社團名)
- **D5 臨時借用退回** `POST /admin/venue-bookings/{id}/reject` · reject
  `臨時場地借用退回` / `{venue.name}({date}):{body.reason}`(無社團名、無時段)
- **D6 器材借用已核准** `POST /admin/equipment-loans/{id}/approve` · approve
  `器材借用已核准` / `{equipment.name} ×{qty}({start}~{end})`(無社團名)
- **D7 器材借用退回** `POST /admin/equipment-loans/{id}/reject` · reject
  `器材借用退回` / `{equipment.name} ×{qty}:{body.reason}`(無社團名、無區間)
- **D8 固定借用已核准** `POST /admin/room-bookings/{id}/approve` · approve
  `固定場地借用已核准` / `{venue.name}({n} 個每週時段)`(無社團名、無具體時段)
- **D9 固定借用退回** `POST /admin/room-bookings/{id}/reject` · reject
  `固定場地借用退回` / `{venue.name}:{body.reason}`
- **D10 器材歸還提醒** `POST /admin/equipment-loans/{id}/remind`(super)或 `POST /staff/equipment-loans/{id}/remind`(工讀生),兩者共用 `services/loan_remind` · alert · 另寄 Email
  `器材歸還提醒` / `{club.name}:{equipment.name} ×{qty}(借用區間 {start}~{end},歸還期限 {deadline}),請儘速辦理歸還點交。`
- **D11 固定借用已撤銷** `POST /admin/room-bookings/{id}/revoke` · reject
  `固定場地借用已撤銷` / `{venue.name}({n} 個每週時段):{body.reason}`
- **D12 臨時借用已撤銷** `POST /admin/venue-bookings/{id}/revoke` · reject
  `臨時場地借用已撤銷` / `{venue.name}({date} 時段 {periods}):{body.reason}`
- **D13 器材借用已撤銷** `POST /admin/equipment-loans/{id}/revoke` · reject
  `器材借用已撤銷` / `{equipment.name} ×{qty}({start}~{end}):{body.reason}`

D4–D7、D12、D13 經 `admin_bookings._notify_club`:`club_id` 為 NULL(行政手動借用)或社團不存在時直接跳過不通知。

**線上申請**

- **E1 幹部證明申請** `POST /club/officer-certificates` · submit
  `幹部證明申請` / `{user.name}:{term} {position}`
- **E2 郵局帳戶異動申請** `POST /club/postal-changes` · submit
  `郵局帳戶異動申請` / `{user.name}:{reasons 以、連接}`
- **E3 空間報修申請** `POST /club/maintenance` · submit
  `空間報修申請` / `{user.name}:{location}({items})`
- **E4 幹部證明狀態更新** `POST /admin/officer-certificates/{id}/status` · 完成 approve、處理中 alert
  `幹部證明已完成,請洽學務處領取` 或 `幹部證明處理中` / `{club.name}:{term} {position} {applicant_name}`
- **E5 郵局異動狀態更新** `POST /admin/postal-changes/{id}/status` · 完成 approve、處理中 alert
  `郵局帳戶異動已完成,請洽學務處` 或 `郵局帳戶異動處理中` / `{club.name}:{reasons}`
- **E6 空間報修狀態更新** `POST /admin/maintenance/{id}/status` · 完成 approve、處理中 alert
  `空間報修已完成` 或 `空間報修處理中` / `{club.name}:{location}({items})`

**線上報名**

- **F1 線上報名送出** `POST /club/signup-items/{id}/signup` · submit
  `線上報名` / `{club.name}:{item.name}({n} 人)` —— 審核制時尾綴 `(待確認)`
- **F2 報名已確認** `PUT /admin/signup-items/{id}/registrations/{club_id}/confirm` · approve
  `報名已確認` / `{club.name}:{item.name}`

**違規**

- **G0 違規勸導開立** `POST /staff/violations` · alert
  `違規勸導開立` / `{club.name}:{occurred_on} {location}({items}),請於 {期限} 前完成銷案。`
- **G1 違規勸導已銷案** `POST /admin/violations/{id}/resolve` · approve
  `違規勸導已銷案` / `{club.name}:{occurred_on} {location}`

**評鑑**

- **H1 行政分手動調整** `POST /admin/eval/clubs/{id}/override` · alert
  `行政分手動調整` / `{club.name}:{key} → {score}({reason})`
- **H2 行政分回到自動計算** `POST /admin/eval/clubs/{id}/revert` · alert
  `行政分回到自動計算` / `{club.name}:{key}({reason})`
- **H3 表現優良加分登錄** `POST /admin/eval/clubs/{id}/merit` · alert
  `表現優良加分登錄` / `{club.name}:+{score}({reason})`

**器材點交(工讀生端)**

- **J1 器材已借出** `POST /staff/equipment-loans/{id}/checkout` · alert
  `器材已借出` / `{equipment.name} ×{qty}(借用人 {borrower_name},借用區間 {start}~{end})`
- **J2 器材已歸還** `POST /staff/equipment-loans/{id}/checkin` · approve
  `器材已歸還` / `{equipment.name} ×{qty}(歸還人 {returner_name})`

行政手動借用只推全域(`club_id` NULL,沒有社團可推):見 K4。

**帳號與停權**

- **I1 社團停權** `POST /admin/clubs/{id}/suspend` · alert
  `社團停權通知` / `{club.name}:即日起至 {until} 暫停借用申請(原因:{reason})`
- **I2 停權解除** `DELETE /admin/clubs/{id}/suspend` · alert
  `社團停權解除` / `{club.name}:即日起恢復借用申請`

**取消與刪除(GAP-18,2026-08-20 實作)**

- **K1 固定借用社團自行取消** `POST /club/room-bookings/{id}/cancel` · reject
  `固定場地借用已取消` / `{user.name}:{venue.name}({n} 個每週時段)`
- **K2 臨時借用社團自行取消** `POST /club/venue-bookings/{id}/cancel` · reject
  `臨時場地借用已取消` / `{user.name}:{venue.name}({date} 時段 {periods})`
- **K3 器材借用社團自行取消** `POST /club/equipment-loans/{id}/cancel` · reject
  `器材借用已取消` / `{user.name}:{equipment.name} ×{qty}({start}~{end})`
- **K4 行政手動借用建立** `POST /admin/bookings/manual-{venue,equipment}` · alert · **僅推全域**(無社團)
  `行政手動借用建立` / `{user.name}:{venue 或 equipment 名}(時間)`
- **K5 報名簽到登錄** `PUT /admin/signup-items/{id}/attendance` · 登錄 approve、取消 alert
  `報名簽到已登錄` 或 `報名簽到已取消` / `{club.name}:{item.name}({session.name})`
  —— **只在真的翻面時推**(同值再送一次不是事件);非場次制的預設場次名就是活動名,那時不重複印
- **K6 公告蓋板開啟** `PATCH /admin/announcements/{id}`(`takeover_until` 由 null 轉為日期)· announce · 僅推全域
  `公告已設為蓋板` / `{title}`
- **K7 公告蓋板關閉** 同上(轉回 null)· announce · 僅推全域
  `公告已取消蓋板` / `{title}`
- **K8 公告刪除** `DELETE /admin/announcements/{id}` · alert · 僅推全域
  `公告已刪除` / `{title}`
- **K9 活動草稿刪除** `DELETE /club/activities/{id}`(草稿狀態)· alert
  `活動草稿已刪除` / `{club.name}:{activity.name}`
- **K10 行政補登報名** `POST /admin/signup-items/{id}/registrations` · announce
  `學務處已為貴社補登報名` / `{club.name}:{item.name}(現場到場,參加人名單從缺)`
  —— 社團會在「我的報名」看到一筆自己沒送過的紀錄,不說一聲會像是名單不見了
- **K11 撤除補登報名** `DELETE /admin/signup-items/{id}/registrations/{club_id}` · alert
  `學務處已撤除貴社的補登報名` / `{club.name}:{item.name}` —— K10 的反面,名單這次真的不見了
- **K12 報名場次刪除** `DELETE /admin/signup-items/{id}/sessions/{sid}` · alert · 僅推全域
  `報名場次已刪除` / `{item.name}:{session.name}(連帶清掉 N 筆簽到)`
  —— 該場次所有社團的簽到隨 FK CASCADE 一起消失,而簽到是行政分 ad7 的唯一資料源
- **K4b 行政手動借用撤銷** `POST /admin/{venue-bookings,equipment-loans}/{id}/revoke` · reject · 無社團時僅推全域
  文案同一般撤銷 —— 手動借用沒有社團可推,但場況圖少一格的理由與 K4 一樣成立

蓋板只在**切換**時推:同值再送一次不算事件,否則承辦每次存檔都會多推一則。
逐事件的呼叫點由 `tests/test_gap18_notifications.py` 釘住。

**「活動草稿儲存」刻意不發**:草稿每存一次就推一則,同一份活動在填寫過程中會產生數十則,
會把承辦頻道的其他事件淹掉。若之後要發,建議改為「首次建立草稿時推一則」而非每次儲存。

## 3. 模板可取用的資料

每個呼叫點 scope 內都有該單據的完整資料列(欄位見 `data-model.md`)、`club`(含 name/kind/attribute/contact_emails)與操作者 `user`(name/role)。以下情形需在該端點多查一次 DB:

| 事件 | 需補查 |
|---|---|
| B1 | 附件清單與數量(`svc.activity_files`) |
| C2/C3 | 整份結案資料(`db.get(ActivityReport, id)`) |
| D4/D5/D6/D7/D10 | 關聯活動名(`activity_id` → Activity) |
| F2 | 報名人數與名單(`signup.entries`) |
| G1 | 開單工讀生(`filler`) |
| I2 | 原停權資訊 —— `suspended_until`/`suspend_reason` 於 commit 時已清空,要顯示須在清空前先取值 |

**絕不入訊息的敏感欄位**:郵局戶名與局號帳號、各式聯絡電話。

**可組出的頁面連結**(`SITE_URL` + 前端路由;現行訊息完全未附連結):

| 模組 | 社團端 | 行政端 |
|------|--------|--------|
| 活動 | `/activities`、`/activities/:id/edit`、`/activities/close`(支援 `?id=`) | `/admin/review`、`/admin/close-review` |
| 借用 | `/bookings`、`/bookings/fixed`、`/bookings/venue`、`/bookings/equipment` | `/admin/bookings`、`/admin/rooms`、`/admin/overdue` |
| 線上申請 | `/maintenance`、`/postal`、`/certificates` | `/admin/applications`、`/admin/maintenance` |
| 線上報名 | `/signup`、`/signup/:id` | `/admin/signups` |
| 違規 | `/violations` | `/admin/violations` |
| 評鑑 | `/eval` | `/admin/eval` |
| 公告 | `/`(總覽) | `/admin/announcements` |

除上列外前端無 per-id 詳情路由(詳情皆為列表內彈窗),深連結大多只能到列表頁。

## 4. 套模板時要改哪裡

Discord webhook 可用而現行未用的:embed 的 `url`(標題超連結)、`timestamp`、`fields[]`(≤25,name ≤256 / value ≤1024,可 inline)、`footer`、`author`、`image`/`thumbnail`(單訊息所有 embed 文字合計 ≤6000);Components V2 的 Section、Separator、Media Gallery(啟用後不得再用 content/embeds)。

- **共通版型**(加 fields/footer/timestamp/url):只改 `notify.py` 的 `discord_to()` 與 `announcement_components()`,21 處呼叫點簽名不動
- **逐事件差異化版型**:現行呼叫點把資料扁平化成 title/description 兩個字串才進 `notify`。模板若要結構化欄位(社團名、金額、連結各自成 field),須把 `club_event(kind, title, description, club_webhook)` 改吃結構化參數,並同步調整各呼叫點傳入原始欄位
- **全域版與社團版分流**(如全域補社團名、社團版省略):在 `club_event()` 內分岔,單點改動
