"""側欄徽章:各角色的待辦筆數,以及受限管理員看不到的頁面不給數字。"""

from datetime import UTC, date, datetime, timedelta

from app.models import (
    Activity,
    Equipment,
    EquipmentLoan,
    MaintenanceRequest,
    PostalAccountChange,
    Signup,
    SignupItem,
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


async def test_postal_badge_ignores_statuses_outside_the_flow(client, db):
    """徽章數的是白名單(審核中/處理中),不是「非已完成」。

    值域含幹部證明專用的 declined(D-37),郵局的 API 走不到,但 CHECK 兩張表一起放寬 ——
    手改 DB 或還原備份留下一列,「非已完成」那種寫法就會讓側欄數 1、頁面卻找不到。
    """
    club = await make_club(db)
    await make_user(db, username="club09", role="club", club_id=club.id)
    db.add(PostalAccountChange(club_id=club.id, reasons=["結清銷戶"], status="declined"))
    await db.commit()
    await login(client, "club09")

    assert (await _badges(client))["postal"] == 0


async def test_review_badge_counts_only_the_stages_the_account_can_sign(client, db):
    """徽章=待審佇列的筆數。學務長只有自己那一關;只持頁面鍵的帳號一件也簽不了。"""
    club = await make_club(db)
    creator = await make_user(db, username="club04", role="club", club_id=club.id)
    day = date.today() + timedelta(days=10)
    db.add_all(
        [
            Activity(
                club_id=club.id, name=f"待{stage}", location="x", type="活動", date=day,
                end_date=day, status=status, created_by=creator.id,
            )
            for stage, status in [
                ("承辦", "pending_advisor"),
                ("組長", "pending_chief"),
                ("學務長", "pending_dean"),
            ]
        ]
    )
    await make_user(db, username="dean", role="admin", permissions=["approve_dean"])
    # 權限彈窗只列得出頁面鍵,所以「授了申請審核」的帳號就是這個樣子:看得到、簽不了
    await make_user(db, username="viewer_only", role="admin", permissions=["areview"])
    await make_user(
        db, username="advisor2", role="admin", permissions=["areview", "approve_advisor"]
    )
    await make_user(db, username="boss", role="admin", is_super=True)
    await make_user(
        db, username="boss_dean", role="admin", is_super=True, permissions=["approve_dean"]
    )
    await db.commit()

    await login(client, "dean")
    assert (await _badges(client))["a-review"] == 1
    await login(client, "viewer_only")
    assert (await _badges(client))["a-review"] == 0
    await login(client, "advisor2")
    assert (await _badges(client))["a-review"] == 1
    # super 也不得代簽學務長關:三關裡只算得到前兩關
    await login(client, "boss")
    assert (await _badges(client))["a-review"] == 2
    # 反過來,學務長鍵一到手視野就只剩第三關(D-38),super 也不例外
    await login(client, "boss_dean")
    assert (await _badges(client))["a-review"] == 1


async def test_close_badge_follows_the_dean_view(client, db):
    """學務長視野(D-38)也收結案待審那張表,徽章要跟著 —— 否則側欄 1 筆、點進去 0 筆。"""
    club = await make_club(db)
    creator = await make_user(db, username="club05", role="club", club_id=club.id)
    past = date.today() - timedelta(days=3)
    db.add(
        Activity(
            club_id=club.id, name="承辦單關核准後送結案", location="x", type="活動", date=past,
            end_date=past, status="closing_pending_advisor", created_by=creator.id,
        )
    )
    await make_user(db, username="closer", role="admin", permissions=["aclose"])
    await make_user(
        db, username="closer_dean", role="admin", permissions=["aclose", "approve_dean"]
    )
    await db.commit()

    await login(client, "closer")
    assert (await _badges(client))["a-close"] == 1
    # 這件沒有第三關的簽核列:學務長那頁列不出來,徽章也不得數它
    await login(client, "closer_dean")
    assert (await _badges(client))["a-close"] == 0


async def test_admin_with_the_mirrored_staff_key_gets_the_staff_badges(client, db):
    """工讀生那組頁面在行政端整組再掛了一次(astaff),徽章跟著同一份定義走。

    沒有這條就會出現「頁面掛上去了、側欄的數字永遠是空的」——
    而且 `_may_see` 對沒登記過的 key 會直接 KeyError,整支徽章端點 500。
    """
    club = await make_club(db)
    equipment = Equipment(name="投影機", total_qty=3)
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
                start_date=today - timedelta(days=30), end_date=today - timedelta(days=20),
                purpose="社課",
            ),
        ]
    )
    await make_user(db, username="adm_pt", role="admin", permissions=["astaff"])
    await db.commit()

    await login(client, "adm_pt")
    badges = await _badges(client)
    assert badges["pt-checkout"] == 1
    assert badges["pt-checkin"] == 1
    assert badges["pt-overdue"] == 1
    # 借來的是那一組的鍵,不是行政端逾期追蹤那一頁
    assert "a-overdue" not in badges
    assert "v-my" not in badges


async def test_club_signup_badge_follows_the_signup_window(client, db):
    """報名徽章 = 報名窗開著且本社還沒報名;窗的判定只有 signup_service 一份。"""
    club = await make_club(db)
    creator = await make_user(db, username="club01", role="club", club_id=club.id)
    now = datetime.now(UTC)

    open_item = SignupItem(name="受理中", max_participants=5, created_by=creator.id,
                           signup_start=now - timedelta(days=1))
    signed = SignupItem(name="已報名", max_participants=5, created_by=creator.id,
                        signup_start=now - timedelta(days=1))
    db.add_all([
        open_item,
        signed,
        # 提前關閉 / 窗還沒開 / 窗已過 → 都不算
        SignupItem(name="已關閉", max_participants=5, created_by=creator.id,
                   is_open=False, signup_start=now - timedelta(days=1)),
        SignupItem(name="尚未開始", max_participants=5, created_by=creator.id,
                   signup_start=now + timedelta(days=1)),
        SignupItem(name="已截止", max_participants=5, created_by=creator.id,
                   signup_start=now - timedelta(days=5), signup_end=now - timedelta(days=1)),
    ])
    await db.commit()
    await db.refresh(signed)
    db.add(Signup(item_id=signed.id, club_id=club.id))
    await db.commit()

    await login(client, "club01")
    assert (await _badges(client))["signup"] == 1
