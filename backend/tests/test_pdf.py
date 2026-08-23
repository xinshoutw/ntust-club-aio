import time
from datetime import date, timedelta

import sqlalchemy as sa

from app.models import Activity, ActivityReflection, Club
from app.services.pdf import reflections_pdf
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_activities import close_payload, create_activity, upload_photo


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
    await upload_photo(client, data["id"])
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

    await upload_photo(client, data["id"])
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


async def test_admin_can_download_the_same_two_pdfs(client, db):
    """行政端唯讀檢視的結案檔案:社團端那兩支綁 club_id,承辦要有自己的入口。"""
    aid = await _closed_activity(client, db)
    await make_user(db, username="viewer", role="admin", permissions=["aactivity"])
    await login(client, "viewer")
    for path in ("report-pdf", "reflections-pdf"):
        resp = await client.get(f"/api/v1/admin/activities/{aid}/{path}")
        assert resp.status_code == 200, resp.text
        assert resp.content.startswith(b"%PDF")

    # 沒有活動視野的管理員一樣進不來(路由的 Reviewer 閘門)
    await make_user(db, username="stranger", role="admin", permissions=["aviol"])
    await login(client, "stranger")
    assert (await client.get(f"/api/v1/admin/activities/{aid}/report-pdf")).status_code == 403


def test_reflections_pdf_stays_linear_at_the_legal_maximum():
    """100 篇 × 5000 字是 schema 容許的上限。

    心得曾塞在表格單元格內,reportlab 每次分頁重算整張表 → O(n²),這個輸入要 5 分鐘
    CPU,少量並行就整站無回應。改走 frame 流排後約 2 秒;門檻留 15 倍餘裕。
    """
    club = Club(name="測試社")
    activity = Activity(name="活動", date=date(2026, 3, 1), staff_text="")
    reflections = [
        ActivityReflection(student_name=f"社員{i}", dept="資工三", body="感" * 5000)
        for i in range(100)
    ]
    started = time.perf_counter()
    out = reflections_pdf(club, activity, reflections)
    assert out.startswith(b"%PDF")
    assert time.perf_counter() - started < 30
