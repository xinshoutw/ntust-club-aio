"""Alembic 遷移鏈本身的測試。

測試庫是 `create_all` 建的(conftest),整條遷移鏈因此完全沒有被執行過 ——
而正式部署跑的正是 `alembic upgrade head`。這裡另開一個庫真的跑一次,
並比對跑完的表結構與模型定義是否一致(漏寫 revision 的話會在這裡分岔)。
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.models import Base
from tests.conftest import TEST_DB

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATION_DB = f"{TEST_DB}_migrations"


def _alembic(*args: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env={**os.environ, "POSTGRES_DB": MIGRATION_DB},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"alembic {' '.join(args)} 失敗:\n{result.stderr}"


@pytest.fixture
async def migration_db():
    """全新的空庫(每次重建:遷移鏈必須能從零跑到底)。"""
    admin = create_async_engine(
        settings.sqlalchemy_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    async with admin.connect() as conn:
        await conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{MIGRATION_DB}" WITH (FORCE)'))
        await conn.execute(sa.text(f'CREATE DATABASE "{MIGRATION_DB}"'))
    await admin.dispose()

    engine = create_async_engine(settings.sqlalchemy_url.set(database=MIGRATION_DB))
    yield engine
    await engine.dispose()

    admin = create_async_engine(
        settings.sqlalchemy_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    async with admin.connect() as conn:
        await conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{MIGRATION_DB}" WITH (FORCE)'))
    await admin.dispose()


def _columns_of(sync_conn) -> dict[str, list[str]]:
    inspector = sa.inspect(sync_conn)
    return {
        name: sorted(c["name"] for c in inspector.get_columns(name, schema="public"))
        for name in inspector.get_table_names(schema="public")
        # alembic_version 是遷移鏈自己的簿記表,模型裡沒有
        if name != "alembic_version"
    }


def _indexes_of(sync_conn) -> set[str]:
    inspector = sa.inspect(sync_conn)
    return {
        f"{table}.{ix['name']}"
        for table in inspector.get_table_names(schema="public")
        for ix in inspector.get_indexes(table, schema="public")
    }


def _checks_of(sync_conn) -> set[str]:
    inspector = sa.inspect(sync_conn)
    return {
        f"{table}.{ck['name']}"
        for table in inspector.get_table_names(schema="public")
        for ck in inspector.get_check_constraints(table, schema="public")
    }


async def test_upgrade_head_builds_the_same_tables_as_the_models(migration_db):
    _alembic("upgrade", "head")

    async with migration_db.connect() as conn:
        actual = await conn.run_sync(_columns_of)
        indexes = await conn.run_sync(_indexes_of)
        checks = await conn.run_sync(_checks_of)

    expected = {
        name: sorted(c.name for c in table.columns) for name, table in Base.metadata.tables.items()
    }
    assert actual == expected
    # 索引也要對得起來:少了 revision 的索引不會讓欄位比對分岔,但正式庫就是沒有它
    expected_indexes = {
        f"{table.name}.{ix.name}" for table in Base.metadata.tables.values() for ix in table.indexes
    }
    assert expected_indexes <= indexes
    expected_checks = {
        f"{table.name}.{ck.name}"
        for table in Base.metadata.tables.values()
        for ck in table.constraints
        if isinstance(ck, sa.CheckConstraint) and ck.name
    }
    assert expected_checks <= checks


async def test_close_lock_setting_converts_between_months_and_days(migration_db):
    """`a3f7c2e91b48` 是純資料遷移:空庫跑等於 no-op,值的換算只有這裡驗得到。"""
    _alembic("upgrade", "c8b1a5d73f26")

    async def setting() -> list[tuple[str, object]]:
        async with migration_db.connect() as conn:
            rows = await conn.execute(
                sa.text("SELECT key, value FROM system_settings WHERE key LIKE 'close_lock%'")
            )
            return sorted(rows.all())

    async with migration_db.begin() as conn:
        await conn.execute(
            sa.text(
                "INSERT INTO system_settings (key, value, created_at, updated_at)"
                " VALUES ('close_lock_months', '2'::jsonb, now(), now())"
            )
        )

    _alembic("upgrade", "head")
    assert await setting() == [("close_lock_days", 60)]

    _alembic("downgrade", "-1")
    assert await setting() == [("close_lock_months", 2)]

    # downgrade 後新程式又存過一次設定 → 兩鍵並存,再 upgrade 不得撞主鍵
    async with migration_db.begin() as conn:
        await conn.execute(
            sa.text(
                "INSERT INTO system_settings (key, value, created_at, updated_at)"
                " VALUES ('close_lock_days', '45'::jsonb, now(), now())"
            )
        )
    _alembic("upgrade", "head")
    assert await setting() == [("close_lock_days", 60)]
