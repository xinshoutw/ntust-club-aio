"""器材歸還提醒:行政/工讀生逾期追蹤頁的手動按鈕與自動排程共用。

手動提醒隨時可按(逾期與否由操作者判讀);排程只寄逾期單,間隔見 `REMIND_EVERY_WORKDAYS`
(decisions.md DEC-11:不設次數上限,寄到歸還為止)。兩條路徑都會更新 `last_reminded_at`,
所以人工剛按過的單不會在幾分鐘後又被排程寄一次。
"""

from datetime import UTC, date, datetime

import sqlalchemy as sa
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import conflict, not_found
from app.core.semesters import TAIPEI
from app.models import Club, Equipment, EquipmentLoan, User
from app.models.enums import LoanStatus
from app.services import audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting

# 仍未歸還者每幾個上班日重寄一次
REMIND_EVERY_WORKDAYS = 3


def _message(club: Club, equipment: Equipment, loan: EquipmentLoan, deadline: datetime) -> str:
    return (
        f"{club.name}:{equipment.name} ×{loan.qty}"
        f"(借用區間 {loan.start_date}~{loan.end_date},"
        f"歸還期限 {deadline:%Y-%m-%d %H:%M}),請儘速辦理歸還點交。"
    )


TITLE = "器材歸還提醒"


async def remind_equipment_loan(
    db: AsyncSession,
    loan_id: int,
    *,
    user: User,
    ip: str | None,
    background: BackgroundTasks,
) -> None:
    """手動提醒:僅借出中的借用單。

    audit 隨交易 commit;通知(Discord + 社團聯絡人 Email)於 commit 後排入背景。
    """
    loan = await db.get(EquipmentLoan, loan_id)
    if loan is None:
        raise not_found("找不到借用申請")
    if loan.status != LoanStatus.CHECKED_OUT:
        raise conflict("此借用單不在借出中狀態")

    return_time = await get_setting(db, "equipment_return_time")
    deadline = await svc.overdue_deadline(db, loan.end_date, return_time)
    equipment = await db.get(Equipment, loan.equipment_id)
    if loan.club_id is None:
        raise conflict("行政手動借用無提醒對象")
    club = await db.get(Club, loan.club_id)

    loan.last_reminded_at = datetime.now(UTC)
    audit.record(
        db,
        action="equipment_loan_reminded",
        user=user,
        detail=f"equipment_loan={loan.id};club={club.id}",
        ip=ip,
    )
    await db.commit()

    desc = _message(club, equipment, loan, deadline)
    background.add_task(notify.club_event, "alert", TITLE, desc, club.discord_webhook_url)
    for addr in club.contact_emails or []:
        background.add_task(
            notify.send_email, addr, f"【{notify.SYSTEM_NAME}】{TITLE}", desc, "loan_reminder"
        )


async def send_due_reminders(db: AsyncSession, *, today: date | None = None) -> list[str]:
    """排程用:寄給所有「已逾期且該再提醒」的借用單,回傳寄出的敘述供 log。

    該再提醒 = 從未提醒過(逾期後的第一封),或距上次提醒已滿 `REMIND_EVERY_WORKDAYS`
    個上班日。與逾期判定共用同一份假日表,所以連假不會白寄。
    """
    today = today or svc.today_taipei()
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)
    now = datetime.now(UTC)

    rows = (
        await db.execute(
            sa.select(EquipmentLoan, Club, Equipment)
            .join(Club, Club.id == EquipmentLoan.club_id)
            .join(Equipment, Equipment.id == EquipmentLoan.equipment_id)
            .where(EquipmentLoan.status == LoanStatus.CHECKED_OUT)
            .order_by(EquipmentLoan.id)
        )
    ).all()

    sent: list[str] = []
    for loan, club, equipment in rows:
        deadline = svc.overdue_deadline_in(loan.end_date, return_time, holidays)
        if now < deadline:
            continue  # 還沒逾期
        last = loan.last_reminded_at
        if last is not None:
            # last_reminded_at 存 UTC,today 是台北日期:不換算則台北凌晨會差一天
            last_local = last.astimezone(TAIPEI).date()
            next_due = svc.add_workdays(last_local, REMIND_EVERY_WORKDAYS, holidays)
            if today < next_due:
                continue  # 還沒到下一次

        desc = _message(club, equipment, loan, deadline)
        await notify.club_event("alert", TITLE, desc, club.discord_webhook_url)
        for addr in club.contact_emails or []:
            await notify.send_email(
                addr, f"【{notify.SYSTEM_NAME}】{TITLE}", desc, "loan_reminder"
            )
        loan.last_reminded_at = now
        audit.record(
            db,
            action="equipment_loan_reminded",
            role="system",
            detail=f"equipment_loan={loan.id};club={club.id};scheduled",
        )
        sent.append(desc)

    await db.commit()
    return sent
