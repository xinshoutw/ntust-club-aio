# Session Handoff(2026-07-16,第八輪:需求方全批回饋 + 後端兩階段落地)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪已完成(全部逐項 commit;決議全文見 AGENTS.md「UI/規則調整決議(2026-07-16 第八輪)」)

### 前端(需求方 2026-07-16 全批回饋,14 大項全數實作)

1. 需求方本人的 33 檔文案精簡先以其原樣分組 commit(全形標點、移除副標社團名、「最近申請」等)
2. TODO/FIXME 五處全修(login footer、姓名紅星、附件 50MB 加總+用量提示、結案照片全影像格式、退回預設文案重開不消失)
3. **confirmDialog helper**(lib/confirm.ts):全站確認彈窗點遮罩=取消;確認型 popup autoFocus 確認鈕+destroyOnHidden
4. 器材借用:先選關聯活動→區間推導可借數(availableInWindow;逾期未還視為持續佔用)
5. 全站去單號(僅稽核軌跡保留);稽核 20 筆/頁+三欄篩選;違規/維修排序過濾重做;檔案管理「文字內容」段+報修置首;權限彈窗 dirty 橘框+儲存生效+離開警告;系統設定四項(報名窗移除/固定借用日期區間/手動加開移除/TagListInput 無下拉)
6. SignupBuilder 七項(含審核制、拖曳排序、報名開始預設今天);公告系統(性質多選/ClubCascader/蓋板+TakeoverOverlay/通知/markdown popup=marked+DOMPurify);ClubSelect 改資料夾式 Cascader;三頁重設計(申請審核=待審佇列+雙欄彈窗、結案審核=完整資料+繳交確認勾選、報名管理=總表+逐人名單彈窗)

### 後端(兩階段,皆已在 dev 庫 upgrade head)

- **第一階段=第五輪 10 項待同步**(migration `b7d1f04a9c21`):activities 起訖+檢討會議欄、room slots date→weekday+開放窗+10 節+連 3 節、purpose NOT NULL、equipment activity_id 綁定+borrower/returner+可借數 API、19 場地 seed、ad7/ad8 簽到制+cap100+簽到 API、postal 不遮罩、violations 銷案期限、admin files/maintenance/audit API
- **第二階段=第八輪新需求**(migration `d2a6c9f13b58`):公告(attrs 多選/club_id/takeover_until/notify+Email HTML 模板+Discord Components V2 模板)、clubs.contact_emails、/admin/settings GET/PUT、signup_items 第八輪欄位+審核制+確認 API、/admin/accounts(一次性密碼/argon2id/audit FK SET NULL)、附件加總上限(FOR UPDATE 防競態)、影像格式放寬、大型活動逕行核定、權限鍵別名
- 實作決策細節見 `data-model.md` §3.x/§3.y 補記

### 驗證與審查(本輪)

- 前端:tsc 0 錯誤、vitest 15 passed、build 綠、oxlint 0 error
- 後端:pytest **149 passed**、ruff 全綠、alembic 可逆(downgrade/upgrade 驗證過)
- 交叉審查四輪:Fable(前端 16 項:3H/4M/9L 全修)、codex gpt-5.6-sol(前端 10 項:有效 7 項全修,3 項為需求方本人刻意調整不改)、opus(後端第二階段 5 項全修)、Fable 資安審查+bandit(0 高/中)
- 資安:bandit 3 low(dev-secret 預設值/迴圈 continue/enum 誤報);CSV 匯出已中和 Excel 公式注入

## 使用者問題的回覆(本輪已答,詳見 session 最終報告)

1. **popup 遮罩問題為何重複發生**:AntD `Modal.confirm` 預設 `maskClosable:false`,每次新增呼叫點都要手動補——已建 `confirmDialog` helper 根治,規範寫入 AGENTS.md
2. **「固定場地借用手動加開」**=原設計在預設開放月份(6 月/1 月)以外由管理員臨時開放受理的開關;已依指示移除,由「受理期間日期區間」取代
3. 檔案管理 DB 分類:採納「整個 DB 算一類=文字內容」;報修段置首

## 剩餘已知待辦

- **前端接線**(使用者宣告要一起做):全部頁面仍為 mock;後端 API 已齊,接線注意事項:公告 create body 的日期為 ISO 格式(mock 用 YYYY/MM/DD 需轉)、報名 datetime 無時區視為台北、負責人會議簽到後端為逐場登錄(前端 InputNumber 需換算)、`GET /club/equipment?activity_id=` 區間在 meta
- 權限鍵命名統一(前端 areview/asignup vs 後端 aact/areg 現以別名互通;abooking/aroom/amember 的管理端 router 未做)
- `signup_items.year`(current_year=114)與 `eval_window.year`(116)不對齊的既有隱患
- staff panel、viewer panel、首頁導覽頁(Roadmap)
- 評鑑結果頁重設計規格、Email MJML 模板(待需求方;Email/Discord 現為基礎模板函式 `notify.announcement_email_html`/`announcement_components`)

## 待需求方裁決(沿前輪+本輪新增)

1. 成員學期歸屬以 updated_at 推導;要「名單快照按學期」需加欄位
2. 郵局代理人電話仍遮罩(需求只解局號帳號);要全解請告知
3. 固定借用 10 節上限=「本單+其他審核中申請」合計的解讀
4. 大型活動類型篩選:「有大徽章者=大型活動;被否准=一般」解讀待確認(沿第七輪)
5. AdminRoomsPage 退回彈窗:因已預填你的預設文案,聚焦「確認退回」(Enter 直接送);其他退回彈窗(無預設文案)聚焦輸入框——如要統一請告知

## 環境與慣例提醒

- 本機 DB `docker compose up -d db`;dev 庫已 upgrade 至 `d2a6c9f13b58` + seed(19 場地)
- 測試打獨立 `club_aio_test` 庫;conftest 已全域靜音 Discord webhook
- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中;UI 禁 emoji
- Vite 8 只綁 IPv6(`localhost:5173`);OrbStack 佔 8000,後端一律 `127.0.0.1:8000`
- 確認彈窗一律走 `lib/confirm.ts` 的 `confirmDialog`,勿直呼 `modal.confirm`
