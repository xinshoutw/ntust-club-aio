"""側欄徽章:各角色的待辦筆數,以及受限管理員看不到的頁面不給數字。"""

from datetime import date, timedelta

from app.models import (
    Activity,
    Equipment,
    EquipmentLoan,
    MaintenanceRequest,
    PostalAccountChange,
    Violation,
)
from tests.conftest import login, make_club, make_user


async def _badges(client) -> dict[str, int]:
    resp = await client.get("/api/v1/badges")
    assert resp.status_code == 200
    return resp.json()["data"]


async def test_club_badges_count_what_waits_on_the_club(client, db):
    club = await make_club(db)
    # 一社一帳號(uq_users_club_id):建立者就是登入的那個社團帳號
    creator = await make_user(db, username="club01", role="club", club_id=club.id)
    past = date.today() - timedelta(days=3)

    db.add_all(
        [
            # 已結束、未鎖定、還沒送結案 → 可結案
            Activity(
                club_id=club.id, name="可結案", location="x", type="活動", date=past,
                end_date=past, status="approved", created_by=creator.id,
            ),
            # 被退回 → 等社團重送
            Activity(
                club_id=club.id, name="被退回", location="x", type="活動", date=past,
                end_date=past, status="rejected", created_by=creator.id,
            ),
            # 已結案 → 不算
            Activity(
                club_id=club.id, name="已結案", location="x", type="活動", date=past,
                end_date=past, status="closed", created_by=creator.id,
            ),
            MaintenanceRequest(club_id=club.id, location="S312", items="燈管損壞"),
            Violation(
                club_id=club.id, occurred_on=past, location="社辦",
                items=["未清潔"], filler_id=creator.id,
            ),
        ]
    )
    await db.commit()
    await login(client, "club01")

    badges = await _badges(client)
    assert badges["act-close"] == 1
    assert badges["act-list"] == 1
    assert badges["maintenance"] == 1  # 一份佐證都沒有 → 要回來補傳
    assert badges["violations"] == 1
    assert badges["postal"] == 0  # 沒有單就是 0,不是缺鍵


async def test_admin_badges_are_limited_to_pages_the_account_can_open(client, db):
    """徽章也是資料量:只持 aviol 的管理員不該知道有幾件待審活動。"""
    club = await make_club(db)
    creator = await make_user(db, username="club02", role="club", club_id=club.id)
    day = date.today() + timedelta(days=10)
    db.add_all(
        [
            Activity(
                club_id=club.id, name="待審", location="x", type="活動", date=day,
                end_date=day, status="pending_advisor", created_by=creator.id,
            ),
            Violation(
                club_id=club.id, occurred_on=date.today(), location="社辦",
                items=["未清潔"], filler_id=creator.id,
            ),
        ]
    )
    await make_user(db, username="adm_viol", role="admin", permissions=["aviol"])
    await db.commit()

    await login(client, "adm_viol")
    badges = await _badges(client)
    assert badges == {"a-violations": 1}


async def test_staff_badges_split_checkout_checkin_and_overdue(client, db):
    club = await make_club(db)
    await make_user(db, username="pt99", role="staff")
    equipment = Equipment(name="麥克風", total_qty=5)
    db.add(equipment)
    await db.commit()
    await db.refresh(equipment)

    today = date.today()
    db.add_all(
        [
            EquipmentLoan(
                club_id=club.id, equipment_id=equipment.id, qty=1, status="approved",
                start_date=today, end_date=today + timedelta(days=2), purpose="社課",
            ),
            EquipmentLoan(
                club_id=club.id, equipment_id=equipment.id, qty=1, status="checked_out",
                start_date=today, end_date=today + timedelta(days=2), purpose="社課",
            ),
            # 結束日遠在過去 → 逾期(同時也還在借出中)
            EquipmentLoan(
                club_id=club.id, equipment_id=equipment.id, qty=1, status="checked_out",
                start_date=today - timedelta(days=30), end_date=today - timedelta(days=20),
                purpose="社課",
            ),
        ]
    )
    await db.commit()
    await login(client, "pt99")

    badges = await _badges(client)
    assert badges["pt-checkout"] == 1
    assert badges["pt-checkin"] == 2  # 逾期的那張也還沒還
    assert badges["pt-overdue"] == 1


async def test_postal_with_an_attachment_stops_asking_for_one(client, db):
    """補傳徽章看的是「有沒有佐證」,不是狀態。"""
    club = await make_club(db)
    user = await make_user(db, username="club03", role="club", club_id=club.id)
    change = PostalAccountChange(club_id=club.id, reasons=["新開戶"])
    db.add(change)
    await db.commit()
    await login(client, "club03")
    assert (await _badges(client))["postal"] == 1

    from app.models import File

    db.add(
        File(
            club_id=club.id, uploaded_by=user.id, subject_type="postal_change",
            subject_id=change.id, slot="passbook", path="x/y.pdf", original_name="y.pdf",
            size=1, sha256="a" * 64, mime="application/pdf",
        )
    )
    await db.commit()
    assert (await _badges(client))["postal"] == 0
