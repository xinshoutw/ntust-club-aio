FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# 先裝相依(層快取),再放程式碼
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

EXPOSE 8000

# 啟動時自動跑 migration(單 instance 無競態)。
# 信任代理清單由環境變數 FORWARDED_ALLOW_IPS 提供(compose 設 compose 子網,
# 部署時另加 edge VM 內網 IP);絕不可用 '*'——XFF 最左值是客戶端可控的,
# 全信會讓登入限流被繞過、稽核 IP 被投毒。未設定時 uvicorn 預設只信 127.0.0.1。
CMD ["sh", "-c", "uv run --no-dev alembic upgrade head && uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
