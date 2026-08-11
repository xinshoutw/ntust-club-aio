"""評鑑資料彙整:從來源表即時推導 scoring 輸入(行政分不落表)。"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.semesters import semester_of
from app.models import (
    Activity,
    ActivityReflection,
    ActivityReport,
    Club,
    ClubMember,
    EvalAdjustment,
    File,
    SessionAttendance,
    SignupItem,
    SignupItemSession,
    Violation,
)
from app.models.enums import (
    ActivityStatus,
    AdjustmentKind,
    SignupKind,
    ViolationStatus,
)
from app.services.scoring import ActivityResult, ClosedActivity, ScoringInput
from app.services.settings_service import get_setting

# 行政分/加分調整的 advisory lock:一社一把(隨交易釋放)。
# 「註銷舊值 → 新增一筆」不是原子的,兩個並發調整各自看不到對方新增的那列,
# 於是兩筆都留成生效中
_ADJUSTMENT_LOCK_NS = 411004


async def lock_adjustments(db: AsyncSession, club_id: int) -> None:
    await db.execute(
        sa.text("SELECT pg_advisory_xact_lock(:ns, :id)"),
        {"ns": _ADJUSTMENT_LOCK_NS, "id": club_id},
    )


@dataclass(frozen=True)
class EvalWindow:
    year: int
    start: date
    end: date


async def get_eval_window(db: AsyncSession) -> EvalWindow:
    raw = await get_setting(db, "eval_window")
    return EvalWindow(
        year=int(raw["year"]),
        start=date.fromisoformat(raw["start"]),
        end=date.fromisoformat(raw["end"]),
    )


def _window_semesters(window: EvalWindow) -> list[str]:
    labels: list[str] = []
    cursor = window.start
    while cursor <= window.end:
        label = semester_of(cursor)
        if label not in labels:
            labels.append(label)
        # 逐月前進即可涵蓋所有學期
        cursor = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
    return labels


async def gather_scoring_input(db: AsyncSession, club_id: int, window: EvalWindow) -> ScoringInput:
    return (await gather_scoring_inputs(db, [club_id], window))[club_id]


async def gather_scoring_inputs(
    db: AsyncSession, club_ids: Sequence[int], window: EvalWindow
) -> dict[int, ScoringInput]:
    """一批社團一起彙整:每個來源各一次查詢。

    逐社呼叫 gather_scoring_input 會是「社團數 × 十幾次往返」,全校規模等於上千次。
    """
    ids = list(dict.fromkeys(club_ids))
    if not ids:
        return {}

    websites = dict(
        (await db.execute(sa.select(Club.id, Club.website_url).where(Club.id.in_(ids)))).all()
    )

    closed_rows = (
        await db.scalars(
            sa.select(Activity).where(
                Activity.club_id.in_(ids),
                Activity.status == ActivityStatus.CLOSED,
                Activity.date >= window.start,
                Activity.date <= window.end,
            )
        )
    ).all()
    closed: dict[int, list[ClosedActivity]] = {cid: [] for cid in ids}
    activity_ids_of: dict[int, list[int]] = {cid: [] for cid in ids}
    for a in closed_rows:
        closed[a.club_id].append(
            ClosedActivity(
                id=a.id,
                name=a.name,
                date=a.date.strftime("%Y/%m/%d"),
                large=bool(a.is_large and a.is_large_approved),
            )
        )
        activity_ids_of[a.club_id].append(a.id)

    results_of = await _activity_results(db, [a.id for a in closed_rows])
    roster = await _roster_counts(db, ids, window)
    leader_meetings = await _attended_by_club(db, ids, window, SignupKind.LEADER_MEETING)
    cadre = await _attended_by_club(db, ids, window, SignupKind.CADRE_TRAINING)
    violations = await _violation_counts(db, ids, window)
    merits = await _merit_by_club(db, ids, window.year)

    return {
        cid: ScoringInput(
            closed=tuple(closed[cid]),
            results=tuple(results_of[aid] for aid in activity_ids_of[cid]),
            roster_by_semester=roster[cid],
            has_website=bool(websites.get(cid)),
            leader_meeting_sessions=leader_meetings.get(cid, 0),
            cadre_training_attended=cadre.get(cid, 0) > 0,
            violation_count=violations.get(cid, 0),
            merit=merits.get(cid, 0),
        )
        for cid in ids
    }


async def _activity_results(
    db: AsyncSession, activity_ids: Sequence[int]
) -> dict[int, ActivityResult]:
    photo_counts: dict[int, int] = {}
    reports: dict[int, ActivityReport] = {}
    reflection_counts: dict[int, int] = {}
    if activity_ids:
        rows = await db.execute(
            sa.select(File.subject_id, sa.func.count())
            .where(
                File.subject_type == "activity",
                File.slot == "report_photo",
                File.subject_id.in_(activity_ids),
                File.archived_at.is_(None),
            )
            .group_by(File.subject_id)
        )
        photo_counts = dict(rows.all())
        for report in await db.scalars(
            sa.select(ActivityReport).where(ActivityReport.activity_id.in_(activity_ids))
        ):
            reports[report.activity_id] = report
        rows = await db.execute(
            sa.select(ActivityReflection.report_id, sa.func.count())
            .where(ActivityReflection.report_id.in_(activity_ids))
            .group_by(ActivityReflection.report_id)
        )
        reflection_counts = dict(rows.all())

    # 結案審核的繳交確認:未確認之項目以 0 分計(照片確認同時涵蓋影片連結)
    def _confirmed(aid: int, field: str) -> bool:
        # 沒有成果報告表就沒有繳交可言:照片分不得繞過報告表存在與否
        report = reports.get(aid)
        return bool(getattr(report, field)) if report is not None else False

    return {
        aid: ActivityResult(
            activity_id=aid,
            photo_count=photo_counts.get(aid, 0) if _confirmed(aid, "photos_confirmed") else 0,
            has_video_link=(
                bool(reports[aid].video_url)
                if aid in reports and _confirmed(aid, "photos_confirmed")
                else False
            ),
            has_report=aid in reports and _confirmed(aid, "report_confirmed"),
            has_feedback=(
                reflection_counts.get(aid, 0) > 0 and _confirmed(aid, "reflections_confirmed")
            ),
        )
        for aid in activity_ids
    }


async def _roster_counts(
    db: AsyncSession, club_ids: Sequence[int], window: EvalWindow
) -> dict[int, dict[str, int]]:
    """ad5 名單快照按學期保存(club_members.semester),存在即視為該學期有維護名單。"""
    labels = _window_semesters(window)
    roster = {cid: dict.fromkeys(labels, 0) for cid in club_ids}
    rows = await db.execute(
        sa.select(ClubMember.club_id, ClubMember.semester, sa.func.count())
        .where(ClubMember.club_id.in_(club_ids), ClubMember.semester.in_(labels))
        .group_by(ClubMember.club_id, ClubMember.semester)
    )
    for club_id, semester, count in rows.all():
        roster[club_id][semester] = count
    return roster


async def _attended_by_club(
    db: AsyncSession, club_ids: Sequence[int], window: EvalWindow, kind: SignupKind
) -> dict[int, int]:
    """ad7/ad8 皆以管理員活動後登錄之「簽到」為準,僅報名不計分;
    採計範圍=場次日期落在評鑑視窗(推導不儲存)。"""
    rows = await db.execute(
        sa.select(SessionAttendance.club_id, sa.func.count())
        .select_from(SessionAttendance)
        .join(SignupItemSession, SessionAttendance.session_id == SignupItemSession.id)
        .join(SignupItem, SignupItemSession.item_id == SignupItem.id)
        .where(
            SignupItem.kind == kind,
            SignupItemSession.date >= window.start,
            SignupItemSession.date <= window.end,
            SessionAttendance.club_id.in_(club_ids),
            SessionAttendance.attended.is_(True),
        )
        .group_by(SessionAttendance.club_id)
    )
    return dict(rows.all())


async def _violation_counts(
    db: AsyncSession, club_ids: Sequence[int], window: EvalWindow
) -> dict[int, int]:
    rows = await db.execute(
        sa.select(Violation.club_id, sa.func.count())
        .where(
            Violation.club_id.in_(club_ids),
            Violation.status == ViolationStatus.OPEN,
            Violation.occurred_on >= window.start,
            Violation.occurred_on <= window.end,
        )
        .group_by(Violation.club_id)
    )
    return dict(rows.all())


async def _merit_by_club(db: AsyncSession, club_ids: Sequence[int], year: int) -> dict[int, int]:
    """表現優良加分:每社取最新未註銷的一筆(id 升冪掃過,後者覆蓋前者)。"""
    rows = await db.scalars(
        sa.select(EvalAdjustment)
        .where(
            EvalAdjustment.club_id.in_(club_ids),
            EvalAdjustment.year == year,
            EvalAdjustment.kind == AdjustmentKind.MERIT_BONUS,
            EvalAdjustment.revoked_at.is_(None),
        )
        .order_by(EvalAdjustment.id)
    )
    return {row.club_id: int(row.value.get("score", 0)) for row in rows}


async def get_overrides(db: AsyncSession, club_id: int, year: int) -> dict[str, float]:
    """行政分逐項調整(admin_score_override):每個 ad key 取最新未註銷值。"""
    return (await get_overrides_by_club(db, [club_id], year))[club_id]


async def get_overrides_by_club(
    db: AsyncSession, club_ids: Sequence[int], year: int
) -> dict[int, dict[str, float]]:
    ids = list(dict.fromkeys(club_ids))
    if not ids:
        return {}
    rows = await db.scalars(
        sa.select(EvalAdjustment)
        .where(
            EvalAdjustment.club_id.in_(ids),
            EvalAdjustment.year == year,
            EvalAdjustment.kind == AdjustmentKind.ADMIN_SCORE_OVERRIDE,
            EvalAdjustment.revoked_at.is_(None),
        )
        .order_by(EvalAdjustment.id)
    )
    overrides: dict[int, dict[str, Any]] = {cid: {} for cid in ids}
    for row in rows:
        key = row.value.get("key")
        if key:
            overrides[row.club_id][key] = row.value.get("score")
    return overrides
