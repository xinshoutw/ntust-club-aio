import time
from datetime import UTC, date, datetime, timedelta

import sqlalchemy as sa

from app.models import Activity, ActivityBudgetItem, ActivityReflection, Club
from app.services.pdf import apply_pdf, reflections_pdf, works_text
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


async def test_apply_pdf_does_not_wait_for_close(client, db):
    """申請表在草稿階段就要產得出來 —— 這正是它與另兩支 PDF 的差別。"""
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    data = await create_activity(client)
    resp = await client.get(f"/api/v1/club/activities/{data['id']}/apply-pdf")
    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 1500

    other = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other.id)
    await login(client, "club02")
    assert (
        await client.get(f"/api/v1/club/activities/{data['id']}/apply-pdf")
    ).status_code == 404


async def test_admin_apply_pdf_follows_detail_visibility(client, db):
    """行政端申請表與詳情同一條界線:社團沒送出的草稿承辦看不到。"""
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    data = await create_activity(client)
    await make_user(db, username="viewer", role="admin", permissions=["aactivity"])
    await login(client, "viewer")
    assert (await client.get(f"/api/v1/admin/activities/{data['id']}/apply-pdf")).status_code == 404

    await db.execute(
        sa.update(Activity).where(Activity.id == data["id"]).values(status="pending_advisor")
    )
    await db.commit()
    resp = await client.get(f"/api/v1/admin/activities/{data['id']}/apply-pdf")
    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")


def test_apply_pdf_renders_every_budget_row():
    """經費逐項是唯一會成長的區塊;跨頁不得掉列,也不得 500。"""
    club = Club(name="測試社")
    activity = Activity(
        name="活動",
        content="內" * 2000,
        location="場地",
        date=date(2026, 3, 1),
        end_date=date(2026, 3, 1),
        participants_in=20,
        participants_out=5,
        staff_text="總務:甲\n美宣:乙",
        created_at=datetime(2026, 2, 1, 9, 30, tzinfo=UTC),
        budget_items=[
            ActivityBudgetItem(
                category="雜支",
                description="說" * 200,
                self_fund=i,
                requested_subsidy=i * 2,
                approved_subsidy=i,
            )
            for i in range(60)
        ],
    )
    out = apply_pdf(club, activity, ["承辦", "組長", "學務長"])
    assert out.startswith(b"%PDF")


def test_works_text_splits_on_the_last_colon():
    """舊系統的項目本身常是「職稱:工作內容」;從第一個冒號拆會把項目切一半。"""
    assert (
        works_text("總務組長:場地與器材:王小明\n沒有負責人\n\n美宣:李小美")
        == "總務組長:場地與器材 > 王小明; 沒有負責人; 美宣 > 李小美"
    )
