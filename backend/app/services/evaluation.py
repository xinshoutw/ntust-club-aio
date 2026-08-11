"""評鑑資料彙整:從來源表即時推導 scoring 輸入(行政分不落表)。"""

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

    results = tuple(
        ActivityResult(
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
    )

    # ad5 名單快照按學期保存(club_members.semester),存在即視為該學期有維護名單
    roster: dict[str, int] = {}
    for label in _window_semesters(window):
        roster[label] = (
            await db.scalar(
                sa.select(sa.func.count()).where(
                    ClubMember.club_id == club_id,
                    ClubMember.semester == label,
                )
            )
            or 0
        )

    # ad7/ad8 皆以管理員活動後登錄之「簽到」為準,僅報名不計分;
    # 採計範圍=場次日期落在評鑑視窗(推導不儲存)
    async def _attended_sessions(kind: SignupKind) -> int:
        return (
            await db.scalar(
                sa.select(sa.func.count())
                .select_from(SessionAttendance)
                .join(SignupItemSession, SessionAttendance.session_id == SignupItemSession.id)
                .join(SignupItem, SignupItemSession.item_id == SignupItem.id)
                .where(
                    SignupItem.kind == kind,
                    SignupItemSession.date >= window.start,
                    SignupItemSession.date <= window.end,
                    SessionAttendance.club_id == club_id,
                    SessionAttendance.attended.is_(True),
                )
            )
            or 0
        )

    # ad7 負責人會議:每場簽到 1.25 分(全學年 4 場滿分,由 scoring 封頂)
    leader_meeting_sessions = await _attended_sessions(SignupKind.LEADER_MEETING)
    # ad8 幹訓:任一場次簽到即滿分
    cadre_attended = await _attended_sessions(SignupKind.CADRE_TRAINING) > 0

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
        leader_meeting_sessions=leader_meeting_sessions,
        cadre_training_attended=cadre_attended,
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
