import httpx
import pytest
from sqlalchemy.exc import IntegrityError

from app.main import app, integrity_error_handler
from app.models import Club, User
from app.models.enums import ClubAttribute, ClubKind, UserRole
from tests.conftest import make_club


def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_health_returns_ok_envelope():
    async with client() as c:
        resp = await c.get("/api/v1/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {"status": "ok"}
    assert body["error"] is None


async def test_not_found_uses_error_envelope():
    async with client() as c:
        resp = await c.get("/api/v1/no-such-route")

    assert resp.status_code == 404
    body = resp.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]


async def test_only_race_constraints_map_to_409(db):
    """CHECK 之類是程式缺陷:回 409 等於叫使用者對著壞掉的程式重試。"""
    await make_club(db, name="熱舞社")

    db.add(Club(name="熱舞社", kind=ClubKind.CLUB, attribute=ClubAttribute.ART))
    with pytest.raises(IntegrityError) as duplicate:  # 唯一鍵:另一個交易搶先
        await db.commit()
    await db.rollback()

    db.add(Club(name="吉他社", kind="club", attribute="art"))  # 寫壞的 enum 值
    with pytest.raises(IntegrityError) as bad_value:
        await db.commit()
    await db.rollback()

    db.add(User(role=UserRole.CLUB, username="u1", password_hash="x", name="u1", club_id=999999))
    with pytest.raises(IntegrityError) as bad_ref:  # 外鍵:引用不存在的 id 是程式缺陷
        await db.commit()
    await db.rollback()

    # 錯誤訊息會進 log(unhandled handler 記整條 traceback),不得把繫結參數一起帶出去 ——
    # 那是使用者送進來的原值(郵局帳號、學號姓名電話)
    assert "[parameters:" not in str(bad_value.value)

    request = httpx.Request("POST", "http://test/api/v1/x")
    assert (await integrity_error_handler(request, duplicate.value)).status_code == 409
    assert (await integrity_error_handler(request, bad_value.value)).status_code == 500
    assert (await integrity_error_handler(request, bad_ref.value)).status_code == 500


async def test_destructive_scripts_refuse_on_prod(monkeypatch, capsys):
    """reset_db / seed_mock 會 DROP SCHEMA 並清空上傳目錄:ENV=prod 必須先擋一次。"""
    import pytest

    from app.core.config import settings
    from scripts._safety import refuse_on_prod

    monkeypatch.setattr(settings, "env", "prod")
    with pytest.raises(SystemExit) as exit_info:
        refuse_on_prod("還原資料庫")
    assert exit_info.value.code == 1
    assert "拒絕執行" in capsys.readouterr().err

    monkeypatch.setattr(settings, "env", "dev")
    refuse_on_prod("還原資料庫")  # 開發環境照常放行


async def test_bulk_password_reset_only_touches_what_was_asked_for(db):
    """`set_passwords.py` 一次改一整批密碼:選錯範圍就是把不該動的帳號一起換掉,
    而且沒有回頭路(舊 hash 不留)。角色旗標是聯集,SSO 帳號一律不列入。"""
    import argparse

    import sqlalchemy as sa

    from app.models import User
    from app.models.enums import AuthProvider, UserRole
    from scripts.set_passwords import selection
    from tests.conftest import make_club, make_user

    club = await make_club(db, name="測試社")
    await make_user(db, username="c1", role=UserRole.CLUB, club_id=club.id)
    await make_user(db, username="a1", role=UserRole.ADMIN)
    await make_user(db, username="a2", role=UserRole.ADMIN, is_super=True)
    await make_user(db, username="v1", role=UserRole.VIEWER)
    await make_user(db, username="sso1", role=UserRole.ADMIN, auth_provider=AuthProvider.SSO)

    async def matched(**flags) -> set[str]:
        defaults = dict(
            all=False, club=False, admin=False, staff=False, viewer=False,
            is_super=False, username=[],
        )
        args = argparse.Namespace(**(defaults | flags))
        conditions = selection(args)
        if not conditions:
            return set()
        rows = await db.scalars(
            sa.select(User.username).where(
                sa.or_(*conditions), User.auth_provider == AuthProvider.LOCAL
            )
        )
        return set(rows)

    assert await matched() == set(), "沒給條件必須選不到任何人(main 會 parser.error)"
    assert await matched(club=True) == {"c1"}
    assert await matched(is_super=True) == {"a2"}
    assert await matched(club=True, viewer=True) == {"c1", "v1"}, "角色旗標是聯集"
    assert await matched(username=["c1", "v1"]) == {"c1", "v1"}
    assert await matched(all=True) == {"c1", "a1", "a2", "v1"}, "SSO 帳號沒有本地密碼可設"
