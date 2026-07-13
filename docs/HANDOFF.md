# Session Handoff(2026-07-14)

> 給下一個 session 的交接快照。永久性專案知識在三層 `AGENTS.md`(OSA 根/project/club-aio)與 `docs/architecture.md`、`docs/data-model.md`、`docs/design-guide.md`;本檔只記「現在進行到哪、接下來做什麼」。過期即刪。

## 目前狀態

- **分支**:開發一律推 `dev`(remote: `git@github.com:xinshoutw/ntust-club-aio.git`);`main` 只在穩定時合併(CI 會發佈 GHCR 映像)
- **前端**:28 頁全 mock。本日完成:(1) 社團端 8 項小修+報名活動類型標記;(2) 第三、四輪 UI 的交叉檢查欠帳補跑並全數修復(16 項);(3) **社團評鑑重構**——行政分自動評分引擎(`features/eval/scoring.ts`+vitest)、資料總覽重建(自動評分+成果上傳+照片 SHA-256 去重+五獎卡片)、獎項詳細頁(逐評分細項上傳槽位+圖片/PDF/docx 即時預覽)、管理員行政分審核頁(手動調整/回自動)、大型活動管理員認可(`largeApproved`);(4) **活動結案獨立頁**(調查欄位依需求方改版:實際社員/非社員人數與實際時間地點預填申請值、除影片全必填、心得段落輸入;草稿捨棄照片;送出餵 ad2–ad4)、**活動詳情預覽 popup**(縮圖放大、PDF 預覽+下載、右上三點下載選單、無關閉鈕)與草稿/退回件編輯路由。決議細節見 club-aio/AGENTS.md「社團評鑑重構決議」
- **後端**:只有骨架(FastAPI + health + async Alembic,無 model 無 migration)
- 驗證:`cd frontend && pnpm build && pnpm test && pnpm exec oxlint src`(唯一已知警告:auth.tsx fast-refresh,可忽略);後端 `cd backend && uv run pytest`
- 評鑑需求原始文件在 `docs/社團評鑑/`(PDF 已入版控;讀取用 opendataloader_pdf 批次轉 markdown)

## 接下來(依序)

1. **評鑑結果頁(/eval/result)重設計** — 等需求方規格;資料總覽已依 2026-07-14 規格重建,若規格有增補一併調整
2. **後端開發** — 落地 data-model.md(38 表)、Alembic migration、auth(argon2 + DB session cookie)、逐頁把 mock 換成 TanStack Query;行政分後端實作直接照 `frontend/src/features/eval/scoring.ts` 的規則(該檔即可執行規格)

## 待需求方確認

- 郵局帳戶異動的事由互斥組合與條件欄位(現為先行判斷,見 AGENTS 第三輪決議)
- 評鑑加減分:違規扣分目前只計**未銷案**紀錄(銷案後不扣),是否正確
- 最佳活動獎配分兩份文件不一致(評分標準 PDF:執行 35%/經費 5%;實施計畫:45%/15%),暫依實施計畫
- 評鑑採計視窗目前 mock 為 116 年競賽(2026/02/01–2027/01/31,=114-2+115-1 兩學期),正式規則進 system_settings

## 工作慣例提醒

- Commit 英文、一行為一 commit、禁元描述;文件/回覆繁中
- 每完成一個開發段落用非 Fable 模型交叉檢查(Agent model=opus 或 `codex e -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' --dangerously-bypass-approvals-and-sandbox "..."`);本日已跑兩輪(codex 覆蓋三、四輪 UI;opus 覆蓋評鑑重構段)
- UI:禁 emoji(AntD icon)、禁 monospace 字體(用 `.num` tabular-nums)、文字精簡
- 開發環境:Vite 8 只綁 IPv6(`localhost:5173`,勿用 127.0.0.1);本機 OrbStack 佔 8000 埠,後端一律走 `127.0.0.1:8000`
- 評鑑 mock 資料相互串接:活動(activities/mock)、成員(members/mock)、報名(signup/mock,`kind` 餵 ad7/ad8)、違規(violations/mock)、網頁連結(club-settings/mock)→ `eval/store.ts` 彙整;動 mock 時注意評分展示連動
