FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# 先裝相依(層快取),再放程式碼
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

EXPOSE 8000

# 啟動時自動跑 migration(單 instance 無競態)。
# forwarded-allow-ips '*' 的前提:backend 埠不對外發布,唯一能連進來的是
# compose 內網的 web 容器,且 web 已覆寫(非追加)X-Forwarded-For,鏈上無不可信值。
CMD ["sh", "-c", "uv run --no-dev alembic upgrade head && uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
