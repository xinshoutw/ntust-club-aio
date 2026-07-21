# ruff: noqa: E402
import os

# 必須在 import app 之前設定:測試一律打獨立資料庫(絕不碰開發庫)
os.environ["POSTGRES_DB"] = "club_aio_test"

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.db import async_session_factory, engine
from app.core.rate_limit import login_limiter, upload_limiter
from app.core.security import hash_password
from app.main import app
from app.models import Base, Club, User
from app.models.enums import ClubAttribute, ClubKind, UserRole

TEST_DB = "club_aio_test"
# 測試通用密碼(符合密碼政策)
PASSWORD = "Secret!2345"
_PASSWORD_HASH = hash_password(PASSWORD)  # argon2 只算一次,加速建帳號
_ALL_TABLES = None  # 由 _database fixture 填入


@pytest.fixture(scope="session", autouse=True)
async def _database():
    admin = create_async_engine(
        settings.sqlalchemy_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    async with admin.connect() as conn:
        exists = await conn.scalar(
            sa.text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB}
        )
        if not exists:
            await conn.execute(sa.text(f'CREATE DATABASE "{TEST_DB}"'))
        # 防鎖死(2026-07-16):
        # 1) 先掃掉別的(當掉/併跑)測試行程殘留的連線,否則 drop_all/TRUNCATE 會永遠等鎖
        await conn.execute(
            sa.text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :n AND pid <> pg_backend_pid()"
            ),
            {"n": TEST_DB},
        )
        # 2) 測試庫層級的鎖等待/語句上限:再發生競爭時數秒內報錯,而不是無聲卡死
        await conn.execute(sa.text(f'ALTER DATABASE "{TEST_DB}" SET lock_timeout = \'5s\''))
        await conn.execute(
            sa.text(f'ALTER DATABASE "{TEST_DB}" SET statement_timeout = \'30s\'')
        )
        await conn.execute(
            sa.text(
                f'ALTER DATABASE "{TEST_DB}" SET idle_in_transaction_session_timeout = \'60s\''
            )
        )
    await admin.dispose()

    global _ALL_TABLES
    _ALL_TABLES = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean(_database):
    yield
    login_limiter.reset()
    upload_limiter.reset()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"TRUNCATE {_ALL_TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
def _mute_discord(monkeypatch):
    """測試不打真實 Discord webhook(.env 現值為測試群組);要測發送的自行 monkeypatch。"""
    monkeypatch.setattr(settings, "discord_webhook_url", "")


@pytest.fixture(autouse=True)
def _tmp_upload_dir(tmp_path, monkeypatch):
    """上傳一律寫 per-test 暫存目錄,絕不碰真實 upload_dir。"""
    monkeypatch.setattr(settings, "upload_dir", tmp_path)


@pytest.fixture
async def db():
    async with async_session_factory() as session:
        yield session


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---- factories ----


async def make_club(db, name: str = "熱舞社", **kw) -> Club:
    kw.setdefault("kind", ClubKind.ASSOCIATION if name.endswith("會") else ClubKind.CLUB)
    kw.setdefault("attribute", ClubAttribute.ART)  # 可傳 None 模擬停社(原性質不可考)
    club = Club(name=name, **kw)
    db.add(club)
    await db.commit()
    await db.refresh(club)
    return club


async def make_user(
    db,
    *,
    username: str,
    role: UserRole = UserRole.CLUB,
    club_id: int | None = None,
    must_change_password: bool = False,
    **kw,
) -> User:
    user = User(
        role=role,
        username=username,
        password_hash=_PASSWORD_HASH,
        name=kw.pop("name", username),
        club_id=club_id,
        must_change_password=must_change_password,
        **kw,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def csrf_headers(client: httpx.AsyncClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("csrf_token", "")}


async def login(client: httpx.AsyncClient, username: str, password: str = PASSWORD):
    return await client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    )
