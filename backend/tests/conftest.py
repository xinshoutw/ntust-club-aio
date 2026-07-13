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
from app.models.enums import ClubAttribute, UserRole

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
    club = Club(name=name, attribute=ClubAttribute.ART, **kw)
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
