from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa

from app.models import (
    Activity,
    ActivityBudgetItem,
    ApprovalRecord,
    AuditLog,
    SystemSetting,
    User,
)
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_activities import (
    close_payload,
    create_activity,
    payload,
    upload_min_photos,
)


async def club_account(db) -> User:
    """該社既有的社團帳號:一社一帳號是 DB 約束,測試不能為了拿 created_by 再開一個。"""
    return await db.scalar(sa.select(User).where(User.username == "club01"))


async def seed(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await make_user(
        db, username="advisor", role="admin", permissions=["approve_advisor", "areview", "aclose"]
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
            # 核定不得高於各項擬請(decisions.md D-03):照擬請金額全額核定
            "budget": [
                {"item_id": i["id"], "approved_subsidy": i["requested_subsidy"]} for i in items
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "pending_chief"
    assert resp.json()["data"]["approved_total"] == 2500  # 2000 + 500,兩項各照擬請全額

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

    # 學校核定金額 = 逐項核定總和(2000 + 500,兩項各照擬請全額)
    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) == 2500


async def test_approved_subsidy_cannot_exceed_what_was_requested(client, db):
    """核定不得高於社團擬請(decisions.md D-03)。

    前端的 InputNumber max 只擋鍵入,直接呼叫 API 原本可以核定任意金額。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)
    await login(client, "advisor")
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    items = detail["budget_items"]
    smallest = min(items, key=lambda i: i["requested_subsidy"])

    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "fund_source": "學務處經費",
            "budget": [
                {
                    "item_id": i["id"],
                    "approved_subsidy": (
                        i["requested_subsidy"] + 1
                        if i["id"] == smallest["id"]
                        else i["requested_subsidy"]
                    ),
                }
                for i in items
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["meta"]["code"] == "APPROVED_OVER_REQUESTED"
    # 擋下來就不該留下任何核定值
    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) is None

    # 等額與少於擬請都放行
    for amount in (smallest["requested_subsidy"], 0):
        resp = await client.post(
            f"/api/v1/admin/activities/{aid}/approve",
            json={
                "fund_source": "學務處經費",
                "budget": [
                    {
                        "item_id": i["id"],
                        "approved_subsidy": (
                            amount if i["id"] == smallest["id"] else i["requested_subsidy"]
                        ),
                    }
                    for i in items
                ],
            },
            headers=csrf_headers(client),
        )
        if resp.status_code == 200:
            break
    assert resp.status_code == 200, resp.text


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
    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) == 0


async def test_no_subsidy_case_cannot_be_granted_money(client, db):
    """無補助案是承辦人單關即核准 —— 不得藉核定金額繞過組長與學務長。"""
    await seed(client, db)
    no_subsidy = payload(
        budget_items=[{"category": "雜支", "self_fund": 500, "requested_subsidy": 0}]
    )
    aid = await submit_activity(client, db, **no_subsidy)

    await login(client, "advisor")
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"budget": [{"item_id": detail["budget_items"][0]["id"], "approved_subsidy": 99999}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) is None

    # 前一輪殘留的逐項核定值不得被加總回來 —— 送空 body 也要歸零
    await db.execute(sa.update(ActivityBudgetItem).values(approved_subsidy=8000))
    await db.commit()
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) == 0
    assert await db.scalar(
        sa.select(ActivityBudgetItem.approved_subsidy).where(ActivityBudgetItem.activity_id == aid)
    ) == 0


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

    # 持 areview 的帳號可全覽
    await login(client, "advisor")
    assert (await client.get(f"/api/v1/admin/activities/{aid}")).status_code == 200


async def test_dean_view_is_scoped_to_the_third_stage(client, db):
    """學務長的視野只有第三關(decisions.md D-38)。

    待審佇列=輪到他的,最近審核=他這關簽過的(核准或退回)。承辦人核定 0 元當場核准的
    單從頭到尾沒到過他手上 —— 狀態同樣是 approved,但一件都不該出現。
    """
    await seed(client, db)
    # 學務長鍵一到手視野就收斂,super 也不例外
    await make_user(
        db, username="root_dean", role="admin", is_super=True, permissions=["approve_dean"]
    )
    signed = await submit_activity(client, db, name="學務長簽過的")
    waiting = await submit_activity(client, db, name="輪到學務長")
    solo = await submit_activity(client, db, name="承辦當場核准")

    await login(client, "advisor")
    for aid in (signed, waiting):
        assert (await approve_first_stage(client, aid)).status_code == 200
    # 核定 0 元即當場核准(D-16):這張單不會送到第三關,狀態卻一樣是 approved
    items = (await client.get(f"/api/v1/admin/activities/{solo}")).json()["data"]["budget_items"]
    resp = await client.post(
        f"/api/v1/admin/activities/{solo}/approve",
        json={"budget": [{"item_id": i["id"], "approved_subsidy": 0} for i in items]},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["status"] == "approved"

    await login(client, "chief")
    for aid in (signed, waiting):
        resp = await client.post(
            f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
        )
        assert resp.json()["data"]["status"] == "pending_dean"

    await login(client, "dean")
    resp = await client.post(
        f"/api/v1/admin/activities/{signed}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["status"] == "approved"

    for username in ("dean", "root_dean"):
        await login(client, username)
        listing = (await client.get("/api/v1/admin/activities")).json()
        assert sorted(a["id"] for a in listing["data"]) == sorted([signed, waiting])

        # 待審佇列與側欄徽章是同一個集合:只有輪到他的那一件
        queue = (await client.get("/api/v1/admin/activities?status=pending_dean")).json()
        assert [a["id"] for a in queue["data"]] == [waiting]
        assert (await client.get("/api/v1/badges")).json()["data"]["a-review"] == 1

        # 最近審核:簽過第三關的才在,承辦單關核准的同狀態單不可見(詳情亦視同不存在)
        recent = (await client.get("/api/v1/admin/activities?status=approved")).json()
        assert [a["id"] for a in recent["data"]] == [signed]
        assert (await client.get(f"/api/v1/admin/activities/{solo}")).status_code == 404
        assert (await client.get(f"/api/v1/admin/activities/{signed}")).status_code == 200


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
    await upload_min_photos(client, closing)
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
    # 推導:活動結束日 + 鎖定天數。社團端的倒數與鎖定都讀這個值,差一天就是差一天
    from app.services.settings_service import get_setting

    lock_days = int(await get_setting(db, "close_lock_days"))
    end = date.fromisoformat(row["end_date"])
    assert row["close_deadline"] == (end + timedelta(days=lock_days)).isoformat()

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
    await upload_min_photos(client, aid)
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

    # 自動解鎖要留下痕跡:之後查「這張單是誰解的鎖」不能在稽核軌跡上落空
    actions = (
        await db.scalars(
            sa.select(AuditLog.action).where(AuditLog.action.like("activity_close%"))
        )
    ).all()
    assert "activity_close_unlocked" in actions

    # 退回件不受結案期限限制:補件期間跨過期限也重送得了,不必請行政解鎖
    from app.services.settings_service import get_setting

    lock_days = int(await get_setting(db, "close_lock_days"))
    long_past = date.today() - timedelta(days=lock_days + 1)
    await db.execute(
        sa.update(Activity).where(Activity.id == aid).values(date=long_past, end_date=long_past)
    )
    await db.commit()

    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(member_count=99),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/close-approve",
        json={"photos_confirmed": True, "report_confirmed": True, "reflections_confirmed": True},
        headers=csrf_headers(client),
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


async def test_large_approval_can_be_corrected_at_a_later_stage(client, db):
    """承辦人第一關忘了勾,組長或學務長仍補得回來(decisions.md ISS-54)。

    只在第一關寫入的話就永久固化為「否准」,退回重送也補不回來 —— 而大型活動
    一次算 3 分行政分,漏一件就直接影響競賽名次。
    """
    await seed(client, db)
    aid = await submit_activity(client, db, is_large=True)  # 有申請補助 → 走三關

    await login(client, "advisor")
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "fund_source": "學務處經費",
            "budget": [
                {"item_id": i["id"], "approved_subsidy": i["requested_subsidy"]}
                for i in detail["budget_items"]
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["is_large_approved"] is False  # 沒勾=否准

    # 組長關補認可
    await login(client, "chief")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"is_large_approved": True},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["is_large_approved"] is True

    # 學務長關送空 body 不得把認可清掉
    await login(client, "dean")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["is_large_approved"] is True
    assert resp.json()["data"]["status"] == "approved"


async def test_close_key_can_actually_close(client, db):
    """一頁一件事:進得了結案審核頁的鍵就簽得下去(decisions.md D-08)。"""
    await seed(client, db)
    await make_user(db, username="closer", role="admin", permissions=["aclose"])
    past = (date.today() - timedelta(days=2)).isoformat()
    aid = await submit_activity(client, db, date=past)
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="approved"))
    await db.commit()

    await login(client, "club01")
    await upload_min_photos(client, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text

    # 只持 aclose 就核准得了(原本還要 approve_advisor)
    await login(client, "closer")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/close-approve",
        json={"photos_confirmed": True, "report_confirmed": True, "reflections_confirmed": True},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text


async def test_overdue_close_says_no_permission_instead_of_zero(client, db):
    """看不到 approved 的帳號問「逾期未結案」要拿到 403,不是一個假的 0(ISS-74c)。"""
    await seed(client, db)
    await make_user(db, username="stage_only", role="admin", permissions=["approve_advisor"])
    await login(client, "stage_only")

    resp = await client.get("/api/v1/admin/activities?overdue=true")
    assert resp.status_code == 403, resp.text

    await make_user(db, username="closer2", role="admin", permissions=["aclose"])
    await login(client, "closer2")
    assert (await client.get("/api/v1/admin/activities?overdue=true")).status_code == 200


async def test_review_page_key_lists_every_status(client, db):
    """申請審核頁的鍵看得到全部狀態;只持簽核關卡鍵的帳號視野受限。"""
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
    await upload_min_photos(client, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    await login(client, "advisor")
    # 三項皆必填:省略欄位等於預設全採計,直呼 API 就能繞過整個確認動作
    for partial in ({"photos_confirmed": False, "reflections_confirmed": False}, {}):
        resp = await client.post(
            f"/api/v1/admin/activities/{aid}/close-approve",
            json=partial,
            headers=csrf_headers(client),
        )
        assert resp.status_code == 422

    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/close-approve",
        json={
            "photos_confirmed": False,
            "report_confirmed": True,
            "reflections_confirmed": False,
        },
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
    creator = await club_account(db)
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
    creator = await club_account(db)
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


async def test_overdue_filter_follows_close_lock_days(client, db):
    """逾期清單(SQL)與每列的 close_locked(Python)必須同源:改鎖定天數,兩邊要一起動。"""
    club = await seed(client, db)
    creator = await club_account(db)
    day = date.today() - timedelta(days=45)
    db.add(Activity(
        club_id=club.id, name="45 天前結束", location="x", type="社課或會議",
        date=day, end_date=day, status="approved", created_by=creator.id,
    ))
    await db.commit()

    await login(client, "advisor")
    rows = (await client.get("/api/v1/admin/activities", params={"overdue": "true"})).json()["data"]
    assert [r["close_locked"] for r in rows] == [True]

    db.add(SystemSetting(key="close_lock_days", value=60))
    await db.commit()
    overdue = await client.get("/api/v1/admin/activities", params={"overdue": "true"})
    assert overdue.json()["data"] == []
    rows = (await client.get("/api/v1/admin/activities")).json()["data"]
    assert [r["close_locked"] for r in rows] == [False]


async def test_reviewed_at_field_and_sorting(client, db):
    """reviewed_at=申請+結案簽核紀錄的 max(created_at);排序兩向 NULLS LAST(無審核紀錄殿後)。"""
    from app.models.enums import ApprovalDecision, ApprovalSubject

    club = await seed(client, db)
    creator = await club_account(db)
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

    # 多鍵:reviewed_at 在第二鍵位仍 NULLS LAST(三筆同日期,次鍵決定順序)
    resp = await client.get("/api/v1/admin/activities", params={"sort": "date,-reviewed_at"})
    assert [r["name"] for r in resp.json()["data"]] == ["晚審", "早審", "未審"]

    # 詳情同樣回 reviewed_at(自 approvals 推導)
    detail = (await client.get(f"/api/v1/admin/activities/{late.id}")).json()["data"]
    assert detail["reviewed_at"] == by_name["晚審"]["reviewed_at"]


async def test_large_type_filter_and_locked_boundary(client, db):
    """「大型活動」推導過濾(三值 is_large_approved)與逾期鎖定的日界。"""
    from datetime import date, datetime, timedelta

    # 後端一律以台北日期判定鎖定,本測試卻拿行程時區的 date.today() 當基準 ——
    # conftest 固定 TZ=Asia/Taipei 才對得上。少了它,下面的日界斷言只在
    # 「行程時區與台北同一天」的時段才成立(CI 跑 UTC,每天有 8 小時會翻)
    assert datetime.now().astimezone().utcoffset() == timedelta(hours=8)

    from app.models import Activity
    from app.services.settings_service import get_setting

    club = await seed(client, db)
    creator = await club_account(db)
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
    lock_days = int(await get_setting(db, "close_lock_days"))
    base_today = date.today() - timedelta(days=lock_days)
    base_locked = base_today - timedelta(days=1)
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


async def test_resubmitting_a_rejected_case_voids_the_previous_decision(client, db):
    """退回件重送:逐項核定與總額都得歸零。

    社團可以不編輯直接重送,那條路徑不經 PUT/replace_budget_items;舊值留著的話,
    承辦人送空 body 就能通過「必須逐項核定」的檢核,把上一輪的金額原封不動再核一次。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)

    await login(client, "advisor")
    detail = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]
    await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "fund_source": "學務處經費",
            "budget": [
                {"item_id": i["id"], "approved_subsidy": i["requested_subsidy"]}
                for i in detail["budget_items"]
            ],
        },
        headers=csrf_headers(client),
    )
    # 第一關過後停在組長關,由組長退回
    await login(client, "chief")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/reject",
        json={"reason": "經費不符"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text

    # 不編輯,直接重送
    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text

    assert await db.scalar(sa.select(Activity.school_approved).where(Activity.id == aid)) is None
    remaining = (
        await db.scalars(
            sa.select(ActivityBudgetItem.approved_subsidy).where(
                ActivityBudgetItem.activity_id == aid
            )
        )
    ).all()
    assert set(remaining) == {None}

    # 舊值清掉後,空 body 不再能矇混過「必須逐項核定」
    await login(client, "advisor")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_adjacent_stages_cannot_share_a_signer(client, db):
    """相鄰關卡須不同人。

    列鎖只擋得住同一關被重放;同時持兩個關卡鍵的帳號連按兩次會走完 advisor → chief,
    組長關並非被跳過,而是寫了一筆 actor 相同的紀錄。super 直通那兩關,風險最大。
    """
    await seed(client, db)
    await make_user(
        db,
        username="both",
        role="admin",
        permissions=["approve_advisor", "approve_chief", "areview"],
    )
    await make_user(db, username="root", role="admin", is_super=True)

    for actor in ("both", "root"):
        aid = await submit_activity(client, db)
        await login(client, actor)
        assert (await approve_first_stage(client, aid)).status_code == 200
        resp = await client.post(
            f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
        )
        assert resp.status_code == 403, f"{actor}: {resp.text}"
        assert resp.json()["meta"]["code"] == "SAME_ACTOR"
        assert (
            await db.scalar(sa.select(Activity.status).where(Activity.id == aid))
        ).value == "pending_chief"

    # 換人就能簽
    await login(client, "chief")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["status"] == "pending_dean"


async def test_semester_filter_and_semesters_endpoint(client, db):
    """所有活動/社團活動列表的學期下拉:清單依學期篩,選項只列真的有活動的學期。"""
    club = await seed(client, db)
    other = await make_club(db, name="別社")
    creator = await club_account(db)
    db.add_all([
        Activity(
            club_id=club.id, name="上學期件", location="x", type="社課或會議",
            date=date(2025, 10, 1), end_date=date(2025, 10, 1),
            status="approved", created_by=creator.id,
        ),
        Activity(
            club_id=club.id, name="下學期件", location="x", type="社課或會議",
            date=date(2026, 3, 1), end_date=date(2026, 3, 1),
            status="approved", created_by=creator.id,
        ),
        # 草稿不進審核視野:學期選項也不該因為它多出一個查不到東西的學期
        Activity(
            club_id=club.id, name="草稿件", location="x", type="社課或會議",
            date=date(2020, 9, 1), end_date=date(2020, 9, 1),
            status="draft", created_by=creator.id,
        ),
        Activity(
            club_id=other.id, name="別社的件", location="x", type="社課或會議",
            date=date(2024, 9, 1), end_date=date(2024, 9, 1),
            status="approved", created_by=creator.id,
        ),
    ])
    await db.commit()

    await login(client, "advisor")
    rows = (
        await client.get("/api/v1/admin/activities", params={"semester": "114-1"})
    ).json()["data"]
    assert [r["name"] for r in rows] == ["上學期件"]

    labels = (await client.get("/api/v1/admin/activities/semesters")).json()["data"]
    assert labels == ["114-2", "114-1", "113-1"]  # 新到舊,不含草稿的 109-1

    # club_id 限縮:社團活動列表的下拉只列該社有的學期
    labels = (
        await client.get("/api/v1/admin/activities/semesters", params={"club_id": club.id})
    ).json()["data"]
    assert labels == ["114-2", "114-1"]

    assert (
        await client.get("/api/v1/admin/activities", params={"semester": "亂填"})
    ).status_code == 422


async def test_name_search_and_locked_status_filter(client, db):
    """所有活動的名稱搜尋,以及 status=locked(顯示狀態,與社團端同一份判定)。"""
    club = await seed(client, db)
    creator = await club_account(db)
    old = date.today() - timedelta(days=200)
    db.add_all([
        Activity(
            club_id=club.id, name="迎新宿營", location="x", type="社課或會議",
            date=old, end_date=old, status="approved", created_by=creator.id,
        ),
        Activity(
            club_id=club.id, name="期末成果發表", location="x", type="社課或會議",
            date=date.today() + timedelta(days=3), end_date=date.today() + timedelta(days=3),
            status="approved", created_by=creator.id,
        ),
    ])
    await db.commit()

    await login(client, "advisor")
    rows = (await client.get("/api/v1/admin/activities", params={"q": "宿營"})).json()["data"]
    assert [r["name"] for r in rows] == ["迎新宿營"]

    # LIKE 萬用字元要當字面值:搜「%」不是搜「任何字」
    rows = (await client.get("/api/v1/admin/activities", params={"q": "%"})).json()["data"]
    assert rows == []

    # 已核准且逾期鎖定的列畫面顯示成「已逾期」:status=approved 不該再回它
    rows = (
        await client.get("/api/v1/admin/activities", params={"status": "locked"})
    ).json()["data"]
    assert [r["name"] for r in rows] == ["迎新宿營"]
    rows = (
        await client.get("/api/v1/admin/activities", params={"status": "approved"})
    ).json()["data"]
    assert [r["name"] for r in rows] == ["期末成果發表"]

    assert (
        await client.get("/api/v1/admin/activities", params={"status": "不存在"})
    ).status_code == 422


async def test_budget_and_status_sort_match_the_club_list(client, db):
    """行政端唯讀檢視與社團端是同一張表:同一個欄名點下去要排出同一個順序。

    狀態走流程序(申請中 → 已核准 → 結案中 → 已結案 → 已退回),不是列舉字面值;
    經費走「自籌 + 擬請」合計 —— 行政端原本連 budget 這個排序鍵都沒有。
    """
    club = await seed(client, db)
    creator = await club_account(db)
    day = date.today() + timedelta(days=10)

    def act(name, status, self_fund):
        a = Activity(
            club_id=club.id, name=name, location="x", type="社課或會議",
            date=day, end_date=day, status=status, created_by=creator.id,
        )
        a.budget_items = [
            ActivityBudgetItem(category="雜支", description="", self_fund=self_fund,
                               requested_subsidy=0)
        ]
        return a

    db.add_all([
        act("已退回", "rejected", 300),
        act("已結案", "closed", 100),
        act("申請中", "pending_advisor", 200),
    ])
    await db.commit()

    await login(client, "advisor")
    rows = (
        await client.get("/api/v1/admin/activities", params={"sort": "status"})
    ).json()["data"]
    assert [r["name"] for r in rows] == ["申請中", "已結案", "已退回"]

    rows = (
        await client.get("/api/v1/admin/activities", params={"sort": "budget"})
    ).json()["data"]
    assert [r["name"] for r in rows] == ["已結案", "申請中", "已退回"]


async def test_admin_cannot_read_a_club_draft(client, db):
    """草稿不進行政視野:清單擋了,直接打詳情/PDF 也要擋 —— 否則社團還沒送出的
    企劃內容、經費明細與附件清單,承辦一個 id 就讀得到。"""
    club = await seed(client, db)
    creator = await club_account(db)
    draft = Activity(
        club_id=club.id, name="還在寫", location="x", type="社課或會議",
        date=date.today() + timedelta(days=30), end_date=date.today() + timedelta(days=30),
        status="draft", created_by=creator.id,
    )
    db.add(draft)
    await db.commit()

    await login(client, "advisor")
    assert (await client.get(f"/api/v1/admin/activities/{draft.id}")).status_code == 404
    assert (await client.get(f"/api/v1/admin/activities/{draft.id}/apply-pdf")).status_code == 404
    assert all(
        a["name"] != "還在寫" for a in (await client.get("/api/v1/admin/activities")).json()["data"]
    )


async def test_stamps_stay_on_their_own_stage_after_a_resubmit(client, db):
    """章軌與申請表的三格都讀 stamps:退回重送後承辦人會再核一次。

    把核准列依序排的話,順序是 承辦人 / 承辦人 / 組長,第二次的承辦人就會落在「複核」、
    組長落在「決行」—— 而那三格是要印在送出去的紙上的。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)

    async def approve_first_stage():
        await login(client, "advisor")
        items = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["budget_items"]
        resp = await client.post(
            f"/api/v1/admin/activities/{aid}/approve",
            json={
                "fund_source": "學務處經費",
                "budget": [
                    {"item_id": i["id"], "approved_subsidy": i["requested_subsidy"]} for i in items
                ],
            },
            headers=csrf_headers(client),
        )
        assert resp.status_code == 200, resp.text

    await approve_first_stage()
    await login(client, "chief")
    assert (
        await client.post(
            f"/api/v1/admin/activities/{aid}/reject",
            json={"reason": "經費明細不清"},
            headers=csrf_headers(client),
        )
    ).status_code == 200

    await login(client, "club01")
    assert (
        await client.post(f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client))
    ).status_code == 200
    await approve_first_stage()  # 承辦人第二次核准

    await login(client, "advisor")
    stamps = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["stamps"]
    assert [s["stage"] for s in stamps] == ["advisor"]
    assert stamps[0]["actor_name"] == "advisor"

    await login(client, "chief")
    assert (
        await client.post(
            f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
        )
    ).status_code == 200
    await login(client, "advisor")
    stamps = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["stamps"]
    assert [(s["stage"], s["actor_name"]) for s in stamps] == [
        ("advisor", "advisor"),
        ("chief", "chief"),
    ]


async def test_zero_approval_finishes_the_case_at_that_stage(client, db):
    """核定 0 元 = 不動到學校的錢,後面的關卡沒有東西可審 → 當場核准(D-16)。

    判準是**核定**不是擬請:社團申請了、承辦人決定不給,一樣不必再送組長與學務長。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)  # 有擬請補助

    await login(client, "advisor")
    items = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["budget_items"]
    assert sum(i["requested_subsidy"] for i in items) > 0
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "fund_source": "本案不予補助",
            "budget": [{"item_id": i["id"], "approved_subsidy": 0} for i in items],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "approved"

    # 章軌只會有承辦人一格 —— 組長與學務長永遠不會簽這張單
    stamps = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["stamps"]
    assert [s["stage"] for s in stamps] == ["advisor"]


async def test_partial_zero_still_needs_the_remaining_stages(client, db):
    """只有一項核定 0 不算數:總額還有錢就照走三關。"""
    await seed(client, db)
    aid = await submit_activity(client, db)

    await login(client, "advisor")
    items = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["budget_items"]
    assert len(items) > 1
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "fund_source": "學務處經費",
            "budget": [
                {"item_id": i["id"], "approved_subsidy": 0 if n else i["requested_subsidy"]}
                for n, i in enumerate(items)
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "pending_chief"


async def test_funding_source_is_only_required_when_money_is_granted(client, db):
    """核定 0 元沒有經費來源可認定,不該逼承辦人填一句空話才存得下去(D-16)。

    逐項核定仍然每一項都要填 —— 0 也是核定,None 是「還沒看」,兩者不能混。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)
    await login(client, "advisor")
    items = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["budget_items"]

    # 少填一項 → 擋下(這一條沒有放寬)
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"budget": [{"item_id": items[0]["id"], "approved_subsidy": 0}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "未核定金額" in resp.text

    # 全部核定 0 元、經費來源留空 → 放行
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={"budget": [{"item_id": i["id"], "approved_subsidy": 0} for i in items]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "approved"


async def test_funding_source_still_required_when_money_is_granted(client, db):
    await seed(client, db)
    aid = await submit_activity(client, db)
    await login(client, "advisor")
    items = (await client.get(f"/api/v1/admin/activities/{aid}")).json()["data"]["budget_items"]
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve",
        json={
            "budget": [
                {"item_id": i["id"], "approved_subsidy": i["requested_subsidy"]} for i in items
            ]
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "經費來源" in resp.text


async def test_undecided_items_do_not_count_as_a_zero_grant(client, db):
    """遷移件在組長關卡時逐項核定可能是 NULL(`ApprovedGrant` 可為空)。

    `or 0` 會把「還沒核定」讀成「核定 0 元」,組長一按就跳過學務長直接核准 ——
    缺項的守衛只擋得住第一關,後兩關沒有東西擋。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)
    # 直接落到組長關卡且逐項未核定 —— 模擬遷移件,不經過承辦人那一關
    await db.execute(
        sa.update(Activity).where(Activity.id == aid).values(status="pending_chief")
    )
    await db.execute(
        sa.update(ActivityBudgetItem)
        .where(ActivityBudgetItem.activity_id == aid)
        .values(approved_subsidy=None)
    )
    await db.commit()

    await login(client, "chief")
    resp = await client.post(
        f"/api/v1/admin/activities/{aid}/approve", json={}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "pending_dean"


async def test_submitted_at_is_the_submit_time_not_the_create_time(client, db):
    """待審佇列依送件時間排:七月建的草稿八月才送審,不該排在八月初送件的前面(D-29)。"""
    club = await seed(client, db)
    creator = await club_account(db)
    july = datetime(2026, 7, 1, 9, 0, tzinfo=UTC)
    future = date.today() + timedelta(days=30)

    def row(name: str, status: str) -> Activity:
        return Activity(
            club_id=club.id, name=name, location="x", type="活動",
            date=future, end_date=future,
            start_time=time(9, 0), end_time=time(12, 0),
            staff_text="總召:王小明", participants_in=20, participants_out=0,
            status=status, created_by=creator.id,
        )

    draft = row("七月就建好的草稿", "draft")
    early = row("八月初就送件", "pending_advisor")
    # 遷入的舊列可能沒有送件時間(SetupTime 為 NULL):排序要把它擺最後,不是最前
    legacy = row("舊系統沒留送件時間", "pending_advisor")
    db.add_all([draft, early, legacy])
    await db.commit()
    for r in (draft, early, legacy):
        await db.refresh(r)
    # 兩筆都是七月建的;只有 early 已經送出過
    await db.execute(
        sa.update(Activity)
        .where(Activity.id.in_([draft.id, early.id]))
        .values(created_at=july)
    )
    await db.execute(
        sa.update(Activity)
        .where(Activity.id == early.id)
        .values(submitted_at=datetime(2026, 8, 1, 9, 0, tzinfo=UTC))
    )
    await db.commit()

    # 草稿現在才送審 → 送件時間是現在,排在八月初那筆後面
    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/activities/{draft.id}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text

    await login(client, "advisor")
    data = (
        await client.get("/api/v1/admin/activities", params={"sort": "submitted_at"})
    ).json()["data"]
    assert [a["name"] for a in data] == [
        "八月初就送件",
        "七月就建好的草稿",
        "舊系統沒留送件時間",  # PG 的 ASC 本來就 NULLS LAST
    ]

    # 降冪同樣殿後(NullsLast):PG 的 DESC 預設是 NULLS FIRST,
    # 少了包裝就會把「沒有送件時間」擺到最新送件的前面
    desc = (
        await client.get("/api/v1/admin/activities", params={"sort": "-submitted_at"})
    ).json()["data"]
    assert [a["name"] for a in desc] == [
        "七月就建好的草稿",
        "八月初就送件",
        "舊系統沒留送件時間",
    ]

    rows = {a["name"]: a for a in data}
    assert rows["八月初就送件"]["submitted_at"].startswith("2026-08-01")
    # 送件時間與建立時間是兩件事:這一筆的 created_at 停在七月
    just_sent = rows["七月就建好的草稿"]
    assert just_sent["submitted_at"] is not None
    assert just_sent["created_at"].startswith("2026-07-01")
    assert just_sent["submitted_at"] > "2026-08-01"


async def test_admin_note_is_writable_at_any_stage_and_visible_to_the_club(client, db):
    """審核備註是留給社團看的話,不是第一關的認定 —— 組長也改得動、也清得掉。

    `fund_source` 那條「空值不覆寫」的寫法套過來會讓「清掉備註」按不掉:
    前端送空字串就是要清,省略欄位才是不動。
    """
    await seed(client, db)
    aid = await submit_activity(client, db)
    items_url = f"/api/v1/admin/activities/{aid}"

    await login(client, "advisor")
    items = (await client.get(items_url)).json()["data"]["budget_items"]
    resp = await client.post(
        f"{items_url}/approve",
        json={
            "fund_source": "學務處補助",
            "admin_note": "  核銷單據請於 9/30 前送件  ",
            "budget": [
                {"item_id": i["id"], "approved_subsidy": i["requested_subsidy"]} for i in items
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["admin_note"] == "核銷單據請於 9/30 前送件"

    # 社團端看得到(自己的單)
    await login(client, "club01")
    resp = await client.get(f"/api/v1/club/activities/{aid}")
    assert resp.json()["data"]["admin_note"] == "核銷單據請於 9/30 前送件"

    # 組長:省略欄位=不動
    await login(client, "chief")
    resp = await client.post(f"{items_url}/approve", json={}, headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["admin_note"] == "核銷單據請於 9/30 前送件"

    # 學務長:空字串=清空
    await login(client, "dean")
    resp = await client.post(
        f"{items_url}/approve", json={"admin_note": ""}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["admin_note"] is None
