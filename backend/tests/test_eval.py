import io
from datetime import UTC, date, datetime

import pytest
import sqlalchemy as sa

from app.models import (
    Activity,
    ActivityReflection,
    ActivityReport,
    AuditLog,
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


async def setup(client, db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    admin = await make_user(db, username="admin01", role="admin")
    await login(client, "club01")
    return club, user, admin


async def seed_closed_activity(
    db, club, user, *, day, large=False, photos=0, video=None, with_report=True,
    confirmed=True, reflections=3,
):
    activity = Activity(
        club_id=club.id,
        name="活動",
        location="活動中心",
        type="活動" if large else "社課或會議",
        is_large=large,
        is_large_approved=large,
        date=day,
        end_date=day,
        participants_in=10,
        participants_out=0,
        status="closed",
        created_by=user.id,
    )
    db.add(activity)
    await db.flush()
    report = with_report and ActivityReport(
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
        photos_confirmed=confirmed,
        report_confirmed=confirmed,
        reflections_confirmed=confirmed,
    )
    if report:
        db.add(report)
        for i in range(reflections):
            db.add(
                ActivityReflection(report_id=activity.id, student_name=f"s{i}", dept="d", body="b")
            )
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
    assert scores["ad2"]["auto"] == 4  # 承辦確認照片 1 + 大型 3
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


async def test_ad7_ad8_score_only_by_attendance(client, db):
    """ad7 每場簽到 1.25 分(4 場滿分 5);ad8 幹訓簽到即 5;僅報名不計分。"""
    from datetime import date as date_cls

    from app.models import SessionAttendance, Signup, SignupItem, SignupItemSession

    club, user, admin = await setup(client, db)
    meeting = SignupItem(
        name="社團負責人會議", kind="leader_meeting",
        session_based=True, created_by=admin.id,
    )
    training = SignupItem(
        name="幹部訓練", kind="cadre_training", created_by=admin.id
    )
    db.add_all([meeting, training])
    await db.flush()
    sessions = [
        SignupItemSession(
            item_id=meeting.id, name=f"第{i}場", date=date_cls(2026, 3, i + 1), semester="114-2"
        )
        for i in range(1, 5)
    ]
    t_session = SignupItemSession(
        item_id=training.id, name="幹訓", date=date_cls(2026, 5, 1), semester="114-2"
    )
    db.add_all([*sessions, t_session])
    await db.flush()
    # 僅報名(未簽到)→ 不計分
    db.add_all([
        Signup(item_id=meeting.id, club_id=club.id),
        Signup(item_id=training.id, club_id=club.id),
    ])
    await db.commit()

    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    scores = {s["key"]: s for s in data["scores"]}
    assert scores["ad7"]["auto"] == 0
    assert scores["ad8"]["auto"] == 0

    # 簽到 2 場會議 → 2.5;幹訓簽到 → 5
    now = datetime.now(UTC)
    db.add_all([
        SessionAttendance(
            session_id=s.id, club_id=club.id, attended=True, marked_by=admin.id, marked_at=now
        )
        for s in sessions[:2]
    ])
    db.add(
        SessionAttendance(
            session_id=t_session.id, club_id=club.id, attended=True,
            marked_by=admin.id, marked_at=now,
        )
    )
    await db.commit()

    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    scores = {s["key"]: s for s in data["scores"]}
    assert scores["ad7"]["auto"] == 2.5
    assert scores["ad8"]["auto"] == 5


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
    # 檔案刪了就查不到內容,稽核要留下誰刪了哪個檔
    logged = await db.scalar(
        sa.select(AuditLog.detail).where(AuditLog.action == "eval_file_deleted")
    )
    assert "doc.png" in logged


async def test_eval_upload_dedup_survives_concurrent_sessions(db):
    """先查後寫在兩個獨立 session 併發時會一起通過;唯一索引必須攔下第二筆。"""
    from sqlalchemy.exc import IntegrityError

    from app.core.db import async_session_factory

    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)

    def file_row(i: int, subject_id: int = 1) -> File:
        return File(
            club_id=club.id,
            uploaded_by=user.id,
            subject_type="eval_upload",
            subject_id=subject_id,  # rubric_item_id(逐年唯一)
            slot="o1",
            original_name=f"same{i}.png",
            size=10,
            mime="image/png",
            sha256="same-content-hash",
            path=f"eval/2026/07/x{i}",
        )

    dup_query = sa.select(File.id).where(
        File.club_id == club.id,
        File.subject_type == "eval_upload",
        File.subject_id == 1,
        File.sha256 == "same-content-hash",
        File.archived_at.is_(None),
    )
    async with async_session_factory() as s1, async_session_factory() as s2:
        # 模擬 save_upload 的應用層檢查:兩個 session 都看不到對方未 commit 的列
        assert await s1.scalar(dup_query) is None
        assert await s2.scalar(dup_query) is None

        s1.add(file_row(1))
        await s1.commit()

        s2.add(file_row(2))
        with pytest.raises(IntegrityError):  # API 層由全域 handler 轉 409
            await s2.commit()

    # 逐年唯一:隔年同 item_key(不同 rubric_item_id=subject_id)同內容不受擋
    async with async_session_factory() as s3:
        s3.add(file_row(3, subject_id=2))
        await s3.commit()

    # partial index 僅涵蓋 eval_upload:其他模組同 club/subject/sha 不受限
    async with async_session_factory() as s4:
        other = file_row(4)
        other.subject_type = "maintenance"
        s4.add(other)
        await s4.commit()


async def test_locked_award_files_cannot_be_deleted_via_other_award(client, db):
    club, user, admin = await setup(client, db)
    await _seed_award(db)
    db.add(Award(id="finance", name="最佳財務獎", kind=AwardKind.GROUP))
    await db.commit()
    items = await seed_rubric(db)

    files = {"file": ("doc.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16), "image/png")}
    resp = await client.post(
        f"/api/v1/club/eval/awards/club/items/{items[0].id}/files",
        files=files,
        headers=csrf_headers(client),
    )
    upload_id = resp.json()["data"]["id"]

    # 鎖定最佳社團獎後,不得借道未鎖定的其他獎項路徑刪除其檔案
    db.add(EvalSetting(year=EVAL_YEAR, award_id="club", unlocked=False))
    await db.commit()
    resp = await client.delete(
        f"/api/v1/club/eval/awards/finance/items/{items[0].id}/files/{upload_id}",
        headers=csrf_headers(client),
    )
    assert resp.status_code == 404

    resp = await client.delete(
        f"/api/v1/club/eval/awards/club/items/{items[0].id}/files/{upload_id}",
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409  # 本獎項已鎖


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

    # 詳情要說得出鎖著,社團才不必選完檔才知道
    locked = (await client.get("/api/v1/club/eval/awards/club")).json()["data"]
    assert locked["upload_locked"] is True

    # 無設定列=開放(_upload_locked 的另一半)
    await db.execute(sa.delete(EvalSetting).where(EvalSetting.award_id == "club"))
    await db.commit()
    opened = (await client.get("/api/v1/club/eval/awards/club")).json()["data"]
    assert opened["upload_locked"] is False


async def test_activity_scores_follow_the_reviewer_confirmation(client, db):
    """D-14:ad2–ad4 只看承辦的繳交確認,系統不自己數檔案。

    社團可能是交紙本 —— 一件檔案都沒有但承辦確認過的活動照樣計分;
    反過來,檔案齊全但承辦沒確認的一分都不給。
    """
    club, user, admin = await setup(client, db)
    # 紙本那件:一個照片檔與心得列都沒有,只有承辦的確認
    await seed_closed_activity(db, club, user, day=date(2026, 3, 1), photos=0, reflections=0)
    # 檔案齊全但承辦沒確認
    await seed_closed_activity(db, club, user, day=date(2026, 3, 2), photos=9, confirmed=False)

    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    by_key = {s["key"]: s for s in data["scores"]}
    assert by_key["ad2"]["auto"] == 1  # 紙本那件照樣計;檔案齊全但未確認的不計
    assert by_key["ad3"]["auto"] == 1
    assert by_key["ad4"]["auto"] == 2  # 零心得列也計:承辦確認了就是交了


async def test_photo_score_needs_a_report_row(client, db):
    """無 activity_reports 的已結案活動不得拿 ad2 照片分。

    繳交確認旗標存在 report 上,沒有 report 就沒有「已繳交」可言;先前缺表時
    一律視為已確認,照片分照給,與 ad3「有無報告表」的判定互相矛盾。
    """
    club, user, admin = await setup(client, db)
    await seed_closed_activity(
        db, club, user, day=date(2026, 3, 1), photos=9, with_report=False
    )

    data = (await client.get("/api/v1/club/eval/overview")).json()["data"]
    by_key = {s["key"]: s for s in data["scores"]}
    assert by_key["ad2"]["auto"] == 0
    assert by_key["ad3"]["auto"] == 0
    assert by_key["ad4"]["auto"] == 0
