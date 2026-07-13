# Session Handoff(2026-07-14 晚)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 重要:本輪為自主工作段

**使用者正在休息,不會即時回覆。**所有需要的決策都已拍板(見 AGENTS.md「2026-07-14 需求方拍板」與下方目標);不要停下來等確認。真的拿不準的,記進本檔「待裁決」小節後**繼續往下做**,使用者回來後裁決。

## 目前狀態

- **分支**:開發推 `dev`(remote: `git@github.com:xinshoutw/ntust-club-aio.git`);`main` 只在穩定時合併(CI 發佈 GHCR)
- **社團端前端已收斂**(全 mock、六輪交叉審查、需求方走查通過);行政端 14 頁基本款+評鑑行政分審核頁;細節與所有 UI 決議在 club-aio/AGENTS.md
- **後端僅骨架**(FastAPI + health + async Alembic,無 model 無 migration)
- **data-model.md 已完成回寫**(2026-07-14):結案調查新欄位(member/non_member、actual 起訖與地點、除影片全必填)、`activities.close_draft` 與 `signup_drafts`(草稿進 DB、跨裝置續填、照片不隨草稿)、檔案驗證(JPG/PNG 魔術位元組+10MB+sha256)、rubric 逐年版本化——**它就是後端規格,照做**
- `.env` 已就緒(從 .env.example 複製,含 `DISCORD_WEBHOOK_URL` 測試值;**絕不入版控**)
- 驗證:`cd frontend && pnpm build && pnpm test && pnpm exec oxlint src`(唯一已知警告 auth.tsx fast-refresh);`cd backend && uv run pytest`;本機 DB:`docker compose up -d db`

## 本輪目標(依序)

### 1. 後端架構 + 完整資安(主要工作,推 dev)

- **Models + Migration**:38 表 SQLAlchemy 2(async)照 data-model.md 落地,Alembic 初始 migration
- **Auth**(architecture.md 已定):argon2id、DB session cookie(**7 天滑動效期、允許多裝置並行**)、密碼 **≥10 碼含大小寫+數字+特殊符號、3 代不重用、連錯 5 次鎖 15 分**、首登強制改密;行政建帳號;SSO 僅留 `auth_provider` 欄位
- **資安整備**:CSRF(cookie session 必配)、rate limiting、security headers、Pydantic 輸入驗證、檔案上傳後端重驗(魔術位元組/大小/sha256 去重/UUID 路徑不可列舉)、role+permissions 授權(club 只能取自己資料)、audit_logs 高風險操作全記、錯誤回應不洩漏內部資訊
- **API 慣例**:信封格式對齊 `frontend/src/api/client.ts`;自訂並**記錄**分頁/排序/錯誤碼慣例(寫進 architecture.md)
- **行政分**:移植 `frontend/src/features/eval/scoring.ts`(該檔即可執行規格,連測試一起移植);eval_adjustments 蓋過自動值
- **通知**:Discord webhook(公告/通知/審核/通過/拒絕等**全部事件**),讀 `.env` `DISCORD_WEBHOOK_URL`,**可實際發送測試**(現值為測試群組);Email aiosmtplib+.env,無憑證降級 log-only(模板之後套)
- **PDF 動態生成**:成果報告/心得下載端點,模板= `docs/模板_社團活動成果報告表.docx`、`docs/模板_社團活動學習心得.docx`(docx 填值轉 PDF;版型可調整)
- **範圍**:社團端核心 API 全部完成並 pytest 覆蓋(auth/成員含 CSV/活動申請與結案/報名含草稿/三種借用/三種申請/違規/評鑑計算與五獎上傳/公告);管理端只做已定案流程(活動三關/單關審核、結案審核、行政分調整);**前端不接線**(使用者回來後逐頁換 TanStack Query)
- 舊系統 `../../legacy/` 僅供功能對照,架構絕不參考

### 2. 有餘力時:UI 打磨(開獨立分支 `ui-polish`,勿進 dev)

- 社團端**冗餘說明文字精簡**(逐頁掃);使用者回來後逐項裁決(同意/不同意/再修)
- 依社團端既有風格調整**管理員端**:捨棄過多不實用的按鈕、改整列點擊進入、預覽彈窗化、更人性化的 UI/UX(參考社團端活動列表/詳情 popup 的互動水準)

### 3. 交叉檢查慣例(本輪起調整)

- **優先 Agent 工具 model=opus(claude-opus-4-8[1m]),codex 為輔,比例約 4:1**(codex 訂閱額度有限)
- codex 直呼必加 `</dev/null`(否則等 stdin EOF 永久卡死)

## 待裁決(使用者回來看)

- (執行中若有拿不準的決策,記在這裡)

## 待需求方提供

- Email 模板;評鑑結果頁(/eval/result)重設計規格

## 環境與慣例提醒

- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中;UI 禁 emoji、禁 monospace(`.num`)
- Vite 8 只綁 IPv6(`localhost:5173`);OrbStack 佔 8000,後端一律 `127.0.0.1:8000`
- 全站寬度由 shell 統一(頁面不得自設 maxWidth);評鑑 mock 相互串接見 `eval/store.ts`
- Python 3.14 + uv;版本策略=最新穩定
