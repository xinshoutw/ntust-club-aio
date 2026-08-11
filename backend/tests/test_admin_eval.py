import pytest

from app.models import Award
from app.models.enums import AwardKind
from tests.conftest import csrf_headers, login, make_club, make_user


async def seed(client, db):
    club = await make_club(db)
    club.website_url = "https://club.example.com"
    await make_user(db, username="club01", club_id=club.id)
    await make_user(db, username="evaladmin", role="admin", permissions=["aeval"])
    await make_user(db, username="other", role="admin", permissions=["aact"])
    db.add(Award(id="club", name="最佳社團獎", kind=AwardKind.GROUP, is_weighted=True))
    await db.commit()
    return club


async def test_override_revert_and_merit_flow(client, db):
    club = await seed(client, db)
    await login(client, "evaladmin")

    # 調整 ad6:5 → 2
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/override",
        json={"key": "ad6", "score": 2, "reason": "網頁內容不完整"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    ad6 = next(s for s in resp.json()["data"]["scores"] if s["key"] == "ad6")
    assert (ad6["auto"], ad6["final"], ad6["overridden"]) == (5, 2, True)

    # 再調整取代前次
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/override",
        json={"key": "ad6", "score": 4, "reason": "補交後調升"},
        headers=csrf_headers(client),
    )
    ad6 = next(s for s in resp.json()["data"]["scores"] if s["key"] == "ad6")
    assert ad6["final"] == 4

    # 社團端即時看到調整
    await login(client, "club01")
    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    ad6 = next(s for s in data["scores"] if s["key"] == "ad6")
    assert ad6["final"] == 4
    assert ad6["overridden"] is True

    # 回到自動
    await login(client, "evaladmin")
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/revert",
        json={"key": "ad6", "reason": "確認資料無誤"},
        headers=csrf_headers(client),
    )
    ad6 = next(s for s in resp.json()["data"]["scores"] if s["key"] == "ad6")
    assert (ad6["final"], ad6["overridden"]) == (5, False)

    # 表現優良加分
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/merit",
        json={"score": 4, "reason": "全國競賽獲獎"},
        headers=csrf_headers(client),
    )
    adj = next(s for s in resp.json()["data"]["scores"] if s["key"] == "adj")
    assert adj["auto"] == 4

    # 調整歷程留痕(含已註銷)
    detail = (await client.get(f"/api/v1/admin/eval/clubs/{club.id}")).json()["data"]
    kinds = [a["kind"] for a in detail["adjustments"]]
    assert kinds.count("admin_score_override") == 2
    assert kinds.count("merit_bonus") == 1
    assert any(a["revoked"] for a in detail["adjustments"])


async def test_adjustments_wait_for_the_club_lock(client, db):
    """「註銷舊值 → 新增一筆」不是原子的:三支端點都得先取該社團的鎖,否則並發會互相蓋掉。"""
    import asyncio

    from app.core.db import async_session_factory
    from app.services import evaluation

    club = await seed(client, db)
    await login(client, "evaladmin")

    async def blocked(path: str, body: dict):
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(
                client.post(
                    f"/api/v1/admin/eval/clubs/{club.id}/{path}",
                    json=body,
                    headers=csrf_headers(client),
                ),
                timeout=1,
            )

    async with async_session_factory() as holder:
        await evaluation.lock_adjustments(holder, club.id)  # 佔住鎖,交易不結束
        await blocked("override", {"key": "ad6", "score": 2, "reason": "並發"})
        # 「回到自動」同樣是註銷後判定,漏鎖的話 override 會活過這次回復
        await blocked("revert", {"key": "ad6", "reason": "並發"})
        await blocked("merit", {"score": 3, "reason": "並發"})


async def test_override_score_capped_per_item(client, db):
    club = await seed(client, db)
    await login(client, "evaladmin")

    # ad6 滿分 5,不得 override 成 30;也不得為負
    for bad in (30, -1):
        resp = await client.post(
            f"/api/v1/admin/eval/clubs/{club.id}/override",
            json={"key": "ad6", "score": bad, "reason": "x"},
            headers=csrf_headers(client),
        )
        assert resp.status_code == 422

    # adj 允許 -10..5
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/override",
        json={"key": "adj", "score": -10, "reason": "重大違規"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    # 空白原因不得過關
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/override",
        json={"key": "ad6", "score": 3, "reason": "   "},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_invalid_key_and_permission_guard(client, db):
    club = await seed(client, db)
    await login(client, "evaladmin")
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/override",
        json={"key": "ad99", "score": 1, "reason": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 無 aeval 權限的管理員 → 403
    await login(client, "other")
    resp = await client.post(
        f"/api/v1/admin/eval/clubs/{club.id}/override",
        json={"key": "ad6", "score": 1, "reason": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403

    await login(client, "club01")
    assert (await client.get("/api/v1/admin/eval/clubs")).status_code == 403


async def test_list_clubs_scores(client, db):
    club = await seed(client, db)
    await login(client, "evaladmin")
    data = (await client.get("/api/v1/admin/eval/clubs")).json()["data"]
    assert data[0]["club_name"] == club.name
    assert data[0]["total"] == 5  # 只有 ad6 網頁 5 分
