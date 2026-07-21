from datetime import UTC, date, datetime, timedelta

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
    """送審一筆活動;date 覆寫在送審後直接改 DB。

    送審已全面禁止過去開始時刻(2026-07-21),但結案/鎖定測試需要「已結束」的活動:
    以未來日期走完真實送審流程,再把日期改回測試指定值。
    """
    await login(client, "club01")
    wanted = overrides.pop("date", None)
    future = (date.today() + timedelta(days=30)).isoformat()
    data = await create_activity(client, date=future, **overrides)
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    if wanted is not None:
        wanted_day = date.fromisoformat(wanted)
        await db.execute(
            sa.update(Activity)
            .where(Activity.id == data["id"])
            .values(date=wanted_day, end_date=wanted_day)
        )
        await db.commit()
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

    # 第一關:承辦人,核定經費與大型認可
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


async def test_overdue_filter_includes_unlocked(client, db):
    """overdue=true 回全部逾期未結案(不分鎖定與否);locked=true 僅未解鎖者。"""
    club = await seed(client, db)
    creator = await make_user(db, username="creator5", club_id=club.id)
    old = date.today() - timedelta(days=200)

    def act(name, *, unlocked=False, day=old):
        return Activity(
            club_id=club.id, name=name, location="x", type="社課或會議",
            date=day, end_date=day, status="approved", created_by=creator.id,
            close_unlocked=unlocked,
        )

    db.add_all([
        act("逾期鎖定"),
        act("逾期已解鎖", unlocked=True),
        act("未逾期", day=date.today() + timedelta(days=3)),
    ])
    await db.commit()

    await login(client, "advisor")
    resp = await client.get("/api/v1/admin/activities", params={"overdue": "true"})
    rows = {r["name"]: r for r in resp.json()["data"]}
    assert set(rows) == {"逾期鎖定", "逾期已解鎖"}
    assert rows["逾期鎖定"]["close_locked"] is True  # 前端據此區分已鎖定/已解鎖列
    assert rows["逾期已解鎖"]["close_locked"] is False
    assert all(r["close_deadline"] for r in rows.values())

    resp = await client.get("/api/v1/admin/activities", params={"locked": "true"})
    assert {r["name"] for r in resp.json()["data"]} == {"逾期鎖定"}


async def test_reviewed_at_field_and_sorting(client, db):
    """reviewed_at=申請+結案簽核紀錄的 max(created_at);排序兩向 NULLS LAST(無審核紀錄殿後)。"""
    from app.models.enums import ApprovalDecision, ApprovalSubject

    club = await seed(client, db)
    creator = await make_user(db, username="creator4", club_id=club.id)
    day = date.today() + timedelta(days=10)

    def act(name, status="approved"):
        return Activity(
            club_id=club.id, name=name, location="x", type="社課或會議",
            date=day, end_date=day, status=status, created_by=creator.id,
        )

    early, late, never = act("早審"), act("晚審"), act("未審", "pending_advisor")
    db.add_all([early, late, never])
    await db.flush()

    t0 = datetime.now(UTC) - timedelta(days=3)

    def rec(activity_id, subject, at):
        return ApprovalRecord(
            subject_type=subject, subject_id=activity_id, stage="advisor",
            decision=ApprovalDecision.APPROVE, actor_id=creator.id, created_at=at,
        )

    db.add_all([
        rec(early.id, ApprovalSubject.ACTIVITY, t0 + timedelta(hours=1)),
        # 晚審:申請關較早、結案審核最晚 → reviewed_at 取兩種 subject 的 max
        rec(late.id, ApprovalSubject.ACTIVITY, t0),
        rec(late.id, ApprovalSubject.ACTIVITY_CLOSE, t0 + timedelta(days=1)),
    ])
    await db.commit()

    await login(client, "advisor")
    resp = await client.get("/api/v1/admin/activities", params={"sort": "-reviewed_at"})
    rows = resp.json()["data"]
    assert [r["name"] for r in rows] == ["晚審", "早審", "未審"]  # 無審核紀錄者殿後
    by_name = {r["name"]: r for r in rows}
    assert by_name["未審"]["reviewed_at"] is None
    assert by_name["早審"]["reviewed_at"] < by_name["晚審"]["reviewed_at"]  # 同時區 ISO 可比

    resp = await client.get("/api/v1/admin/activities", params={"sort": "reviewed_at"})
    assert [r["name"] for r in resp.json()["data"]] == ["早審", "晚審", "未審"]

    # 詳情同樣回 reviewed_at(自 approvals 推導)
    detail = (await client.get(f"/api/v1/admin/activities/{late.id}")).json()["data"]
    assert detail["reviewed_at"] == by_name["晚審"]["reviewed_at"]


async def test_large_type_filter_and_locked_boundary(client, db):
    """「大型活動」推導過濾(三值 is_large_approved)與逾期鎖定的日界。"""
    from datetime import date, timedelta

    from app.models import Activity
    from app.services.activity_service import add_months
    from app.services.settings_service import get_setting

    club = await seed(client, db)
    creator = await make_user(db, username="creator3", club_id=club.id)
    day = date.today() + timedelta(days=30)

    def act(name, *, type_="活動", is_large=False, approved=None):
        return Activity(
            club_id=club.id, name=name, location="x", type=type_,
            date=day, end_date=day, status="approved", created_by=creator.id,
            is_large=is_large, is_large_approved=approved,
        )

    db.add_all([
        act("認可大型", is_large=True, approved=True),
        act("申請中大型", is_large=True, approved=None),
        act("被否准", is_large=True, approved=False),
        act("一般活動"),
        act("純社課", type_="社課或會議"),
    ])
    await db.commit()
    await login(client, "advisor")

    resp = await client.get("/api/v1/admin/activities", params=[("type", "大型活動")])
    names = {a["name"] for a in resp.json()["data"]}
    assert names == {"認可大型", "申請中大型"}
    resp = await client.get("/api/v1/admin/activities", params=[("type", "活動")])
    names = {a["name"] for a in resp.json()["data"]}
    assert names == {"被否准", "一般活動"}

    # 鎖定日界:期限日當天不鎖、隔天鎖(與 is_close_locked 同界)
    lock_months = int(await get_setting(db, "close_lock_months"))
    # 找 base 使 add_months(base, N) == today(當天不鎖)與 == 昨天(鎖)
    base_today = None
    base_locked = None
    probe = date.today() - timedelta(days=25)
    for delta in range(70):
        candidate = probe - timedelta(days=delta)
        if add_months(candidate, lock_months) == date.today():
            base_today = candidate
        if add_months(candidate, lock_months) == date.today() - timedelta(days=1):
            base_locked = candidate
    assert base_today and base_locked
    a_edge = Activity(
        club_id=club.id, name="期限日當天", location="x", type="社課或會議",
        date=base_today, end_date=base_today, status="approved", created_by=creator.id,
    )
    a_lock = Activity(
        club_id=club.id, name="期限已過一天", location="x", type="社課或會議",
        date=base_locked, end_date=base_locked, status="approved", created_by=creator.id,
    )
    db.add_all([a_edge, a_lock])
    await db.commit()
    resp = await client.get("/api/v1/admin/activities", params={"locked": "true"})
    names = {a["name"] for a in resp.json()["data"]}
    assert "期限已過一天" in names
    assert "期限日當天" not in names
