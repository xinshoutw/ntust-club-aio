# Session Handoff(2026-07-13)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 目前狀態

- **分支**:開發一律推 `dev`(remote: `git@github.com:xinshoutw/ntust-club-aio.git`);`main` 只在穩定時合併(CI 會發佈 GHCR 映像)
- **前端**:26 頁全部實作完,經四輪 UI 調整(決議都在 club-aio/AGENTS.md 的「UI 調整決議」三節);資料全 mock、動作 toast 提示,`src/api/client.ts` 是之後接 API 的信封解包層
- **後端**:只有骨架(FastAPI + health + async Alembic,無 model 無 migration)
- 驗證:`cd frontend && pnpm build && pnpm exec oxlint src`(唯一已知警告:auth.tsx fast-refresh,可忽略);後端 `cd backend && uv run pytest`

## 接下來(依序)

1. **社團評鑑的判斷邏輯與架構重構** — 需求方會給規格;`Activity.isLarge` 已加(大型活動行政分加權),`data-model.md` 的 activities 需補 `is_large`、行政分規則一併定案
2. **資料總覽(/eval)與評鑑結果(/eval/result)頁重設計** — 等需求方規格,現版是佔位實作
3. **後端開發** — 落地 data-model.md(38 表)、Alembic migration、auth(argon2 + DB session cookie)、逐頁把 mock 換成 TanStack Query

## 待需求方確認

- 郵局帳戶異動的事由互斥組合與條件欄位(現為先行判斷,見 AGENTS 第三輪決議)
- 活動類型改「社課/活動/會議」後,評鑑「大型活動 ×3 加權」規則與承辦重新對齊

## 工作慣例提醒

- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中
- 每完成一個開發段落用非 Fable 模型交叉檢查(Agent model=opus 或 `codex e -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' --dangerously-bypass-approvals-and-sandbox "..."`);**目前有一筆欠帳:第三、四輪 UI 調整尚未交叉檢查,迭代收斂後補跑**
- UI:禁 emoji(AntD icon)、禁 monospace 字體(用 `.num` tabular-nums)、文字精簡
- 開發環境:Vite 8 只綁 IPv6(`localhost:5173`,勿用 127.0.0.1);本機 OrbStack 佔 8000 埠,後端一律走 `127.0.0.1:8000`
