"""逾期歸還提醒的自動排程(decisions.md DEC-11)。

逾期判定成立後寄第一封,之後每 REMIND_EVERY_WORKDAYS 個上班日重寄,寄到歸還為止。
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import Club, Equipment, EquipmentLoan, Holiday
from app.models.enums import LoanStatus
from app.services import loan_remind
from app.services.loan_remind import REMIND_EVERY_WORKDAYS, send_due_reminders
from tests.conftest import make_club


@pytest.fixture(autouse=True)
def _mute_notify(monkeypatch):
    """通知打真的 webhook/SMTP 沒有意義;只記錄呼叫次數。"""
    calls: list[tuple[str, str]] = []

    async def fake_event(kind, title, desc, webhook=None):
        calls.append(("discord", desc))

    async def fake_email(addr, subject, body, kind):
        calls.append(("email", addr))

    monkeypatch.setattr(loan_remind.notify, "club_event", fake_event)
    monkeypatch.setattr(loan_remind.notify, "send_email", fake_email)
    return calls


async def _overdue_loan(db, *, days_ago: int = 5, emails: list[str] | None = None):
    club = await make_club(db, name="登山社")
    club.contact_emails = emails if emails is not None else ["club@mail.ntust.edu.tw"]
    eq = Equipment(name="帳篷", total_qty=10)
    db.add(eq)
    await db.flush()
    today = datetime.now(UTC).date()
    loan = EquipmentLoan(
        club_id=club.id,
        equipment_id=eq.id,
        activity_id=None,
        qty=2,
        start_date=today - timedelta(days=days_ago + 2),
        end_date=today - timedelta(days=days_ago),
        purpose="營隊",
        status=LoanStatus.CHECKED_OUT,
    )
    db.add(loan)
    await db.flush()
    return club, loan


async def test_first_reminder_then_waits_the_interval(db, _mute_notify):
    _, loan = await _overdue_loan(db)

    sent = await send_due_reminders(db)
    assert len(sent) == 1
    assert "帳篷" in sent[0]
    await db.refresh(loan)
    first_at = loan.last_reminded_at
    assert first_at is not None
    # Discord 一則 + 一個聯絡信箱
    assert _mute_notify == [("discord", sent[0]), ("email", "club@mail.ntust.edu.tw")]

    # 同一天再跑不會重寄
    assert await send_due_reminders(db) == []
    await db.refresh(loan)
    assert loan.last_reminded_at == first_at


async def test_resends_after_the_interval(db, _mute_notify):
    _, loan = await _overdue_loan(db)
    await send_due_reminders(db)

    # 把上次提醒往前挪滿間隔:排程照間隔重寄,不看已經寄過幾次
    loan.last_reminded_at = datetime.now(UTC) - timedelta(days=REMIND_EVERY_WORKDAYS + 4)
    await db.flush()
    assert len(await send_due_reminders(db)) == 1


async def test_skips_loans_that_are_not_overdue_yet(db, _mute_notify):
    club = await make_club(db, name="桌遊社")
    eq = Equipment(name="桌遊", total_qty=5)
    db.add(eq)
    await db.flush()
    today = datetime.now(UTC).date()
    db.add(
        EquipmentLoan(
            club_id=club.id,
            equipment_id=eq.id,
            activity_id=None,
            qty=1,
            start_date=today,
            end_date=today + timedelta(days=7),  # 還沒到期
            purpose="社課",
            status=LoanStatus.CHECKED_OUT,
        )
    )
    await db.flush()
    assert await send_due_reminders(db) == []


async def test_skips_returned_loans(db, _mute_notify):
    _, loan = await _overdue_loan(db)
    loan.status = LoanStatus.RETURNED
    await db.flush()
    assert await send_due_reminders(db) == []


async def test_club_without_contact_email_still_gets_the_discord_notice(db, _mute_notify):
    await _overdue_loan(db, emails=[])
    assert len(await send_due_reminders(db)) == 1
    assert [kind for kind, _ in _mute_notify] == ["discord"]


async def test_holidays_push_the_next_reminder_out(db, _mute_notify):
    """間隔算的是上班日:連假期間不會提早重寄。"""
    _, loan = await _overdue_loan(db)
    await send_due_reminders(db)

    last = datetime.now(UTC) - timedelta(days=REMIND_EVERY_WORKDAYS)
    loan.last_reminded_at = last
    # 把上次提醒之後那幾天全設為假日,間隔就還沒走完
    for offset in range(1, REMIND_EVERY_WORKDAYS + 4):
        db.add(Holiday(date=(last + timedelta(days=offset)).date(), name="連假"))
    await db.flush()
    assert await send_due_reminders(db) == []


async def test_manual_reminder_also_stamps_the_time(db, _mute_notify):
    """人工剛按過就不該在幾分鐘後被排程再寄一次。"""
    _, loan = await _overdue_loan(db)
    loan.last_reminded_at = datetime.now(UTC)
    await db.flush()
    assert await send_due_reminders(db) == []


async def test_manual_booking_without_club_is_not_reminded(db, _mute_notify):
    """行政手動借用沒有社團,join 就過濾掉,不會炸也不會亂寄。"""
    eq = Equipment(name="延長線", total_qty=3)
    db.add(eq)
    await db.flush()
    today = datetime.now(UTC).date()
    db.add(
        EquipmentLoan(
            club_id=None,
            equipment_id=eq.id,
            activity_id=None,
            qty=1,
            start_date=today - timedelta(days=9),
            end_date=today - timedelta(days=7),
            purpose="場佈",
            status=LoanStatus.CHECKED_OUT,
        )
    )
    await db.flush()
    assert await send_due_reminders(db) == []
    assert isinstance(await db.get(Club, 1), Club | None)
