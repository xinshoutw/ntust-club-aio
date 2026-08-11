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

    request = httpx.Request("POST", "http://test/api/v1/x")
    assert (await integrity_error_handler(request, duplicate.value)).status_code == 409
    assert (await integrity_error_handler(request, bad_value.value)).status_code == 500
    assert (await integrity_error_handler(request, bad_ref.value)).status_code == 500
