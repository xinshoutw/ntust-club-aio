# Session Handoff(2026-07-14)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 目前狀態

- **分支**:開發一律推 `dev`(remote: `git@github.com:xinshoutw/ntust-club-aio.git`);`main` 只在穩定時合併(CI 會發佈 GHCR 映像)
- **社團端前端已收斂**(需求方走查通過,全 mock)。本日大項——**社團評鑑重構**:`features/eval/scoring.ts` 行政分引擎(ad1–ad8+加減分,vitest 覆蓋)、資料總覽=唯讀分數字卡(點卡跳轉來源頁)、五獎項上傳頁(逐評分細項槽位+圖/PDF/docx 預覽)、照片 SHA-256 跨活動去重;**活動結案**:側欄頁 `/activities/close`(資格=已核准且活動已結束 `utils.ts canClose`;未選活動時列出可結案清單;調查欄位預填申請值;心得 ≥3;草稿捨棄照片);**活動詳情 popup**:雙欄(左資料/經費/照片/檔案,右結案全文+心得逐則)、實際值取代預計值(琥珀色+hover 顯預計)、右上省略號下載選單(照片 zip);**全站寬度統一 1200**(shell 約束,頁面不得自設);借用色格圖「可借/審核中」點擊帶入申請;審核文字統一「申請待審核/結案待審核」。**決議細節全部在 club-aio/AGENTS.md**
- **行政端**:14 頁基本款(mock);評鑑「行政分審核」頁(/admin/eval)已建(逐項手動調整/回自動、表現優良加分);活動審核含大型活動認可與經費逐項核定
- **後端**:骨架(FastAPI + health + async Alembic,無 model 無 migration)
- 驗證:`cd frontend && pnpm build && pnpm test && pnpm exec oxlint src`(唯一已知警告:auth.tsx fast-refresh);後端 `cd backend && uv run pytest`
- 交叉檢查:累計六輪(見 AGENTS.md 前端現況),第六輪(codex,結案以降段落)發現已依置信度評估處理
- 評鑑需求原始文件在 `docs/社團評鑑/`(PDF 已入版控;讀取用 opendataloader_pdf 批次轉 markdown)

## 接下來(依序)

1. **管理員面板**——行政端全面走查與補齊:
   - **結案審核(/admin/close-review)**:接結案資料檢視(popup 同社團端雙欄呈現)+「照片/成果/心得繳交確認」勾選(原型:未繳交項目以 0 分計,影響 ad2–ad4)
   - **報名出席登錄**:負責人會議場次/幹訓出席(session_attendance),餵評鑑 ad7/ad8(目前 mock 以報名紀錄暫代)
   - AGENTS 行政端清單中尚未實作的頁面:分組與評審指派、競賽資料完成度、社團活動統計、待審申請彙整;super 專屬:教室/器材主檔與手動借用、競賽成績總表、逾期停權管理細節
   - 既有 14 頁逐頁走查(多為第一版基本款,需對齊本日社團端的互動水準)
2. **後端**——落地 data-model.md(38 表)、Alembic migration、auth(argon2 + DB session cookie)、逐頁把 mock 換 TanStack Query;行政分後端實作直接照 `frontend/src/features/eval/scoring.ts`(該檔即可執行規格)
3. **評鑑結果頁(/eval/result)重設計**——等需求方規格

## 待需求方確認/提供

- **成果報告與心得 PDF 模板**(將改為下載時動態生成;現為 mock 空白 PDF,入口在活動詳情 popup 的下載選單)
- 郵局帳戶異動的事由互斥組合與條件欄位(先行判斷,見 AGENTS 第三輪決議)
- 評鑑加減分:違規扣分只計**未銷案**紀錄,是否正確
- 最佳活動獎配分兩文件不一致(評分標準 PDF vs 實施計畫,暫依實施計畫)
- 評鑑採計視窗(mock=116 年競賽 2026/02/01–2027/01/31=114-2+115-1),正式規則進 system_settings

## 工作慣例提醒

- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中;UI 禁 emoji(AntD icon)、禁 monospace(`.num` tabular-nums)、文字精簡
- 每完成一個開發段落用非 Fable 模型交叉檢查:Agent model=opus 或 `codex e -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' --dangerously-bypass-approvals-and-sandbox "..." </dev/null`;**codex 直呼必加 `</dev/null`**(否則等 stdin EOF 永久卡住)
- 開發環境:Vite 8 只綁 IPv6(`localhost:5173`,勿用 127.0.0.1);本機 OrbStack 佔 8000 埠,後端一律走 `127.0.0.1:8000`
- 全站寬度由 shell 統一(`shell.css .shell-main > *`),頁面不得自設 maxWidth
- 評鑑 mock 相互串接:活動/成員/報名(kind)/違規/網頁連結 → `eval/store.ts` 彙整;動 mock 注意評分展示連動
