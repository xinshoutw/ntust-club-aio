import io
from datetime import UTC, date, datetime

import pytest
import sqlalchemy as sa

from app.core.config import settings
from app.models import (
    Activity,
    ActivityReflection,
    ActivityReport,
    Award,
    AwardRubricItem,
    EvalAdjustment,
    EvalSetting,
    File,
    Violation,
)
from app.models.enums import AdjustmentKind, AwardKind
from tests.conftest import csrf_headers, login, make_club, make_user

EVAL_YEAR = 116  # settings_service DEFAULTS 的評鑑視窗(2026-02-01 ~ 2027-01-31)


@pytest.fixture(autouse=True)
def _tmp_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", tmp_path)


async def setup(client, db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    admin = await make_user(db, username="admin01", role="admin")
    await login(client, "club01")
    return club, user, admin


async def seed_closed_activity(db, club, user, *, day, large=False, photos=0, video=None):
    activity = Activity(
        club_id=club.id,
        name="活動",
        location="活動中心",
        type="活動" if large else "社課",
        is_large=large,
        is_large_approved=large,
        date=day,
        participants_in=10,
        participants_out=0,
        status="closed",
        created_by=user.id,
    )
    db.add(activity)
    await db.flush()
    report = ActivityReport(
        activity_id=activity.id,
        member_count=10,
        non_member_count=0,
        actual_start=datetime(2026, 3, 1, 18, 0).time(),
        actual_end=datetime(2026, 3, 1, 20, 0).time(),
        actual_location="活動中心",
        highlights="x",
        goals="x",
        others="x",
        review_meeting=False,
        video_url=video,
        expense=0,
        submitted_at=datetime.now(UTC),
    )
    db.add(report)
    for i in range(3):
        db.add(ActivityReflection(report_id=activity.id, student_name=f"s{i}", dept="d", body="b"))
    for i in range(photos):
        db.add(
            File(
                club_id=club.id,
                uploaded_by=user.id,
                subject_type="activity",
                subject_id=activity.id,
                slot="report_photo",
                original_name=f"p{i}.jpg",
                size=10,
                mime="image/jpeg",
                sha256=f"hash-{activity.id}-{i}",
                path=f"reports/2026/03/p{i}",
            )
        )
    await db.commit()
    return activity


async def test_overview_scores_from_sources(client, db):
    club, user, admin = await setup(client, db)
    club.website_url = "https://club.example.com"

    await seed_closed_activity(db, club, user, day=date(2026, 3, 1), photos=5)
    await seed_closed_activity(
        db, club, user, day=date(2026, 4, 1), large=True, video="https://youtu.be/x"
    )
    # 視窗外的活動不採計
    await seed_closed_activity(db, club, user, day=date(2025, 12, 1), photos=9)

    staff = await make_user(db, username="staff01", role="staff")
    db.add(
        Violation(
            club_id=club.id,
            occurred_on=date(2026, 5, 1),
            location="x",
            items=["噪音影響他人"],
            filler_id=staff.id,
        )
    )
    db.add(
        EvalAdjustment(
            year=EVAL_YEAR,
            award_id=(await _seed_award(db)).id,
            club_id=club.id,
            kind=AdjustmentKind.MERIT_BONUS,
            value={"score": 3},
            reason="表現優良",
            actor_id=admin.id,
        )
    )
    await db.commit()

    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    scores = {s["key"]: s for s in data["scores"]}
    assert data["year"] == EVAL_YEAR
    assert scores["ad1"]["auto"] == 4  # 一般1 + 大型3(視窗外不計)
    assert scores["ad2"]["auto"] == 4  # 照片5張=1 + 大型影片=3
    assert scores["ad3"]["auto"] == 4  # 成果單 1 + 3
    assert scores["ad4"]["auto"] == 8  # 心得 2 + 6
    assert scores["ad6"]["auto"] == 5  # 有網頁連結
    assert scores["adj"]["auto"] == 2  # +3 優良 −1 違規


async def _seed_award(db) -> Award:
    award = await db.get(Award, "club")
    if award is None:
        award = Award(id="club", name="最佳社團獎", kind=AwardKind.GROUP, is_weighted=True)
        db.add(award)
        await db.commit()
    return award


async def test_override_covers_auto_score(client, db):
    club, user, admin = await setup(client, db)
    award = await _seed_award(db)
    club.website_url = "https://club.example.com"
    db.add(
        EvalAdjustment(
            year=EVAL_YEAR,
            award_id=award.id,
            club_id=club.id,
            kind=AdjustmentKind.ADMIN_SCORE_OVERRIDE,
            value={"key": "ad6", "score": 2},
            reason="網頁內容不完整",
            actor_id=admin.id,
        )
    )
    await db.commit()

    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    ad6 = next(s for s in data["scores"] if s["key"] == "ad6")
    assert ad6["auto"] == 5
    assert ad6["final"] == 2
    assert ad6["overridden"] is True

    # 註銷調整 → 回到自動
    await db.execute(sa.update(EvalAdjustment).values(revoked_at=datetime.now(UTC)))
    await db.commit()
    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    ad6 = next(s for s in data["scores"] if s["key"] == "ad6")
    assert ad6["final"] == 5
    assert ad6["overridden"] is False


async def seed_rubric(db, award_id="club") -> list[AwardRubricItem]:
    items = [
        AwardRubricItem(
            award_id=award_id,
            year=EVAL_YEAR,
            item_key=f"o{i}",
            name=f"營運項目{i}",
            max_score=10,
            sort=i,
        )
        for i in range(1, 4)
    ]
    db.add_all(items)
    await db.commit()
    return items


async def test_award_upload_progress_and_delete(client, db):
    club, user, admin = await setup(client, db)
    await _seed_award(db)
    items = await seed_rubric(db)

    def png(name="doc.png"):
        return {"file": (name, io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16), "image/png")}

    url = f"/api/v1/club/eval/awards/club/items/{items[0].id}/files"
    resp = await client.post(url, files=png(), headers=csrf_headers(client))
    assert resp.status_code == 201
    upload_id = resp.json()["data"]["id"]

    overview = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    club_award = next(a for a in overview["awards"] if a["id"] == "club")
    assert (club_award["filled"], club_award["total"]) == (1, 3)

    detail = (await client.get("/api/v1/club/eval/awards/club")).json()["data"]
    assert len(detail["items"]) == 3
    assert len(detail["items"][0]["uploads"]) == 1

    resp = await client.delete(f"{url}/{upload_id}", headers=csrf_headers(client))
    assert resp.status_code == 200
    detail = (await client.get("/api/v1/club/eval/awards/club")).json()["data"]
    assert detail["items"][0]["uploads"] == []


async def test_upload_locked_by_eval_settings(client, db):
    club, user, admin = await setup(client, db)
    await _seed_award(db)
    items = await seed_rubric(db)
    db.add(EvalSetting(year=EVAL_YEAR, award_id="club", unlocked=False))
    await db.commit()

    files = {"file": ("doc.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16), "image/png")}
    resp = await client.post(
        f"/api/v1/club/eval/awards/club/items/{items[0].id}/files",
        files=files,
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
