"""核准後沒去領的器材借用:區間一過就由系統撤銷(decisions.md D-40)。

`approved` 原本沒有任何時間軸上的轉移(issues.md 曾記為 ISS-93):核准了沒去領的單永遠壓在
工讀生待借出清單、社團「正在借用」與行政「借用中」,社團取消不了(開始日已過)、逾期追蹤也不認。
撤銷=狀態落 cancelled、`approval_records` 一筆 REVOKE(actor 空=系統)、稽核 role=system、
推 Discord 給該社;全站的佔用判定本來就排除 cancelled,不必逐點重審。

兩個地方各掃一次:點交清單(`GET /staff/equipment-loans?status=approved`)每次載入,
以及 `scripts/send_overdue_reminders.py` 的每日排程(只有上班日)。讀取面**不等掃描**:
待借出清單、`equipment_loan_ongoing_expr` 與徽章都各自帶 `end_date >= today` 的界線,
掃描只負責把庫裡的狀態收乾淨,晚一兩天也沒有任何一頁會列出過期的「已核准」。

**行政手動借用(`club_id` 為空)不掃**:那是學務處自己借,也是舊件補登的入口
(`manual-booking.md`:刻意不擋過去日期),「區間已過」在那裡是常態,不是沒來領。
遷入端對舊系統「已核准且區間已過」的解讀是 `returned`(`cc_import`:當年借了也還了),
與這條規則管的是不同時代的資料,並不衝突。
"""

from dataclasses import dataclass
from datetime import date

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRecord, Club, Equipment, EquipmentLoan
from app.models.enums import ApprovalDecision, ApprovalSubject, LoanStatus
from app.services import audit, notify
from app.services import booking_service as svc

REASON = "借用區間已過，未領取，系統自動撤銷"
TITLE = "器材借用已自動撤銷"  # 與承辦手動撤銷分開講,社團才知道要找誰


@dataclass
class Expired:
    loan_id: int
    club_id: int | None
    has_club: bool  # 社團列還在;不在(或 club_id 空)就推系統 webhook,與 _notify_loan_club 同一條
    webhook: str | None
    desc: str


async def revoke_unclaimed(db: AsyncSession, *, today: date | None = None) -> list[Expired]:
    """把「已核准且結束日已過」的單全部撤銷並 commit;回傳要通知的內容,由呼叫端決定怎麼送。

    一句 UPDATE … RETURNING 完成轉移:同一批單被兩個請求同時掃到,只有先改到的那一個拿得到列,
    簽核紀錄與通知不會重複(READ COMMITTED 下後到的一方等鎖釋放後重算條件,`status` 已變就跳過;
    改成 REPEATABLE READ 的話那一方會變成 serialization error)。結束日當天還算得到領 ——
    與徽章 `pt-checkout` 同一條界線(`end_date >= today` 才算待借出)。
    """
    today = today or svc.today_taipei()
    rows = (
        await db.execute(
            sa.update(EquipmentLoan)
            .where(
                EquipmentLoan.status == LoanStatus.APPROVED,
                EquipmentLoan.end_date < today,
                EquipmentLoan.club_id.is_not(None),  # 手動借用/補登不掃,見模組說明
            )
            .values(status=LoanStatus.CANCELLED)
            .returning(
                EquipmentLoan.id,
                EquipmentLoan.club_id,
                EquipmentLoan.equipment_id,
                EquipmentLoan.qty,
                EquipmentLoan.start_date,
                EquipmentLoan.end_date,
            )
            .execution_options(synchronize_session=False)
        )
    ).all()
    if not rows:
        return []
    equipment = dict(
        (
            await db.execute(
                sa.select(Equipment.id, Equipment.name).where(
                    Equipment.id.in_({r.equipment_id for r in rows})
                )
            )
        ).all()
    )
    club_ids = {r.club_id for r in rows if r.club_id is not None}
    clubs = {c.id: c for c in await db.scalars(sa.select(Club).where(Club.id.in_(club_ids)))}
    out: list[Expired] = []
    for r in rows:
        db.add(
            ApprovalRecord(
                subject_type=ApprovalSubject.EQUIPMENT_LOAN,
                subject_id=r.id,
                stage="single",
                decision=ApprovalDecision.REVOKE,
                actor_id=None,
                reason=REASON,
            )
        )
        audit.record(
            db,
            action="equipment_loan_expired",
            role="system",
            detail=f"equipment_loan={r.id};club={r.club_id};end_date={r.end_date}",
        )
        club = clubs.get(r.club_id) if r.club_id is not None else None
        out.append(
            Expired(
                r.id,
                r.club_id,
                club is not None,
                club.discord_webhook_url if club else None,
                f"{equipment[r.equipment_id]} ×{r.qty}({r.start_date}~{r.end_date}):{REASON}",
            )
        )
    await db.commit()
    return out


async def notify_expired(expired: list[Expired]) -> None:
    """兩個呼叫端共用(端點排進 BackgroundTasks、排程直接 await):
    沒有社團可推(手動借用、社團列已不在)就推系統 webhook(K4b),其餘推該社自設的。"""
    # kind 用 alert:紅色是「退回/拒絕」,沒人審過這張單,同一條逾期線上的
    # 歸還提醒(loan_remind)也是 alert,撤銷沒有理由換色
    for e in expired:
        if e.club_id is None or not e.has_club:
            await notify.discord("alert", TITLE, e.desc)
        else:
            await notify.club_event("alert", TITLE, e.desc, e.webhook)
