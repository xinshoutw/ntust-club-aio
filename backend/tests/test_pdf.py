import time
from datetime import UTC, date, datetime, timedelta

import sqlalchemy as sa

from app.models import Activity, ActivityBudgetItem, ActivityReflection, Club
from app.services.pdf import (
    _APPLY_NOTE,
    _apply_opinion,
    _kai_markup,
    apply_pdf,
    reflections_pdf,
    works_text,
)
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


def test_apply_pdf_falls_back_for_glyphs_kai_lacks():
    """標楷體只有 14k 字:中點「・」與拉丁重音字母沒有,整格不能因此變豆腐。"""
    markup = _kai_markup("拾穗・十歲 café")
    assert '<font name="NotoSansTC">・</font>' in markup
    assert '<font name="NotoSansTC">é</font>' in markup
    assert "拾穗" in markup and "十歲" in markup


def test_apply_pdf_opinion_always_carries_the_close_report_notice():
    """經費來源可能是空的(沒申請經費);結報提醒不論如何都要在意見回饋裡。"""
    def opinion_of(fund_source: str | None) -> str:
        activity = Activity(
            name="活動",
            content="",
            location="場地",
            date=date(2026, 3, 1),
            end_date=date(2026, 3, 1),
            participants_in=1,
            participants_out=0,
            staff_text="",
            fund_source=fund_source,
            created_at=datetime(2026, 2, 1, 9, 30, tzinfo=UTC),
            budget_items=[],
        )
        return _apply_opinion(activity)

    assert opinion_of(None) == _APPLY_NOTE
    assert opinion_of("   ") == _APPLY_NOTE
    assert opinion_of("由三校文化基金會支應") == f"由三校文化基金會支應\n{_APPLY_NOTE}"


async def test_approver_names_fill_stages_not_the_first_three_approvals(client, db):
    """退回是回到社團重送,重送後承辦人會再核一次 —— 核准列變成
    承辦人/承辦人/組長/學務長。依序取前三筆會把第二次的承辦人印在「複核」、
    組長印在「決行」,而那張紙是要送出去的。"""
    from app.models import ApprovalRecord
    from app.services.activity_service import approver_names

    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    activity_id = (await create_activity(client))["id"]

    signed = [
        ("初核甲", "advisor"), ("初核乙", "advisor"), ("組長", "chief"), ("學務長", "dean"),
    ]
    for i, (name, stage) in enumerate(signed):
        user = await make_user(db, username=f"u{i}_{stage}", role="admin", name=name)
        db.add(
            ApprovalRecord(
                subject_type="activity",
                subject_id=activity_id,
                stage=stage,
                decision="approve",
                actor_id=user.id,
            )
        )
    await db.commit()

    assert await approver_names(db, activity_id) == ["初核乙", "組長", "學務長"]


async def test_approver_names_leave_unsigned_stages_blank(client, db):
    """只簽到第一關的活動,複核/決行兩格要是空的,不能往前擠。"""
    from app.models import ApprovalRecord
    from app.services.activity_service import approver_names

    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    activity_id = (await create_activity(client))["id"]
    admin = await make_user(db, username="adm", role="admin", name="承辦人")
    db.add(
        ApprovalRecord(
            subject_type="activity",
            subject_id=activity_id,
            stage="advisor",
            decision="approve",
            actor_id=admin.id,
        )
    )
    await db.commit()

    assert await approver_names(db, activity_id) == ["承辦人", "", ""]
