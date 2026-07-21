"""器材歸還提醒:admin 逾期追蹤(require_super)與 staff 逾期追蹤共用。

自 admin_overdue.remind 抽出(2026-07-21 pt panel);行為不可變:
僅借出中可提醒、audit action=equipment_loan_reminded、Discord + Email 通知。
"""

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import conflict, not_found
from app.models import Club, Equipment, EquipmentLoan, User
from app.models.enums import LoanStatus
from app.services import audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting


async def remind_equipment_loan(
    db: AsyncSession,
    loan_id: int,
    *,
    user: User,
    ip: str | None,
    background: BackgroundTasks,
) -> None:
    """寄送歸還提醒:僅借出中的借用單(逾期與否由操作者在逾期追蹤頁判讀)。

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

    audit.record(
        db,
        action="equipment_loan_reminded",
        user=user,
        detail=f"equipment_loan={loan.id};club={club.id}",
        ip=ip,
    )
    await db.commit()

    title = "器材歸還提醒"
    desc = (
        f"{club.name}:{equipment.name} ×{loan.qty}"
        f"(借用區間 {loan.start_date}~{loan.end_date},"
        f"歸還期限 {deadline:%Y-%m-%d %H:%M}),請儘速辦理歸還點交。"
    )
    background.add_task(notify.club_event, "alert", title, desc, club.discord_webhook_url)
    for addr in (club.contact_emails or []):
        background.add_task(
            notify.send_email, addr, f"【{notify.SYSTEM_NAME}】{title}", desc, "loan_reminder"
        )
