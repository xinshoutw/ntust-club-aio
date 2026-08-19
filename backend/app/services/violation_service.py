"""違規勸導的推導規則:銷案期限=開立日 +1 個月,逾期即截止。

期限與截止皆為推導不儲存;期限「當天」仍可銷案,隔日起不再受理(−1 扣分成立)。
"""

from datetime import UTC, date, datetime

import sqlalchemy as sa

from app.core.semesters import TAIPEI
from app.models import Violation

RESOLVE_MONTHS = 1


def add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(
        d.day,
        [
            31,
            29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ][month - 1],
    )
    return date(year, month, day)


def resolve_deadline(v: Violation) -> date:
    """銷案期限:開立日(occurred_on)+1 個月。"""
    return add_months(v.occurred_on, RESOLVE_MONTHS)


def deadline_sql() -> sa.ColumnElement[date]:
    """同一條期限的 SQL 版(逾期篩選在 DB 端算);PG 的 +N month 與 add_months 同樣做月底收斂。"""
    return Violation.occurred_on + sa.func.make_interval(0, RESOLVE_MONTHS)


def today_taipei() -> date:
    return datetime.now(UTC).astimezone(TAIPEI).date()


def resolve_expired(v: Violation, today: date | None = None) -> bool:
    """已截止:僅對未銷案有意義;期限當天仍可銷案。"""
    from app.models.enums import ViolationStatus

    if v.status != ViolationStatus.OPEN:
        return False
    return (today or today_taipei()) > resolve_deadline(v)
