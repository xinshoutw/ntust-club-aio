# club-aio — 臺科大社團管理系統(All-in-One)

取代舊版社團管理系統與教室器材借用系統的新版整合系統。

- 設計文件:[docs/architecture.md](docs/architecture.md)、[docs/data-model.md](docs/data-model.md)
- 需求原型:`docs/社團管理系統_優化原型_v6.html`

## 技術棧

前端 Vite + React + TypeScript + Ant Design 6;後端 FastAPI(Python 3.14)+ SQLAlchemy 2 + PostgreSQL 18;Docker Compose 部署。

## 開發

```bash
cp .env.example .env

# 1. 資料庫
docker compose up -d db

# 2. 後端(http://127.0.0.1:8000,API docs 在 /api/docs)
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 3. 前端(http://127.0.0.1:5173,/api 代理到 127.0.0.1:8000)
cd frontend
pnpm install
pnpm dev
```

### 測試

```bash
cd backend  && uv run pytest && uv run ruff check .
cd frontend && pnpm exec tsc -b && pnpm test && pnpm run lint
```

## 正式部署(GCE 單機)

映像由 CI 產出並推到 registry,**VM 上永不 build**:

```bash
# .env 設定 ENV=prod、強密碼、BACKEND_IMAGE/WEB_IMAGE
docker compose pull
docker compose up -d --no-build   # db + backend + web(:8080),前面接既有 edge proxy
```

上線切換與 edge proxy 需要的調整見 `docs/architecture.md` §6.5 切換清單。
