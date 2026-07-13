from datetime import date, timedelta

import sqlalchemy as sa

from app.models import Activity, ApprovalRecord
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_activities import close_payload, create_activity, payload


async def seed(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await make_user(
        db, username="advisor", role="admin", permissions=["approve_advisor", "aact", "aclose"]
    )
    await make_user(db, username="chief", role="admin", permissions=["approve_chief"])
    await make_user(db, username="dean", role="admin", permissions=["approve_dean"])
    return club


async def submit_activity(client, db, **overrides) -> int:
    await login(client, "club01")
    data = await create_activity(client, **overrides)
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    return data["id"]


async def test_three_stage_flow_with_subsidy(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db)  # 有擬請補助 → 三關

    # 組長不能搶第一關
    await login(client, "chief")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403

    # 第一關:輔導老師,核定經費與大型認可
    await login(client, "advisor")
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    items = detail["budget_items"]
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "fund_source": "學務處經費",
            "budget": [{"item_id": i["id"], "approved_subsidy": 1000} for i in items],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "pending_chief"
    assert resp.json()["data"]["approved_total"] == 2000

    await login(client, "chief")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["status"] == "pending_dean"

    await login(client, "dean")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["status"] == "approved"

    records = (await db.scalars(sa.select(ApprovalRecord).order_by(ApprovalRecord.id))).all()
    assert [r.stage for r in records] == ["advisor", "chief", "dean"]

    # 學校核定金額 = 逐項核定總和
    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) == 2000


async def test_single_stage_without_subsidy(client, db):
    await seed(client, db)
    no_subsidy = payload(
        budget_items=[{"category": "雜支", "self_fund": 500, "requested_subsidy": 0}]
    )
    aid = await submit_activity(client, db, **no_subsidy)

    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["status"] == "approved"  # 無補助單關


async def test_reject_requires_reason_and_allows_resubmit(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db)

    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/reject", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422  # 原因必填

    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/reject",
        json={"reason": "經費編列不合理"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    # 社團可修改重送
    await login(client, "club01")
    detail = (await client.get(f"/api/v1/club/activities/{aid}")).json()["data"]
    assert detail["status"] == "rejected"
    assert detail["approvals"][-1]["reason"] == "經費編列不合理"
    resp = await client.post(f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client))
    assert resp.status_code == 200


async def test_large_approval_flag(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db, is_large=True)

    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"is_large_approved": True},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["is_large_approved"] is True


async def test_close_review_flow(client, db):
    await seed(client, db)
    past = (date.today() - timedelta(days=2)).isoformat()
    aid = await submit_activity(client, db, date=past)

    await login(client, "advisor")
    await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"budget": []},
        headers=csrf_headers(client),
    )
    # 直接走無補助單關?此活動有補助 → 需要三關,改用 DB 直接核准以聚焦結案流程
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="approved"))
    await db.commit()

    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    # 結案退回 → 回到 approved,社團可重送
    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/close-reject",
        json={"reason": "照片不足"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert (
        await db.scalar(sa.select(Activity.status).where(Activity.id == aid))
    ).value == "approved"

    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(member_count=99),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/close-approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert (await db.scalar(sa.select(Activity.status).where(Activity.id == aid))).value == "closed"

    # 重送的結案報告取代舊值
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    assert detail["report"]["member_count"] == 99


async def test_unlock_overdue_activity(client, db):
    await seed(client, db)
    stale = (date.today() - timedelta(days=90)).isoformat()
    aid = await submit_activity(client, db, date=stale)
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="approved"))
    await db.commit()

    await login(client, "advisor")
    resp = await client.post(f"/api/v1/admin/activities/{aid}/unlock", headers=csrf_headers(client))
    assert resp.status_code == 200

    await login(client, "club01")
    detail = (await client.get(f"/api/v1/club/activities/{aid}")).json()["data"]
    assert detail["close_locked"] is False
    assert detail["can_close"] is True


async def test_club_user_cannot_access_admin_endpoints(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db)
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403
    assert (await client.get("/api/v1/admin/activities")).status_code == 403
