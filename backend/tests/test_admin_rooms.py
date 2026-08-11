"""教室固定借用審核(/admin/room-bookings,權限鍵 aroom):整單擇一核准/退回。"""

from datetime import date

import sqlalchemy as sa

from app.core.semesters import next_semester_range
from app.models import (
    ApprovalRecord,
    AuditLog,
    RoomBookingRequest,
    RoomBookingSlot,
    Venue,
)
from app.models.enums import ApprovalSubject, VenueCategory
from tests.conftest import csrf_headers, login, make_club, make_user

URL = "/api/v1/admin/room-bookings"


async def seed(client, db):
    club = await make_club(db)
    other_club = await make_club(db, name="吉他社")
    await make_user(db, username="roomadmin", role="admin", permissions=["aroom"])
    await make_user(db, username="other", role="admin", permissions=["aviol"])
    venue = Venue(name="S304 音樂教室", capacity=40, category=VenueCategory.CLASSROOM,
                  allow_fixed=True)
    db.add(venue)
    await db.commit()
    await db.refresh(venue)
    sem_start, sem_end = next_semester_range(date.today())  # 目標學期起訖快照

    # 兩社衝突申請同一時段(週二 3、4 節)+ 一筆已核准
    first = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="社課練習",
                               start_date=sem_start, end_date=sem_end)
    first.slots = [RoomBookingSlot(weekday=2, period="3"), RoomBookingSlot(weekday=2, period="4")]
    second = RoomBookingRequest(club_id=other_club.id, venue_id=venue.id, purpose="樂團練習",
                                start_date=sem_start, end_date=sem_end)
    second.slots = [RoomBookingSlot(weekday=2, period="3")]
    done = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="上學期已核准",
                              status="approved", start_date=sem_start, end_date=sem_end)
    done.slots = [RoomBookingSlot(weekday=5, period="1")]
    db.add_all([first, second, done])
    await db.commit()
    for row in (first, second, done):
        await db.refresh(row)
    await login(client, "roomadmin")
    return first, second, done


async def test_permission_gate(client, db):
    first, _, _ = await seed(client, db)
    await login(client, "other")
    assert (await client.get(URL)).status_code == 403
    resp = await client.post(f"{URL}/{first.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 403
    resp = await client.post(
        f"{URL}/{first.id}/reject", json={"reason": "x"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403


async def test_admin_fixed_window(client, db):
    """開放窗查詢(側欄反灰用):一般 admin 即可讀(不綁 aroom);社團帳號不可用。"""
    await seed(client, db)

    # 無 aroom 的管理員也讀得到(側欄要用)
    await login(client, "other")
    window = (await client.get(f"{URL}/window")).json()["data"]
    assert window == {"open": False, "open_from": None, "open_until": None}

    # 設定開放區間後反映開放狀態
    from datetime import timedelta

    from app.models import SystemSetting

    today = date.today()
    db.add(
        SystemSetting(
            key="fixed_booking_window",
            value={
                "open_from": (today - timedelta(days=1)).isoformat(),
                "open_until": (today + timedelta(days=7)).isoformat(),
            },
        )
    )
    await db.commit()
    window = (await client.get(f"{URL}/window")).json()["data"]
    assert window["open"] is True
    assert window["open_from"] == (today - timedelta(days=1)).isoformat()

    # 社團帳號 → 403
    club = await make_club(db, name="第三社")
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    assert (await client.get(f"{URL}/window")).status_code == 403


async def test_list_with_weekly_slots(client, db):
    first, second, done = await seed(client, db)

    body = (await client.get(URL)).json()
    assert body["meta"]["total"] == 3
    data = body["data"]
    # 預設:待審佇列在前(送件早在前)
    assert [d["status"] for d in data] == ["pending", "pending", "approved"]
    assert data[0]["club_name"] == "熱舞社"
    assert data[0]["venue_name"] == "S304 音樂教室"
    assert data[0]["purpose"] == "社課練習"
    assert data[0]["slots"] == [{"weekday": 2, "period": "3"}, {"weekday": 2, "period": "4"}]

    rows = (await client.get(URL, params={"status": "pending"})).json()["data"]
    assert [d["id"] for d in rows] == [first.id, second.id]
    rows = (await client.get(URL, params={"club_id": second.club_id})).json()["data"]
    assert [d["purpose"] for d in rows] == ["樂團練習"]

    assert (await client.get(URL, params={"sort": "-created_at"})).status_code == 200
    assert (await client.get(URL, params={"sort": "hack"})).status_code == 422


async def test_list_active_filters_out_finished_terms(client, db):
    """衝突標示只需要還佔著時段的已核准單:學期已結束的不必抓回前端。"""
    first, _, done = await seed(client, db)
    old = RoomBookingRequest(
        club_id=first.club_id, venue_id=done.venue_id, purpose="去年的社課",
        status="approved", start_date=date(2024, 2, 1), end_date=date(2024, 7, 31),
    )
    old.slots = [RoomBookingSlot(weekday=5, period="1")]
    db.add(old)
    await db.commit()
    await db.refresh(old)

    rows = (await client.get(URL, params={"status": "approved", "active": True})).json()["data"]
    assert [d["id"] for d in rows] == [done.id]
    rows = (await client.get(URL, params={"status": "approved", "active": False})).json()["data"]
    assert [d["id"] for d in rows] == [old.id]


async def test_approve_and_reject_whole_request(client, db):
    first, second, done = await seed(client, db)

    # 衝突整單擇一:核准 first、退回 second(退回原因必填)
    resp = await client.post(f"{URL}/{first.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "approved"
    assert len(resp.json()["data"]["slots"]) == 2

    resp = await client.post(
        f"{URL}/{second.id}/reject", json={"reason": ""}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    resp = await client.post(
        f"{URL}/{second.id}/reject",
        json={"reason": "與熱舞社時段衝突,本學期優先排予熱舞社"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    await db.refresh(second)
    assert second.status == "rejected"

    # 非待審不可再審
    resp = await client.post(f"{URL}/{first.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 409
    resp = await client.post(
        f"{URL}/{done.id}/reject", json={"reason": "x"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert (
        await client.post(f"{URL}/99999/approve", headers=csrf_headers(client))
    ).status_code == 404

    records = (
        await db.scalars(
            sa.select(ApprovalRecord).where(
                ApprovalRecord.subject_type == ApprovalSubject.ROOM_BOOKING
            )
        )
    ).all()
    assert {(r.subject_id, r.decision.value) for r in records} == {
        (first.id, "approve"),
        (second.id, "reject"),
    }
    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert {"room_booking_approved", "room_booking_rejected"} <= actions


async def test_room_approve_blocks_approved_overlap(client, db):
    """核准 first 後,slots 重疊且同目標學期的 second 不可再核准(2026-07-17 第十二輪)。"""
    first, second, _ = await seed(client, db)

    resp = await client.post(f"{URL}/{first.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 200

    resp = await client.post(f"{URL}/{second.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "SLOT_TAKEN"


async def test_revoke_frees_the_slot_and_the_quota(client, db):
    """已核准的固定借用要撤得掉。

    開始日是學期起日,學期一開就社團取消不了、行政也沒端點 —— 教室時段與該社 10 節
    額度整學期鎖死。撤銷落 cancelled,額度判定本來就排除它,額度自動回歸。
    """
    first, _, done = await seed(client, db)

    # 已核准單佔著週五第 1 節,同時段的新申請核准不了
    clash = RoomBookingRequest(
        club_id=first.club_id,
        venue_id=done.venue_id,
        purpose="想借同一格",
        start_date=done.start_date,
        end_date=done.end_date,
    )
    clash.slots = [RoomBookingSlot(weekday=5, period="1")]
    db.add(clash)
    await db.commit()
    await db.refresh(clash)
    resp = await client.post(f"{URL}/{clash.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 409

    # 撤銷必填原因
    assert (
        await client.post(f"{URL}/{done.id}/revoke", json={}, headers=csrf_headers(client))
    ).status_code == 422

    resp = await client.post(
        f"{URL}/{done.id}/revoke", json={"reason": "誤核"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert (
        await db.scalar(
            sa.select(RoomBookingRequest.status).where(RoomBookingRequest.id == done.id)
        )
    ).value == "cancelled"
    assert await db.scalar(
        sa.select(ApprovalRecord.id).where(
            ApprovalRecord.subject_type == ApprovalSubject.ROOM_BOOKING,
            ApprovalRecord.subject_id == done.id,
            ApprovalRecord.decision == "revoke",
        )
    ) is not None
    assert await db.scalar(
        sa.select(AuditLog.id).where(AuditLog.action == "room_booking_revoked")
    ) is not None

    # 格子空出來了
    resp = await client.post(f"{URL}/{clash.id}/approve", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text

    # 待審單與已撤銷單都不能再撤
    assert (
        await client.post(
            f"{URL}/{first.id}/revoke", json={"reason": "x"}, headers=csrf_headers(client)
        )
    ).status_code == 409
    assert (
        await client.post(
            f"{URL}/{done.id}/revoke", json={"reason": "x"}, headers=csrf_headers(client)
        )
    ).status_code == 409
