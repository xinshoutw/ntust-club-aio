from datetime import UTC, date, datetime

import sqlalchemy as sa

from app.models import Activity, ActivityBudgetItem, Club
from app.services.pdf import (
    _APPLY_NOTE,
    _apply_footnote,
    _apply_opinion,
    _approved_text,
    _approved_total_text,
    _kai_markup,
    apply_pdf,
    works_text,
)
from tests.conftest import login, make_club, make_user
from tests.test_activities import create_activity


async def test_apply_pdf_does_not_wait_for_close(client, db):
    """申請表在草稿階段就要產得出來,不必等結案。"""
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


def test_apply_pdf_prints_the_submit_time_in_taipei():
    """created_at 是 TIMESTAMPTZ(asyncpg 回 UTC-aware);直接格式化會印成 UTC。

    早上 8 點前送的單子連日期都會退一天,而這張紙是要送出去的。
    """
    activity = Activity(
        name="活動",
        content="",
        location="場地",
        date=date(2026, 3, 1),
        end_date=date(2026, 3, 1),
        participants_in=1,
        participants_out=0,
        staff_text="",
        # 台北 2026/03/01 07:30 = UTC 2026/02/28 23:30
        created_at=datetime(2026, 2, 28, 23, 30, tzinfo=UTC),
        budget_items=[],
    )
    assert _apply_footnote(activity) == "（上網申請時間：2026/03/01 07:30:00）"


def test_apply_pdf_does_not_print_undecided_grants_as_zero():
    """申請表在待審階段就下載得出來;把還沒核定的欄位印成 0,這張紙就說了沒發生的事。

    核定 0 元現在的意思是「承辦人決定不給、當場核准」(D-16),兩者不能長一樣。
    """
    assert _approved_text(None) == "—"
    assert _approved_text(0) == "0"
    assert _approved_text(9000) == "9000"

    def item(v):
        return ActivityBudgetItem(
            category="雜支", self_fund=0, requested_subsidy=1, approved_subsidy=v
        )

    assert _approved_total_text([item(None), item(500)]) == "—"  # 一項未核定 → 合計未知
    assert _approved_total_text([item(0), item(500)]) == "500"
