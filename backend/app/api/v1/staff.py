"""工讀生端(role=staff;前端 /pt):違規勸導開立/查詢、器材借出/歸還點交、逾期追蹤。

- 違規:開立(填寫人=登入工讀生)+ 唯讀列表;列表形狀/排序/白名單沿用行政端違規管理
- 器材點交:approved → checked_out(依序點交逐件登記序號)→ returned;
  逾期=推導(checked_out 且過了結束日之隔天上班日 10:30),?status=overdue SQL 門檻篩選
- 提醒與行政端共用 services.loan_remind(audit action 同名)
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.api.pagination import Pagination, parse_sort
from app.api.v1.admin_violations import _FILLER, _SORTABLE, _to_out
from app.core.deps import CurrentUser, DbDep, client_ip, require_staff
from app.core.errors import conflict, not_found, validation_error
from app.models import Club, Equipment, EquipmentLoan, Violation
from app.models.enums import LoanStatus, ViolationStatus
from app.schemas.admin import AdminViolationOut
from app.schemas.common import ApiResponse
from app.schemas.staff import (
    CheckinIn,
    CheckoutIn,
    StaffClubOut,
    StaffEquipmentLoanOut,
    ViolationFileIn,
)
from app.services import audit, loan_remind, notify, violation_service
from app.services import booking_service as svc
from app.services.settings_service import get_setting

router = APIRouter(prefix="/staff", tags=["staff"])

StaffUser = Annotated[CurrentUser, Depends(require_staff)]

StaffLoanStatus = Literal["approved", "checked_out", "overdue"]


# ---- 基礎資料(違規開立下拉) ----


@router.get("/clubs")
async def list_clubs(user: StaffUser, db: DbDep) -> ApiResponse[list[StaffClubOut]]:
    """全部社團(含停用;違規對象可能是已停社的舊社團),名稱排序、不分頁。"""
    rows = await db.scalars(sa.select(Club).order_by(Club.name, Club.id))
    return ApiResponse(data=[StaffClubOut.model_validate(c) for c in rows])


@router.get("/violation-items")
async def list_violation_items(user: StaffUser, db: DbDep) -> ApiResponse[list[str]]:
    """違規項目目錄(system_settings violation_items;行政可調)。"""
    return ApiResponse(data=await get_setting(db, "violation_items"))


# ---- 違規勸導 ----


@router.post("/violations", status_code=201)
async def file_violation(
    body: ViolationFileIn,
    user: StaffUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminViolationOut]:
    """開立違規勸導:填寫人=登入工讀生;項目須為目錄子集、發生日不可未來。"""
    today = violation_service.today_taipei()
    if body.occurred_on > today:
        raise validation_error("發生日期不可晚於今天")
    club = await db.get(Club, body.club_id)
    if club is None:
        raise not_found("找不到社團")
    catalog = await get_setting(db, "violation_items")
    unknown = [item for item in body.items if item not in catalog]
    if unknown:
        raise validation_error(f"違規項目不在目錄中:{'、'.join(unknown)}")

    violation = Violation(
        club_id=club.id,
        occurred_on=body.occurred_on,
        location=body.location,
        items=body.items,
        other=body.other,
        filler_id=user.id,
    )
    db.add(violation)
    await db.flush()
    audit.record(
        db,
        action="violation_filed",
        user=user,
        detail=f"violation={violation.id};club={club.id}",
        ip=client_ip(request),
    )
    await db.commit()

    background.add_task(
        notify.club_event,
        "alert",
        "違規勸導開立",
        f"{club.name}:{violation.occurred_on} {violation.location}"
        f"({'、'.join(violation.items)}),請於 "
        f"{violation_service.resolve_deadline(violation)} 前完成銷案。",
        club.discord_webhook_url,
    )
    return ApiResponse(data=_to_out(violation, club.name, user.name, today))


@router.get("/violations")
async def list_violations(
    user: StaffUser,
    db: DbDep,
    page: Pagination,
    sort: str | None = None,
) -> ApiResponse[list[AdminViolationOut]]:
    """違規紀錄查詢(唯讀;銷案動作屬行政端):形狀/排序白名單沿用 /admin/violations。"""
    query = (
        sa.select(Violation, Club.name, _FILLER.name)
        .join(Club, Violation.club_id == Club.id)
        .join(_FILLER, Violation.filler_id == _FILLER.id)
    )
    if sort:
        query = query.order_by(*parse_sort(sort, _SORTABLE, None), Violation.id)
    else:
        # 預設排序:未銷案在前,各組內時間升冪(與行政端一致)
        open_first = sa.case((Violation.status == ViolationStatus.OPEN, 0), else_=1)
        query = query.order_by(open_first, Violation.occurred_on.asc(), Violation.id)

    today = violation_service.today_taipei()
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = [_to_out(v, club_name, filler_name, today) for v, club_name, filler_name in rows]
    return ApiResponse(data=data, meta=page.meta(total or 0))


# ---- 器材點交與逾期追蹤 ----


def _loan_out(
    loan: EquipmentLoan,
    club_name: str | None,
    equipment: Equipment,
    return_time: str,
    holidays: set,
) -> StaffEquipmentLoanOut:
    out = StaffEquipmentLoanOut.model_validate(loan)
    out.club_name = club_name  # None=行政手動借用(前端顯示「學務處」)
    out.equipment_name = equipment.name
    out.needs_serial = equipment.needs_serial
    out.overdue = svc.is_overdue_in(loan, return_time, holidays)
    out.overdue_deadline = svc.overdue_deadline_in(loan.end_date, return_time, holidays)
    return out


@router.get("/equipment-loans")
async def list_equipment_loans(
    user: StaffUser,
    db: DbDep,
    page: Pagination,
    status: StaffLoanStatus,
) -> ApiResponse[list[StaffEquipmentLoanOut]]:
    """點交工作清單:approved=待借出、checked_out=待歸還、overdue=逾期未歸還。

    overdue=checked_out 且 end_date <= 單調門檻日(SQL 篩選,推導不儲存)。
    """
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)

    query = (
        sa.select(EquipmentLoan, Club.name, Equipment)
        .outerjoin(Club, EquipmentLoan.club_id == Club.id)  # NULL club=行政手動借用
        .join(Equipment, EquipmentLoan.equipment_id == Equipment.id)
    )
    if status == "overdue":
        threshold = svc.overdue_threshold_in(datetime.now(UTC), return_time, holidays)
        query = query.where(
            EquipmentLoan.status == LoanStatus.CHECKED_OUT,
            EquipmentLoan.end_date <= threshold,
        )
    else:
        query = query.where(EquipmentLoan.status == LoanStatus(status))

    # 排序:待借出依起日(即將領用在前)、待歸還/逾期依結束日(應歸還時限單調)
    if status == "approved":
        query = query.order_by(EquipmentLoan.start_date.asc(), EquipmentLoan.id)
    else:
        query = query.order_by(EquipmentLoan.end_date.asc(), EquipmentLoan.id)

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = [
        _loan_out(loan, club_name, equipment, return_time, holidays)
        for loan, club_name, equipment in rows
    ]
    return ApiResponse(data=data, meta=page.meta(total or 0))


async def _locked_loan(db, loan_id: int) -> EquipmentLoan:
    loan = await db.scalar(
        sa.select(EquipmentLoan).where(EquipmentLoan.id == loan_id).with_for_update()
    )
    if loan is None:
        raise not_found("找不到借用申請")
    return loan


async def _notify_loan_club(
    background: BackgroundTasks, db, club_id: int | None, kind: str, title: str, desc: str
) -> None:
    # NULL club=行政手動借用:無社團可通知
    if club_id is None:
        return
    club = await db.get(Club, club_id)
    if club is None:
        return
    background.add_task(notify.club_event, kind, title, desc, club.discord_webhook_url)


@router.post("/equipment-loans/{loan_id}/checkout")
async def checkout_equipment_loan(
    loan_id: int,
    body: CheckoutIn,
    user: StaffUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[StaffEquipmentLoanOut]:
    """借出點交:approved → checked_out;依序點交器材逐件登記序號。

    不需 advisory lock:approved → checked_out 不改變區間佔用量(核准時已佔)。
    """
    loan = await _locked_loan(db, loan_id)
    if loan.status != LoanStatus.APPROVED:
        raise conflict("此借用單不在已核准狀態")
    equipment = await db.get(Equipment, loan.equipment_id)
    if equipment.needs_serial:
        serials = [s.strip() for s in body.serials]
        if len(serials) != loan.qty or any(not s for s in serials):
            raise validation_error(
                f"依序點交器材需逐件登記序號(共 {loan.qty} 件)", code="SERIALS_REQUIRED"
            )
        loan.serials = serials
    elif body.serials:
        raise validation_error("此器材為一般點交,毋須登記序號", code="SERIALS_NOT_ALLOWED")

    loan.status = LoanStatus.CHECKED_OUT
    loan.checkout_by = user.id
    loan.checkout_at = datetime.now(UTC)
    loan.borrower_name = body.borrower_name
    audit.record(
        db,
        action="equipment_checked_out",
        user=user,
        detail=f"equipment_loan={loan.id};borrower={body.borrower_name}",
        ip=client_ip(request),
    )
    await db.commit()

    await _notify_loan_club(
        background,
        db,
        loan.club_id,
        "alert",
        "器材已借出",
        f"{equipment.name} ×{loan.qty}(借用人 {body.borrower_name},"
        f"借用區間 {loan.start_date}~{loan.end_date})",
    )
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)
    club_name = None
    if loan.club_id is not None:
        club_name = await db.scalar(sa.select(Club.name).where(Club.id == loan.club_id))
    return ApiResponse(data=_loan_out(loan, club_name, equipment, return_time, holidays))


@router.post("/equipment-loans/{loan_id}/checkin")
async def checkin_equipment_loan(
    loan_id: int,
    body: CheckinIn,
    user: StaffUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[StaffEquipmentLoanOut]:
    """歸還點交:checked_out → returned(區間佔用隨即釋放,可借數推導自動生效)。"""
    loan = await _locked_loan(db, loan_id)
    if loan.status != LoanStatus.CHECKED_OUT:
        raise conflict("此借用單不在借出中狀態")
    equipment = await db.get(Equipment, loan.equipment_id)

    loan.status = LoanStatus.RETURNED
    loan.checkin_by = user.id
    loan.checkin_at = datetime.now(UTC)
    loan.checkin_note = body.note
    loan.returner_name = body.returner_name
    audit.record(
        db,
        action="equipment_checked_in",
        user=user,
        detail=f"equipment_loan={loan.id};returner={body.returner_name}",
        ip=client_ip(request),
    )
    await db.commit()

    await _notify_loan_club(
        background,
        db,
        loan.club_id,
        "approve",
        "器材已歸還",
        f"{equipment.name} ×{loan.qty}(歸還人 {body.returner_name})",
    )
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)
    club_name = None
    if loan.club_id is not None:
        club_name = await db.scalar(sa.select(Club.name).where(Club.id == loan.club_id))
    return ApiResponse(data=_loan_out(loan, club_name, equipment, return_time, holidays))


@router.post("/equipment-loans/{loan_id}/remind")
async def remind_equipment_loan(
    loan_id: int,
    user: StaffUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    """寄送歸還提醒:與行政端逾期追蹤共用 services.loan_remind(僅借出中可提醒)。"""
    await loan_remind.remind_equipment_loan(
        db, loan_id, user=user, ip=client_ip(request), background=background
    )
    return ApiResponse()
