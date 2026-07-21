from datetime import date, timedelta

import sqlalchemy as sa

from app.models import Activity, ApprovalRecord
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_activities import close_payload, create_activity, payload, upload_photo


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


async def approve_first_stage(client, aid: int, **extra):
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    body = {
        "fund_source": "學務處經費",
        "budget": [{"item_id": i["id"], "approved_subsidy": 100} for i in detail["budget_items"]],
        **extra,
    }
    return await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json=body, headers=csrf_headers(client)
    )


async def test_large_approval_flag(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db, is_large=True)

    await login(client, "advisor")
    resp = await approve_first_stage(client, aid, is_large_approved=True)
    assert resp.json()["data"]["is_large_approved"] is True


async def test_subsidized_approval_requires_full_budget_decision(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db)

    await login(client, "advisor")
    # 空 body:有補助案件不得未核定就過關
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 只核定一項也不行
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    first = detail["budget_items"][0]["id"]
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"fund_source": "學務處經費", "budget": [{"item_id": first, "approved_subsidy": 10}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_super_cannot_sign_dean_stage(client, db):
    await seed(client, db)
    await make_user(db, username="root", role="admin", is_super=True)
    aid = await submit_activity(client, db)

    await login(client, "advisor")
    await approve_first_stage(client, aid)
    await login(client, "chief")
    await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )

    # 學務長關卡=本人操作:super 未持 approve_dean 不得代簽
    await login(client, "root")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403


async def test_stage_only_account_visibility_is_scoped(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db)  # pending_advisor

    # 只持 approve_dean 的帳號:列表看不到、詳情視同不存在
    await login(client, "dean")
    listing = (await client.get("/api/v1/admin/activities")).json()
    assert listing["meta"]["total"] == 0
    assert (await client.get(f"/api/v1/admin/activities/{aid}")).status_code == 404

    # 持 aact 的帳號可全覽
    await login(client, "advisor")
    assert (await client.get(f"/api/v1/admin/activities/{aid}")).status_code == 200


async def test_aclose_only_account_sees_only_close_scope(client, db):
    """僅持 aclose 的帳號視野限結案範圍(closing/approved/closed),不得讀申請中/已退回。"""
    await seed(client, db)
    await make_user(db, username="closer", role="admin", permissions=["aclose"])

    pending = await submit_activity(client, db)
    rejected = await submit_activity(client, db, name="被退回活動")
    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{rejected}/reject",
        json={"reason": "資料不全"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    past = (date.today() - timedelta(days=2)).isoformat()
    closing = await submit_activity(client, db, name="已送結案活動", date=past)
    await db.execute(sa.update(Activity).where(Activity.id == closing).values(status="approved"))
    await db.commit()
    await login(client, "club01")
    await upload_photo(client, closing)
    resp = await client.post(
        f"/api/v1/club/activities/{closing}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    await login(client, "closer")
    listing = (await client.get("/api/v1/admin/activities")).json()
    ids = [a["id"] for a in listing["data"]]
    assert closing in ids
    assert pending not in ids
    assert rejected not in ids

    # 已知 ID 直接讀非結案範圍 → 視同不存在(避免越權讀預算、審批與附件)
    assert (await client.get(f"/api/v1/admin/activities/{pending}")).status_code == 404
    assert (await client.get(f"/api/v1/admin/activities/{rejected}")).status_code == 404
    assert (await client.get(f"/api/v1/admin/activities/{closing}")).status_code == 200


async def test_admin_list_includes_club_name_and_close_deadline(client, db):
    club = await seed(client, db)
    aid = await submit_activity(client, db)

    await login(client, "advisor")
    listing = (await client.get("/api/v1/admin/activities")).json()
    row = next(r for r in listing["data"] if r["id"] == aid)
    assert row["club_id"] == club.id
    assert row["club_name"] == club.name
    assert row["close_deadline"]  # 推導:活動結束日 + 鎖定月數

    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    assert detail["club_name"] == club.name


async def test_unlock_requires_actual_lock(client, db):
    await seed(client, db)
    recent = (date.today() - timedelta(days=2)).isoformat()
    aid = await submit_activity(client, db, date=recent)
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="approved"))
    await db.commit()

    await login(client, "advisor")
    resp = await client.post(f"/api/v1/admin/activities/{aid}/unlock", headers=csrf_headers(client))
    assert resp.status_code == 409  # 未逾期不得預先解鎖


async def test_close_review_flow(client, db):
    await seed(client, db)
    past = (date.today() - timedelta(days=2)).isoformat()
    aid = await submit_activity(client, db, date=past)
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="approved"))
    await db.commit()

    await login(client, "club01")
    await upload_photo(client, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    # 結案退回 → 回到 approved,社團可重送(照片仍掛在活動上,重送不需重傳)
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


async def test_large_approval_admin_override_without_application(client, db):
    """未申請大型的「活動」可由管理員逕行核定(2026-07-15 第七輪);社課不可。"""
    await seed(client, db)
    aid = await submit_activity(client, db, is_large=False)

    await login(client, "advisor")
    resp = await approve_first_stage(client, aid, is_large_approved=True)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["is_large"] is True  # 逕行核定
    assert data["is_large_approved"] is True

    # 類型=社課 不得認定為大型活動
    cid = await submit_activity(client, db, name="每週社課", type="社課或會議", is_large=False)
    await login(client, "advisor")
    resp = await approve_first_stage(client, cid, is_large_approved=True)
    assert resp.status_code == 422


async def test_large_application_denied_by_default(client, db):
    """有申請大型但管理員未勾認可 → is_large_approved=False(空心+斜線)。"""
    await seed(client, db)
    aid = await submit_activity(client, db, is_large=True)

    await login(client, "advisor")
    resp = await approve_first_stage(client, aid)  # 未帶 is_large_approved
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["is_large"] is True
    assert data["is_large_approved"] is False


async def test_review_permission_key_alias(client, db):
    """前端權限彈窗鍵 areview 與既有 aact 皆可看審核列表(鍵名尚未統一)。"""
    await seed(client, db)
    aid = await submit_activity(client, db)
    await make_user(db, username="fe_reviewer", role="admin", permissions=["areview"])
    await login(client, "fe_reviewer")
    resp = await client.get("/api/v1/admin/activities")
    assert resp.status_code == 200
    assert aid in [a["id"] for a in resp.json()["data"]]


async def test_close_approve_persists_submission_confirmations(client, db):
    """核准時的繳交確認落庫;未確認之項目評鑑以 0 分計(scoring 讀取)。"""
    await seed(client, db)
    past = (date.today() - timedelta(days=2)).isoformat()
    aid = await submit_activity(client, db, date=past)
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="approved"))
    await db.commit()

    await login(client, "club01")
    await upload_photo(client, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/close-approve",
        json={"photos_confirmed": False, "reflections_confirmed": False},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    from app.models import ActivityReport

    report = await db.get(ActivityReport, aid)
    assert (report.photos_confirmed, report.report_confirmed, report.reflections_confirmed) == (
        False,
        True,
        False,
    )


async def test_list_filters_locked_and_sort(client, db):
    """2026-07-21:清單伺服器端分頁——multi status、locked 推導過濾、sort 白名單。"""
    from datetime import date, timedelta

    from app.models import Activity

    club = await seed(client, db)
    creator = await make_user(db, username="creator2", club_id=club.id)
    await login(client, "advisor")
    old = Activity(
        club_id=club.id, name="逾期活動", location="x", type="活動",
        date=date.today() - timedelta(days=200), end_date=date.today() - timedelta(days=200),
        status="approved", created_by=creator.id,
    )
    fresh = Activity(
        club_id=club.id, name="近期活動", location="x", type="社課或會議",
        date=date.today() + timedelta(days=3), end_date=date.today() + timedelta(days=3),
        status="approved", created_by=creator.id,
    )
    db.add_all([old, fresh])
    await db.commit()

    resp = await client.get("/api/v1/admin/activities", params={"locked": "true"})
    names = [a["name"] for a in resp.json()["data"]]
    assert "逾期活動" in names and "近期活動" not in names

    resp = await client.get(
        "/api/v1/admin/activities", params=[("status", "approved"), ("sort", "-date")]
    )
    dates = [a["date"] for a in resp.json()["data"]]
    assert dates == sorted(dates, reverse=True)

    resp = await client.get("/api/v1/admin/activities", params=[("type", "社課或會議")])
    assert all(a["type"] == "社課或會議" for a in resp.json()["data"])
    resp = await client.get("/api/v1/admin/activities", params=[("type", "怪型")])
    assert resp.status_code == 422
