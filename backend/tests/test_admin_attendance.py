"""報名簽到登錄 API(管理端;評鑑僅採計簽到,活動結束後登錄)。"""

from datetime import date, timedelta

import sqlalchemy as sa

from app.models import SessionAttendance, Signup, SignupItem, SignupItemSession
from tests.conftest import csrf_headers, login, make_club, make_user

YEAR = 116


async def seed(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    admin = await make_user(db, username="regadmin", role="admin", permissions=["areg"])
    await make_user(db, username="other", role="admin", permissions=["aact"])
    await login(client, "regadmin")
    return club, admin


async def make_item(db, admin, *, kind="leader_meeting", session_based=True, event_date=None):
    item = SignupItem(
        year=YEAR,
        name="社團負責人會議" if kind == "leader_meeting" else "幹部訓練",
        kind=kind,
        session_based=session_based,
        event_date=event_date,
        created_by=admin.id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def test_mark_session_attendance_flow(client, db):
    club, admin = await seed(client, db)
    item = await make_item(db, admin)
    past = SignupItemSession(
        item_id=item.id, name="第1場", date=date.today() - timedelta(days=3), semester="114-2"
    )
    future = SignupItemSession(
        item_id=item.id, name="第2場", date=date.today() + timedelta(days=3), semester="114-2"
    )
    db.add_all([past, future])
    db.add(Signup(item_id=item.id, club_id=club.id))
    await db.commit()

    url = f"/api/v1/admin/signup-items/{item.id}/attendance"

    # 場次制未指定場次 → 422
    resp = await client.put(
        url, json={"club_id": club.id, "attended": True}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 活動(場次)尚未結束 → 409
    resp = await client.put(
        url,
        json={"club_id": club.id, "attended": True, "session_id": future.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 已結束場次登錄 → 200,回累計簽到場次
    resp = await client.put(
        url,
        json={"club_id": club.id, "attended": True, "session_id": past.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attended_sessions"] == 1

    # 重複登錄=更新(取消簽到)
    resp = await client.put(
        url,
        json={"club_id": club.id, "attended": False, "session_id": past.id},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["attended_sessions"] == 0
    count = await db.scalar(
        sa.select(sa.func.count()).where(SessionAttendance.session_id == past.id)
    )
    assert count == 1  # upsert,不重複插列


async def test_mark_requires_signup_and_permission(client, db):
    club, admin = await seed(client, db)
    item = await make_item(db, admin)
    session = SignupItemSession(
        item_id=item.id, name="第1場", date=date.today() - timedelta(days=1), semester="114-2"
    )
    db.add(session)
    await db.commit()

    # 未報名的社團 → 409
    resp = await client.put(
        f"/api/v1/admin/signup-items/{item.id}/attendance",
        json={"club_id": club.id, "attended": True, "session_id": session.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 無 areg 權限的管理員 → 403
    db.add(Signup(item_id=item.id, club_id=club.id))
    await db.commit()
    await login(client, "other")
    resp = await client.put(
        f"/api/v1/admin/signup-items/{item.id}/attendance",
        json={"club_id": club.id, "attended": True, "session_id": session.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403


async def test_non_session_item_auto_creates_default_session(client, db):
    """非場次制活動(如幹訓)免帶 session_id,自動建立單一預設場次。"""
    club, admin = await seed(client, db)
    item = await make_item(
        db,
        admin,
        kind="cadre_training",
        session_based=False,
        event_date=date.today() - timedelta(days=2),
    )
    db.add(Signup(item_id=item.id, club_id=club.id))
    await db.commit()

    url = f"/api/v1/admin/signup-items/{item.id}/attendance"
    resp = await client.put(
        url, json={"club_id": club.id, "attended": True}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    session_id = resp.json()["data"]["session_id"]

    # 再次登錄沿用同一場次
    resp = await client.put(
        url, json={"club_id": club.id, "attended": True}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["session_id"] == session_id
    total = await db.scalar(
        sa.select(sa.func.count()).where(SignupItemSession.item_id == item.id)
    )
    assert total == 1
