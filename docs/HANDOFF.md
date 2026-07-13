# Session Handoff(2026-07-14 深夜,自主工作段進行中)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 本輪(自主段)已完成 — 全部推上 dev

**後端從骨架到社團端全功能 + 管理端已定案流程,約 30 個 commit:**

1. **Models + Migration**:44 表 SQLAlchemy 2 async 照 data-model.md 落地;Alembic 初始 migration(enum 為 VARCHAR+CHECK,create_constraint 明給);政策補充欄位已回寫 data-model.md(users.failed_login_attempts/locked_until、sessions.csrf_token、clubs.discord_webhook_url、postal reasons 複選、eval_adjustments.revoked_at)
2. **Auth/資安**:argon2id(時間等化+自動 rehash)、DB session cookie 7 天滑動多裝置、密碼政策全套(≥10 碼四類、3 代=現行+前2、連錯 5 次鎖 15 分原子計數、首登強制改密且改密撤銷他裝置)、CSRF double-submit 綁 session 列、登入限流只計失敗(NAT 友善)、security headers(純 ASGI)、audit_logs 全記、錯誤不洩漏(500 只回通用訊息)、prod 關 docs
3. **API 慣例**:信封+meta.code 錯誤碼表、分頁(page/page_size≤100)、排序白名單(?sort=-field)——已記入 architecture.md §4.1;client.ts 自動帶 X-CSRF-Token
4. **行政分引擎**:scoring.ts 逐案移植(tests 對齊);evaluation service 從來源表即時彙算 ad1–ad8+調整
5. **檔案服務**:副檔名×魔術位元組、串流+邊算 sha256、各類型上限、{module}/{Y}/{M}/{uuid}、同社跨活動照片去重、下載權限矩陣、歸檔 410
6. **通知**:Discord webhook 全事件(全域 .env + 社團自設 webhook 分流);**實測成功(HTTP 204,經 curl;本機防火牆擋 Python 對外 443,見下)**;Email log-only 降級寫 email_logs
7. **社團端 API 全數完成**(pytest 85 個全綠):profile(含 webhook 驗證)/成員含 CSV 匯入/活動申請+結案(close_draft 跨裝置、逾期鎖定推導、照片去重、附件)/三種借用(色格圖、器材可借數推導、逾期=隔天上班日 10:30 含假日)/三種申請(幹部證明自動帶姓名、郵局互斥+遮罩、報修佐證)/違規查詢/公告分眾/報名(自訂欄位驗證、草稿 DB、一經報名不得更改)/評鑑(overview 自動分+調整蓋過、五獎上傳進度)
8. **管理端已定案流程**:活動三關(有補助)/單關(無補助)、第一關核定經費+大型認可、退回必填原因、結案單關、解鎖;行政分逐項調整/回自動(註銷留痕)/表現優良——全走 approval_records+audit+Discord
9. **PDF**:成果報告表/學習心得依 docx 模板版型於下載時生成;**內嵌 Noto Sans TC**(CID 字型檢視器不渲染,已實測渲染正確)
10. **CI**:dev push 跑測試 + postgres service;`backend/scripts/seed.py` 種五獎項+super 管理員

驗證:`cd backend && uv run pytest`(85 passed)、`uv run ruff check .`;前端 `pnpm build/test` 不受影響。

## 進行中/接下來

- **交叉檢查**:第一輪 opus(models+auth)已完成並修畢(信任代理、enum CHECK、時間等化、原子計數、限流只計失敗、prod docs、純 ASGI headers);第二輪 opus(社團端 API)與 codex(管理端+PDF)審查**進行中,回報後逐項修正並分 commit**
- **ui-polish 分支**(勿進 dev):社團端文字精簡+管理員端人性化,等使用者逐項裁決

## 待裁決(使用者回來看)

1. **成員的學期歸屬**:以 `updated_at` 落在學期區間推導(成員列表學期篩選與 ad5 名單人數同源)。若要「名單快照按學期」語意需加欄位
2. **eval_settings 預設語意**:無設定列=上傳開放;有列才看 unlocked。若應預設鎖住請講
3. **成果報告表「社課講師」欄**:模型無講師欄位,現以申請的工作人員(staff_text)帶入;PDF 版型加了「課程/活動名稱」列(模板沒有,為辨識性加的)
4. **行政分審核頁權限鍵**:定為 `aeval`
5. **ad7/ad8 判定**:ad7=該評鑑年度所有負責人會議場次皆出席(且至少一場)才給 5 分;ad8=該年度有幹訓報名即給 5 分(未檢核出席)。與需求「全程參與」的對應請確認
6. **登入限流**:每 IP 每 5 分鐘 10 次「失敗」;成功登入不計(校園 NAT)
7. 第一輪審查的低風險項已接受不修:改密不輪替 session id(僅撤他裝置)、Session.ip 讀回型別註記

## 待需求方提供

- Email 模板;評鑑結果頁(/eval/result)重設計規格

## 環境與慣例提醒

- **本機防火牆擋非 curl 程序對外 443**(Python/httpx 連 discord.com 逾時、curl 通)。Discord 實測用「服務產生 payload + curl 發送」完成;正式 VM 無此問題,程式碼路徑已有單元測試
- 本機 DB `docker compose up -d db`;dev DB 已 upgrade head + seed(super/Bootstrap!2026,首登需改密)
- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中;UI 禁 emoji
- Vite 8 只綁 IPv6(`localhost:5173`);OrbStack 佔 8000,後端一律 `127.0.0.1:8000`
- Python 3.14 + uv;測試打獨立 `club_aio_test` 庫(conftest 於 import app 前設 env)
