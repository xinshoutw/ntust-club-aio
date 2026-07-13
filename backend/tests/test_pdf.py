from datetime import date, timedelta

import sqlalchemy as sa

from app.models import Activity
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_activities import close_payload, create_activity


async def _closed_activity(client, db) -> int:
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    past = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, date=past)
    await db.execute(
        sa.update(Activity).where(Activity.id == data["id"]).values(status="approved")
    )
    await db.commit()
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(video_url="https://youtu.be/demo"),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    return data["id"]


async def test_report_pdf_generated_on_download(client, db):
    aid = await _closed_activity(client, db)
    resp = await client.get(f"/api/v1/club/activities/{aid}/report-pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 1500
    assert "成果報告表" in resp.headers["content-disposition"] or "%E6%88%90%E6%9E%9C" in (
        resp.headers["content-disposition"]
    )


async def test_reflections_pdf_generated_on_download(client, db):
    aid = await _closed_activity(client, db)
    resp = await client.get(f"/api/v1/club/activities/{aid}/reflections-pdf")
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 1200


async def test_pdf_handles_maximum_length_content(client, db):
    """合法上限的長文(2000 字欄位、3×5000 字心得)必須能跨頁生成,不得 500。"""
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    past = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, date=past)
    await db.execute(
        sa.update(Activity).where(Activity.id == data["id"]).values(status="approved")
    )
    await db.commit()

    long_text = "很" * 2000
    body = close_payload(
        highlights=long_text,
        goals=long_text,
        others=long_text,
        reflections=[
            {"student_name": f"社員{i}", "dept": "資工三", "body": "感" * 5000} for i in range(3)
        ],
    )
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close", json=body, headers=csrf_headers(client)
    )
    assert resp.status_code == 200

    for path in ("report-pdf", "reflections-pdf"):
        resp = await client.get(f"/api/v1/club/activities/{data['id']}/{path}")
        assert resp.status_code == 200, resp.text
        assert resp.content.startswith(b"%PDF")


async def test_pdf_requires_submitted_report(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    data = await create_activity(client)
    resp = await client.get(f"/api/v1/club/activities/{data['id']}/report-pdf")
    assert resp.status_code == 409


async def test_pdf_scoped_to_own_club(client, db):
    aid = await _closed_activity(client, db)
    other = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other.id)
    await login(client, "club02")
    resp = await client.get(f"/api/v1/club/activities/{aid}/report-pdf")
    assert resp.status_code == 404
