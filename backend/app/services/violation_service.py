"""違規勸導的推導規則:銷案期限=開立日 +1 個月,逾期即截止。

期限與截止皆為推導不儲存;期限「當天」仍可銷案,隔日起不再受理(−1 扣分成立)。
"""

from datetime import UTC, date, datetime

from app.core.semesters import TAIPEI
from app.models import Violation
from app.services.activity_service import add_months

RESOLVE_MONTHS = 1


def resolve_deadline(v: Violation) -> date:
    """銷案期限:開立日(occurred_on)+1 個月。"""
    return add_months(v.occurred_on, RESOLVE_MONTHS)


def today_taipei() -> date:
    return datetime.now(UTC).astimezone(TAIPEI).date()


def resolve_expired(v: Violation, today: date | None = None) -> bool:
    """已截止:僅對未銷案有意義;期限當天仍可銷案。"""
    from app.models.enums import ViolationStatus

    if v.status != ViolationStatus.OPEN:
        return False
    return (today or today_taipei()) > resolve_deadline(v)
