import io
from datetime import date, timedelta

import pytest
import sqlalchemy as sa

from app.core.config import settings
from app.models import Activity
from tests.conftest import csrf_headers, login, make_club, make_user

JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


@pytest.fixture(autouse=True)
def _tmp_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", tmp_path)


def payload(**overrides) -> dict:
    base = {
        "name": "期末成果展",
        "type": "活動",
        "is_large": False,
        "date": "2026-06-20",
        "start_time": "18:00",
        "end_time": "21:00",
        "location": "學生活動中心",
        "content": "年度成果發表",
        "participants_in": 30,
        "participants_out": 10,
        "staff_text": "總務>陳大文",
        "budget_items": [
            {
                "category": "膳食費",
                "description": "工作人員便當",
                "self_fund": 1000,
                "requested_subsidy": 2000,
            },
            {"category": "印刷費", "description": "海報", "self_fund": 0, "requested_subsidy": 500},
        ],
    }
    return {**base, **overrides}


async def setup_session(client, db, username="club01", name="熱舞社"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


async def create_activity(client, **overrides) -> dict:
    resp = await client.post(
        "/api/v1/club/activities", json=payload(**overrides), headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def approve(db, activity_id: int, **values):
    await db.execute(
        sa.update(Activity).where(Activity.id == activity_id).values(status="approved", **values)
    )
    await db.commit()


def close_payload(**overrides) -> dict:
    base = {
        "member_count": 25,
        "non_member_count": 8,
        "actual_start": "18:10",
        "actual_end": "21:05",
        "actual_location": "學生活動中心",
        "highlights": "成果展演出順利",
        "goals": "展現年度練習成果",
        "others": "無",
        "review_meeting": False,
        "review_date": None,
        "video_url": None,
        "expense": 3200,
        "reflections": [
            {"student_name": f"社員{i}", "dept": "資工三", "body": "收穫很多"} for i in range(3)
        ],
    }
    return {**base, **overrides}


async def test_create_draft_with_budget_and_derived_totals(client, db):
    await setup_session(client, db)
    data = await create_activity(client)
    assert data["status"] == "draft"
    assert data["self_fund_total"] == 1000
    assert data["requested_total"] == 2500
    assert data["semester"] == "114-2"


async def test_validation_rules(client, db):
    await setup_session(client, db)
    bad_time = payload(end_time="17:00")
    resp = await client.post(
        "/api/v1/club/activities", json=bad_time, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 結束日早於開始日 → 422
    bad_range = payload(end_date="2026-06-19")
    resp = await client.post(
        "/api/v1/club/activities", json=bad_range, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    large_course = payload(type="社課", is_large=True)
    resp = await client.post(
        "/api/v1/club/activities", json=large_course, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    bad_category = payload(
        budget_items=[{"category": "灰色支出", "self_fund": 1, "requested_subsidy": 0}]
    )
    resp = await client.post(
        "/api/v1/club/activities", json=bad_category, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_submit_flow_and_edit_guard(client, db):
    await setup_session(client, db)
    data = await create_activity(client)
    aid = data["id"]

    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "pending_advisor"

    # 送審後不可修改/刪除/重複送審
    resp = await client.put(
        f"/api/v1/club/activities/{aid}", json=payload(), headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    resp = await client.delete(f"/api/v1/club/activities/{aid}", headers=csrf_headers(client))
    assert resp.status_code == 409
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 409


async def test_club_scoping(client, db):
    await setup_session(client, db)
    data = await create_activity(client)

    other = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other.id)
    await login(client, "club02")
    resp = await client.get(f"/api/v1/club/activities/{data['id']}")
    assert resp.status_code == 404


async def test_close_requires_approved_and_ended(client, db):
    await setup_session(client, db)
    future = (date.today() + timedelta(days=30)).isoformat()
    data = await create_activity(client, date=future)
    aid = data["id"]

    # 未核准不可結案
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 已核准但未結束
    await approve(db, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert "尚未結束" in resp.json()["error"]


async def test_close_eligibility_and_lock_derive_from_end_date(client, db):
    """起訖區間(2026-07-15):結案資格與逾期鎖定皆以 end_date 推導。"""
    await setup_session(client, db)

    # 開始已過、結束在未來 → 進行中不可結案
    start = (date.today() - timedelta(days=5)).isoformat()
    end = (date.today() + timedelta(days=5)).isoformat()
    data = await create_activity(client, date=start, end_date=end)
    assert data["end_date"] == end
    await approve(db, data["id"])
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert "尚未結束" in resp.json()["error"]

    # 開始日已逾 1 個月但結束日在近期 → 以 end_date 推導,不鎖定、可結案
    start = (date.today() - timedelta(days=70)).isoformat()
    end = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, name="跨日活動", date=start, end_date=end)
    await approve(db, data["id"])
    listing = (await client.get("/api/v1/club/activities")).json()["data"]
    row = next(a for a in listing if a["id"] == data["id"])
    assert row["close_locked"] is False
    assert row["can_close"] is True
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200


async def test_close_submit_and_report(client, db):
    await setup_session(client, db)
    past = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, date=past)
    aid = data["id"]
    await approve(db, aid)

    # 結案草稿寫 DB、跨裝置續填
    resp = await client.put(
        f"/api/v1/club/activities/{aid}/close-draft",
        json={"data": {"highlights": "先寫一半"}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    detail = (await client.get(f"/api/v1/club/activities/{aid}")).json()["data"]
    assert detail["close_draft"] == {"highlights": "先寫一半"}
    assert detail["can_close"] is True

    # 心得不足 3 筆 → 422
    bad = close_payload()
    bad["reflections"] = bad["reflections"][:2]
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close", json=bad, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 檢討會=是 但沒日期 → 422
    bad = close_payload(review_meeting=True)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close", json=bad, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 檢討會=是:日期/與會人數/討論事項/內容決議四欄皆必填(2026-07-15)
    review = {
        "review_meeting": True,
        "review_date": "2026-06-21",
        "review_attendees": 12,
        "review_topics": "動線與器材調度",
        "review_conclusion": "下次提前一週彩排",
    }
    for missing in ("review_attendees", "review_topics", "review_conclusion"):
        bad = close_payload(**{**review, missing: None})
        resp = await client.post(
            f"/api/v1/club/activities/{aid}/close", json=bad, headers=csrf_headers(client)
        )
        assert resp.status_code == 422, missing

    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(**review),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "closing_pending_advisor"

    detail = (await client.get(f"/api/v1/club/activities/{aid}")).json()["data"]
    assert detail["close_draft"] is None  # 送出即清除草稿
    assert detail["report"]["member_count"] == 25
    assert len(detail["report"]["reflections"]) == 3
    assert detail["report"]["review_attendees"] == 12
    assert detail["report"]["review_topics"] == "動線與器材調度"
    assert detail["report"]["review_conclusion"] == "下次提前一週彩排"


async def test_close_locked_after_deadline(client, db):
    await setup_session(client, db)
    stale = (date.today() - timedelta(days=63)).isoformat()  # 超過 1 個月
    data = await create_activity(client, date=stale)
    aid = data["id"]
    await approve(db, aid)

    listing = (await client.get("/api/v1/club/activities")).json()["data"]
    assert listing[0]["close_locked"] is True
    assert listing[0]["can_close"] is False

    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert "鎖定" in resp.json()["error"]

    # 管理員解鎖後可結案
    await approve(db, aid, close_unlocked=True)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200


async def test_photo_upload_dedupe_and_delete(client, db):
    await setup_session(client, db)
    past = (date.today() - timedelta(days=3)).isoformat()
    a1 = await create_activity(client, date=past)
    a2 = await create_activity(client, name="另一活動", date=past)
    await approve(db, a1["id"])
    await approve(db, a2["id"])

    files = {"file": ("photo.jpg", io.BytesIO(JPG), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{a1['id']}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 201
    file_id = resp.json()["data"]["id"]

    # 跨活動同內容 → 擋(SHA-256)
    files = {"file": ("renamed.jpg", io.BytesIO(JPG), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{a2['id']}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    resp = await client.delete(
        f"/api/v1/club/activities/{a1['id']}/photos/{file_id}", headers=csrf_headers(client)
    )
    assert resp.status_code == 200

    # 刪掉後可重傳
    files = {"file": ("photo.jpg", io.BytesIO(JPG), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{a2['id']}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 201


async def test_list_filters_and_sorting(client, db):
    await setup_session(client, db)
    await create_activity(client, name="甲", date="2026-03-01", type="社課")
    await create_activity(client, name="乙", date="2026-04-01", type="活動")
    await create_activity(client, name="丙", date="2025-10-10", type="會議")

    resp = await client.get("/api/v1/club/activities", params={"semester": "114-2"})
    assert resp.json()["meta"]["total"] == 2

    resp = await client.get("/api/v1/club/activities", params={"type": "會議"})
    assert [a["name"] for a in resp.json()["data"]] == ["丙"]

    resp = await client.get("/api/v1/club/activities", params={"sort": "date"})
    assert [a["name"] for a in resp.json()["data"]] == ["丙", "甲", "乙"]

    resp = await client.get("/api/v1/club/activities/semesters")
    assert resp.json()["data"] == ["114-2", "114-1"]


async def test_attachment_total_cap(client, db):
    """附件加總上限(2026-07-16 第八輪):讀 system_settings,超過回 413。"""
    from app.models import SystemSetting

    await setup_session(client, db)
    db.add(SystemSetting(key="activity_attachment_total_mb", value=1))  # 1MB 加總上限
    await db.commit()
    activity = await create_activity(client)
    url = f"/api/v1/club/activities/{activity['id']}/attachments"

    pdf = b"%PDF-1.7 " + b"\x00" * 700_000  # ~0.7MB
    resp = await client.post(
        url, files={"file": ("企劃書.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text

    # 第二份使加總超過 1MB → 413,且不殘留孤兒檔
    resp = await client.post(
        url, files={"file": ("附件2.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 413
    assert resp.json()["meta"]["code"] == "FILE_TOO_LARGE"
    assert "加總" in resp.json()["error"]

    detail = (await client.get(f"/api/v1/club/activities/{activity['id']}")).json()["data"]
    assert len(detail["attachments"]) == 1
    on_disk = [p for p in settings.upload_dir.rglob("*") if p.is_file()]
    assert len(on_disk) == 1  # 超限檔案已清掉
