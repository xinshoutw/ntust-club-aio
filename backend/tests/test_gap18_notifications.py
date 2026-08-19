"""GAP-18:原本完全不發通知的九個事件(K1–K9)。

需求方 2026-08-18 定案「都發」。這一檔逐事件釘住「有沒有推出去、推的是什麼」——
少一個呼叫點的話承辦頻道會靜靜地漏掉那一類事件,而畫面上完全看不出來。

「活動草稿儲存」刻意不在裡面:同一份活動在填寫過程會產生數十則,會淹掉頻道。
"""

from datetime import UTC, date, datetime, timedelta

import sqlalchemy as sa

from app.models import Announcement, Signup, SignupItem, SignupItemSession
from app.models.enums import ActivityStatus, SignupKind
from app.services import notify
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_bookings import (
    future_tuesday,
    make_activity,
    make_equipment,
    make_venue,
    open_fixed_window,
    setup_session,
)


class Spy:
    """攔下 club_event / discord,記下 (kind, title, description)。"""

    def __init__(self, monkeypatch):
        self.club: list[tuple] = []
        self.system_only: list[tuple] = []

        async def club_event(kind, title, description="", club_webhook=None):
            self.club.append((kind, title, description))

        async def discord(kind, title, description=""):
            self.system_only.append((kind, title, description))

        monkeypatch.setattr(notify, "club_event", club_event)
        monkeypatch.setattr(notify, "discord", discord)

    def titles(self) -> list[str]:
        return [t for _, t, _ in self.club]

    def global_titles(self) -> list[str]:
        return [t for _, t, _ in self.system_only]


async def test_k1_room_booking_self_cancel(client, db, monkeypatch):
    spy = Spy(monkeypatch)
    await setup_session(client, db)
    await open_fixed_window(db)
    venue = await make_venue(db)
    created = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "社課練習",
            "slots": [{"weekday": 2, "period": "3"}, {"weekday": 2, "period": "4"}],
        },
        headers=csrf_headers(client),
    )
    booking_id = created.json()["data"]["id"]
    spy.club.clear()

    resp = await client.post(
        f"/api/v1/club/room-bookings/{booking_id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert spy.titles() == ["固定場地借用已取消"]
    assert "S304 音樂教室(2 個每週時段)" in spy.club[0][2]


async def test_k2_venue_booking_self_cancel(client, db, monkeypatch):
    spy = Spy(monkeypatch)
    club = await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    activity = await make_activity(db, club)
    day = date.today() + timedelta(days=14)
    created = await client.post(
        "/api/v1/club/venue-bookings",
        json={
            "venue_id": venue.id,
            "activity_id": activity.id,
            "date": day.isoformat(),
            "periods": ["3", "4"],
            "purpose": "擺攤",
            "phone": "0912000111",
        },
        headers=csrf_headers(client),
    )
    booking_id = created.json()["data"]["id"]
    spy.club.clear()

    resp = await client.post(
        f"/api/v1/club/venue-bookings/{booking_id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert spy.titles() == ["臨時場地借用已取消"]
    assert f"精誠廣場({day} 時段 3,4)" in spy.club[0][2]


async def test_k3_equipment_loan_self_cancel(client, db, monkeypatch):
    spy = Spy(monkeypatch)
    club = await setup_session(client, db)
    eq = await make_equipment(db, total_qty=5)
    tue = future_tuesday()
    activity = await make_activity(db, club, day=tue, end_day=tue + timedelta(days=2))
    created = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity.id, "qty": 2, "purpose": "營隊",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    loan_id = created.json()["data"]["id"]
    spy.club.clear()

    resp = await client.post(
        f"/api/v1/club/equipment-loans/{loan_id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert spy.titles() == ["器材借用已取消"]
    assert "帳篷 ×2" in spy.club[0][2]


async def test_k4_manual_booking_notifies_the_office_only(client, db, monkeypatch):
    """手動借用沒有社團可推,只推系統 webhook;而它直接就是已核准,場況圖會憑空多一格。"""
    spy = Spy(monkeypatch)
    await make_user(db, username="manual", role="admin", permissions=["amanual", "abooking"])
    await login(client, "manual")
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    day = date.today() + timedelta(days=5)

    resp = await client.post(
        "/api/v1/admin/bookings/manual-venue",
        json={
            "venue_id": venue.id,
            "date": day.isoformat(),
            "periods": ["1", "2"],
            "purpose": "校慶佈置",
            "phone": "0227333141",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    assert spy.global_titles() == ["行政手動借用建立"]
    assert "精誠廣場" in spy.system_only[0][2]
    assert spy.club == []

    # 器材那一半走另一支端點,一樣要推
    spy.system_only.clear()
    eq = await make_equipment(db, total_qty=5)
    loan = await client.post(
        "/api/v1/admin/bookings/manual-equipment",
        json={
            "equipment_id": eq.id,
            "qty": 2,
            "start_date": day.isoformat(),
            "end_date": (day + timedelta(days=1)).isoformat(),
            "purpose": "校慶佈置",
            "phone": "0227333141",
        },
        headers=csrf_headers(client),
    )
    assert loan.status_code == 201, loan.text
    assert spy.global_titles() == ["行政手動借用建立"]
    assert "帳篷 ×2" in spy.system_only[0][2]

    # 撤銷手動借用同樣要推:場況圖少一格而頻道一片安靜的話,K4 的理由反向就不成立
    spy.system_only.clear()
    booking_id = resp.json()["data"]["id"]
    revoked = await client.post(
        f"/api/v1/admin/venue-bookings/{booking_id}/revoke",
        json={"reason": "活動取消"},
        headers=csrf_headers(client),
    )
    assert revoked.status_code == 200, revoked.text
    assert spy.global_titles(), "撤銷手動借用完全沒有通知"
    assert spy.club == []


async def test_k5_attendance_notifies_the_club(client, db, monkeypatch):
    """簽到是行政分 ad7/ad8 的唯一資料源,社團要知道自己這一場被登錄了。"""
    spy = Spy(monkeypatch)
    club = await make_club(db)
    await make_user(db, username="regadmin", role="admin", permissions=["asignup"])
    await login(client, "regadmin")
    now = datetime.now(UTC)
    item = SignupItem(
        name="社團幹訓",
        kind=SignupKind.CADRE_TRAINING,
        event_at=now - timedelta(days=1),
        signup_start=now - timedelta(days=30),
        signup_end=now - timedelta(days=2),
        max_participants=5,
        fields=[],
        created_by=1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    db.add(Signup(item_id=item.id, club_id=club.id, confirmed=True))
    await db.commit()

    resp = await client.put(
        f"/api/v1/admin/signup-items/{item.id}/attendance",
        json={"club_id": club.id, "attended": True},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert spy.titles() == ["報名簽到已登錄"]

    spy.club.clear()
    session_id = await db.scalar(
        sa.select(SignupItemSession.id).where(SignupItemSession.item_id == item.id)
    )
    assert session_id is not None
    resp = await client.put(
        f"/api/v1/admin/signup-items/{item.id}/attendance",
        json={"club_id": club.id, "attended": False},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert spy.titles() == ["報名簽到已取消"]


async def test_backfilled_registration_tells_the_club(client, db, monkeypatch):
    """社團會在「我的報名」看到一筆自己沒送過的紀錄,不說一聲會像是名單不見了。"""
    spy = Spy(monkeypatch)
    club = await make_club(db, name="吉他社")
    await make_user(db, username="regadmin", role="admin", permissions=["asignup"])
    await login(client, "regadmin")
    now = datetime.now(UTC)
    item = SignupItem(
        name="社團負責人會議",
        kind=SignupKind.LEADER_MEETING,
        event_at=now - timedelta(days=1),
        signup_start=now - timedelta(days=30),
        signup_end=now - timedelta(days=2),
        max_participants=5,
        fields=[],
        created_by=1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    resp = await client.post(
        f"/api/v1/admin/signup-items/{item.id}/registrations",
        json={"club_id": club.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    assert spy.titles() == ["學務處已為貴社補登報名"]


async def test_k6_k7_k8_announcement_takeover_and_delete(client, db, monkeypatch):
    """蓋板會擋住每個社團的畫面,開關與刪除都只推系統 webhook。"""
    spy = Spy(monkeypatch)
    await make_user(db, username="announcer", role="admin", permissions=["aannounce"])
    await login(client, "announcer")
    created = await client.post(
        "/api/v1/admin/announcements",
        json={"title": "暑期系統維護公告", "content": "系統將於 7/20 維護。", "notify": False},
        headers=csrf_headers(client),
    )
    assert created.status_code == 201, created.text
    announcement_id = created.json()["data"]["id"]
    spy.system_only.clear()

    future = (date.today() + timedelta(days=30)).isoformat()
    on = await client.patch(
        f"/api/v1/admin/announcements/{announcement_id}",
        json={"takeover_until": future},
        headers=csrf_headers(client),
    )
    assert on.status_code == 200, on.text
    assert spy.global_titles() == ["公告已設為蓋板"]

    # 同值再送一次不重複推:切換才是事件
    spy.system_only.clear()
    await client.patch(
        f"/api/v1/admin/announcements/{announcement_id}",
        json={"takeover_until": future},
        headers=csrf_headers(client),
    )
    assert spy.global_titles() == []

    await client.patch(
        f"/api/v1/admin/announcements/{announcement_id}",
        json={"takeover_until": None},
        headers=csrf_headers(client),
    )
    assert spy.global_titles() == ["公告已取消蓋板"]

    spy.system_only.clear()
    gone = await client.delete(
        f"/api/v1/admin/announcements/{announcement_id}", headers=csrf_headers(client)
    )
    assert gone.status_code == 200
    assert spy.system_only == [("alert", "公告已刪除", "暑期系統維護公告")]
    assert await db.scalar(sa.select(sa.func.count()).select_from(Announcement)) == 0


async def test_k9_activity_draft_deleted(client, db, monkeypatch):
    """草稿刪掉就整份不見(附件一起實體刪除),留一則痕跡。"""
    spy = Spy(monkeypatch)
    club = await setup_session(client, db)
    activity = await make_activity(db, club, name="尚未送出的草稿", status=ActivityStatus.DRAFT)

    resp = await client.delete(
        f"/api/v1/club/activities/{activity.id}", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert spy.club == [("alert", "活動草稿已刪除", f"{club.name}:尚未送出的草稿")]


async def test_attendance_only_announces_on_a_real_flip(client, db, monkeypatch):
    """同值再送一次不是事件(與公告蓋板同一條規則),否則承辦每點一次就多推一則。"""
    spy = Spy(monkeypatch)
    club = await make_club(db)
    await make_user(db, username="regadmin", role="admin", permissions=["asignup"])
    await login(client, "regadmin")
    now = datetime.now(UTC)
    item = SignupItem(
        name="社團幹訓",
        kind=SignupKind.CADRE_TRAINING,
        event_at=now - timedelta(days=1),
        signup_start=now - timedelta(days=30),
        signup_end=now - timedelta(days=2),
        max_participants=5,
        fields=[],
        created_by=1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    db.add(Signup(item_id=item.id, club_id=club.id, confirmed=True))
    await db.commit()

    mark = {"club_id": club.id, "attended": True}
    url = f"/api/v1/admin/signup-items/{item.id}/attendance"
    assert (await client.put(url, json=mark, headers=csrf_headers(client))).status_code == 200
    assert spy.titles() == ["報名簽到已登錄"]
    # 非場次制的預設場次名就是活動名,別把同一個名字印兩次
    assert spy.club[0][2].count(item.name) == 1

    spy.club.clear()
    assert (await client.put(url, json=mark, headers=csrf_headers(client))).status_code == 200
    assert spy.titles() == []


async def test_removing_a_backfill_tells_the_club_too(client, db, monkeypatch):
    """補登通知過一次,撤除是同一件事的反面 —— 名單這次是真的不見了。"""
    spy = Spy(monkeypatch)
    club = await make_club(db, name="吉他社")
    await make_user(db, username="regadmin", role="admin", permissions=["asignup"])
    await login(client, "regadmin")
    now = datetime.now(UTC)
    item = SignupItem(
        name="社團負責人會議",
        kind=SignupKind.LEADER_MEETING,
        event_at=now - timedelta(days=1),
        signup_start=now - timedelta(days=30),
        signup_end=now - timedelta(days=2),
        max_participants=5,
        fields=[],
        created_by=1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    base = f"/api/v1/admin/signup-items/{item.id}/registrations"
    await client.post(base, json={"club_id": club.id}, headers=csrf_headers(client))
    spy.club.clear()

    gone = await client.delete(f"{base}/{club.id}", headers=csrf_headers(client))
    assert gone.status_code == 200, gone.text
    assert spy.titles() == ["學務處已撤除貴社的補登報名"]


async def test_deleting_a_session_says_how_much_attendance_went_with_it(client, db, monkeypatch):
    """刪一個場次會 CASCADE 掉該場次所有社團的簽到,而簽到是行政分 ad7 的唯一資料源。"""
    spy = Spy(monkeypatch)
    club = await make_club(db)
    await make_user(db, username="regadmin", role="admin", permissions=["asignup"])
    await login(client, "regadmin")
    now = datetime.now(UTC)
    item = SignupItem(
        name="社團負責人會議",
        kind=SignupKind.LEADER_MEETING,
        session_based=True,
        event_at=now - timedelta(days=10),
        signup_start=now - timedelta(days=30),
        signup_end=now - timedelta(days=20),
        max_participants=5,
        fields=[],
        created_by=1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    db.add(Signup(item_id=item.id, club_id=club.id, confirmed=True))
    await db.commit()

    base = f"/api/v1/admin/signup-items/{item.id}/sessions"
    made = await client.post(
        base,
        json={"name": "第一場", "date": (date.today() - timedelta(days=3)).isoformat()},
        headers=csrf_headers(client),
    )
    assert made.status_code == 201, made.text
    session_id = made.json()["data"]["id"]
    await client.put(
        f"/api/v1/admin/signup-items/{item.id}/attendance",
        json={"club_id": club.id, "attended": True, "session_id": session_id},
        headers=csrf_headers(client),
    )
    spy.system_only.clear()

    gone = await client.delete(f"{base}/{session_id}", headers=csrf_headers(client))
    assert gone.status_code == 200, gone.text
    assert spy.global_titles() == ["報名場次已刪除"]
    assert "1 筆簽到" in spy.system_only[0][2]
