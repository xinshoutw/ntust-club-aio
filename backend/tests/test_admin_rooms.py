"""教室固定借用審核(/admin/room-bookings,權限鍵 aroom):整單擇一核准/退回。"""

import sqlalchemy as sa

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

    # 兩社衝突申請同一時段(週二 3、4 節)+ 一筆已核准
    first = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="社課練習")
    first.slots = [RoomBookingSlot(weekday=2, period="3"), RoomBookingSlot(weekday=2, period="4")]
    second = RoomBookingRequest(club_id=other_club.id, venue_id=venue.id, purpose="樂團練習")
    second.slots = [RoomBookingSlot(weekday=2, period="3")]
    done = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="上學期已核准",
                              status="approved")
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
