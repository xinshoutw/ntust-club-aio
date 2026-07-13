"""評鑑資料彙整:從來源表即時推導 scoring 輸入(行政分不落表)。"""

from dataclasses import dataclass
from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.semesters import semester_bounds, semester_of
from app.models import (
    Activity,
    ActivityReflection,
    ActivityReport,
    Club,
    ClubMember,
    EvalAdjustment,
    File,
    SessionAttendance,
    Signup,
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
    club = await db.get(Club, club_id)

    closed_rows = (
        await db.scalars(
            sa.select(Activity).where(
                Activity.club_id == club_id,
                Activity.status == ActivityStatus.CLOSED,
                Activity.date >= window.start,
                Activity.date <= window.end,
            )
        )
    ).all()
    closed = tuple(
        ClosedActivity(
            id=a.id,
            name=a.name,
            date=a.date.strftime("%Y/%m/%d"),
            large=bool(a.is_large and a.is_large_approved),
        )
        for a in closed_rows
    )

    activity_ids = [a.id for a in closed_rows]
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

    results = tuple(
        ActivityResult(
            activity_id=aid,
            photo_count=photo_counts.get(aid, 0),
            has_video_link=bool(reports[aid].video_url) if aid in reports else False,
            has_report=aid in reports,
            has_feedback=reflection_counts.get(aid, 0) > 0,
        )
        for aid in activity_ids
    )

    roster: dict[str, int] = {}
    for label in _window_semesters(window):
        start, end = semester_bounds(label)
        roster[label] = (
            await db.scalar(
                sa.select(sa.func.count()).where(
                    ClubMember.club_id == club_id,
                    ClubMember.updated_at >= start,
                    ClubMember.updated_at < end,
                )
            )
            or 0
        )

    # ad7 負責人會議:該年度場次全出席(且至少一場)才給分
    total_sessions = await db.scalar(
        sa.select(sa.func.count())
        .select_from(SignupItemSession)
        .join(SignupItem, SignupItemSession.item_id == SignupItem.id)
        .where(SignupItem.kind == SignupKind.LEADER_MEETING, SignupItem.year == window.year)
    )
    attended_sessions = await db.scalar(
        sa.select(sa.func.count())
        .select_from(SessionAttendance)
        .join(SignupItemSession, SessionAttendance.session_id == SignupItemSession.id)
        .join(SignupItem, SignupItemSession.item_id == SignupItem.id)
        .where(
            SignupItem.kind == SignupKind.LEADER_MEETING,
            SignupItem.year == window.year,
            SessionAttendance.club_id == club_id,
            SessionAttendance.attended.is_(True),
        )
    )
    leader_meeting = bool(total_sessions) and attended_sessions == total_sessions

    # ad8 幹訓:該年度有派幹部報名參與
    cadre = await db.scalar(
        sa.select(Signup.id)
        .join(SignupItem, Signup.item_id == SignupItem.id)
        .where(
            SignupItem.kind == SignupKind.CADRE_TRAINING,
            SignupItem.year == window.year,
            Signup.club_id == club_id,
        )
        .limit(1)
    )

    violation_count = (
        await db.scalar(
            sa.select(sa.func.count()).where(
                Violation.club_id == club_id,
                Violation.status == ViolationStatus.OPEN,
                Violation.occurred_on >= window.start,
                Violation.occurred_on <= window.end,
            )
        )
        or 0
    )

    merit = 0
    merit_row = await _latest_adjustment(db, club_id, window.year, AdjustmentKind.MERIT_BONUS)
    if merit_row is not None:
        merit = int(merit_row.value.get("score", 0))

    return ScoringInput(
        closed=closed,
        results=results,
        roster_by_semester=roster,
        has_website=bool(club.website_url),
        leader_meeting_attended=leader_meeting,
        cadre_training_attended=cadre is not None,
        violation_count=violation_count,
        merit=merit,
    )


async def _latest_adjustment(
    db: AsyncSession, club_id: int, year: int, kind: AdjustmentKind, key: str | None = None
) -> EvalAdjustment | None:
    query = (
        sa.select(EvalAdjustment)
        .where(
            EvalAdjustment.club_id == club_id,
            EvalAdjustment.year == year,
            EvalAdjustment.kind == kind,
            EvalAdjustment.revoked_at.is_(None),
        )
        .order_by(EvalAdjustment.id.desc())
    )
    if key is not None:
        query = query.where(EvalAdjustment.value["key"].as_string() == key)
    return await db.scalar(query.limit(1))


async def get_overrides(db: AsyncSession, club_id: int, year: int) -> dict[str, float]:
    """行政分逐項調整(admin_score_override):每個 ad key 取最新未註銷值。"""
    rows = await db.scalars(
        sa.select(EvalAdjustment)
        .where(
            EvalAdjustment.club_id == club_id,
            EvalAdjustment.year == year,
            EvalAdjustment.kind == AdjustmentKind.ADMIN_SCORE_OVERRIDE,
            EvalAdjustment.revoked_at.is_(None),
        )
        .order_by(EvalAdjustment.id)
    )
    overrides: dict[str, Any] = {}
    for row in rows:
        key = row.value.get("key")
        if key:
            overrides[key] = row.value.get("score")
    return overrides
