"""社團端:線上報名(一社一單、不得更改;草稿寫 DB 跨裝置續填)。

報名窗檢核改 signup_start <= now <= signup_end;
審核制活動(requires_confirmation)報名後狀態=待確認,管理員確認後才算報名成功。
"""

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Request

from app.api.pagination import Pagination
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import conflict, not_found, validation_error
from app.models import Award, Club, Signup, SignupAward, SignupDraft, SignupEntry, SignupItem
from app.schemas.common import ApiResponse
from app.schemas.signups import (
    AwardOptionOut,
    MySignupOut,
    SignupDraftIn,
    SignupItemDetailOut,
    SignupItemOut,
    SignupSubmitIn,
)
from app.services import audit, notify
from app.services import signup_service as svc

router = APIRouter(prefix="/club/signup-items", tags=["signups"])


async def _get_item(db, item_id: int) -> SignupItem:
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")
    return item


def _my_status(item: SignupItem, signup: Signup) -> str:
    """審核制且未確認=待確認(pending);其餘已報名=signed。"""
    return "pending" if item.requires_confirmation and not signup.confirmed else "signed"


@router.get("")
async def list_items(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[SignupItemOut]]:
    query = sa.select(SignupItem).order_by(SignupItem.id.desc())
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    items = (await db.scalars(query.offset(page.offset).limit(page.page_size))).all()

    signups = {
        s.item_id: s
        for s in await db.scalars(sa.select(Signup).where(Signup.club_id == user.club_id))
    }
    drafts = {
        d
        for d in await db.scalars(
            sa.select(SignupDraft.item_id).where(SignupDraft.club_id == user.club_id)
        )
    }
    data = []
    for item in items:
        out = SignupItemOut.model_validate(item)
        out.accepting = svc.window_open(item)
        signup = signups.get(item.id)
        if signup is not None:
            out.my_status = _my_status(item, signup)
        elif item.id in drafts:
            out.my_status = "draft"
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.get("/{item_id}")
async def get_item(
    item_id: int, user: ClubUser, db: DbDep
) -> ApiResponse[SignupItemDetailOut]:
    item = await _get_item(db, item_id)
    out = SignupItemDetailOut.model_validate(item)
    out.accepting = svc.window_open(item)
    if item.is_eval:
        out.award_options = [
            AwardOptionOut.model_validate(a)
            for a in await db.scalars(
                sa.select(Award).where(Award.is_active.is_(True)).order_by(Award.sort, Award.id)
            )
        ]

    signup = await db.scalar(
        sa.select(Signup)
        .where(Signup.item_id == item.id, Signup.club_id == user.club_id)
        .options(sa.orm.selectinload(Signup.entries))
    )
    if signup is not None:
        awards = await db.execute(
            sa.select(Award.id, Award.name)
            .join(SignupAward, SignupAward.award_id == Award.id)
            .where(SignupAward.signup_id == signup.id)
            .order_by(Award.sort, Award.id)
        )
        out.my_signup = MySignupOut(
            confirmed=signup.confirmed,
            created_at=signup.created_at,
            entries=signup.entries,
            awards=[AwardOptionOut(id=i, name=n) for i, n in awards],
        )
        out.my_status = _my_status(item, signup)
        return ApiResponse(data=out)

    draft = await db.scalar(
        sa.select(SignupDraft).where(
            SignupDraft.item_id == item.id, SignupDraft.club_id == user.club_id
        )
    )
    if draft is not None:
        out.my_draft = draft.participants
        out.my_status = "draft"
    return ApiResponse(data=out)


@router.put("/{item_id}/draft")
async def save_draft(
    item_id: int, body: SignupDraftIn, user: ClubUser, db: DbDep
) -> ApiResponse[None]:
    item = await _get_item(db, item_id)
    existing_signup = await db.scalar(
        sa.select(Signup.id).where(Signup.item_id == item.id, Signup.club_id == user.club_id)
    )
    if existing_signup:
        raise conflict("已完成報名,不可再存草稿")
    if not svc.window_open(item):
        raise conflict("不在報名期間內")

    draft = await db.scalar(
        sa.select(SignupDraft).where(
            SignupDraft.item_id == item.id, SignupDraft.club_id == user.club_id
        )
    )
    if draft is None:
        db.add(SignupDraft(item_id=item.id, club_id=user.club_id, participants=body.participants))
    else:
        draft.participants = body.participants
    await db.commit()
    return ApiResponse()


@router.post("/{item_id}/signup", status_code=201)
async def submit_signup(
    item_id: int,
    body: SignupSubmitIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    item = await _get_item(db, item_id)
    if not svc.window_open(item):
        raise conflict("不在報名期間內")

    exists = await db.scalar(
        sa.select(Signup.id).where(Signup.item_id == item.id, Signup.club_id == user.club_id)
    )
    if exists:
        raise conflict("一經報名不得更改")

    if len(body.participants) > item.max_participants:
        raise validation_error(f"超過人數上限({item.max_participants} 人)")

    for index, participant in enumerate(body.participants, start=1):
        errors = svc.validate_answers(item.fields, participant.answers)
        if errors:
            raise validation_error(f"第 {index} 位:{';'.join(errors)}")

    if body.awards:
        if not item.is_eval:
            raise validation_error("此活動非競賽報名,不可勾選獎項")
        valid_awards = {
            a
            for a in await db.scalars(
                sa.select(Award.id).where(Award.is_active.is_(True))
            )
        }
        unknown = [a for a in body.awards if a not in valid_awards]
        if unknown:
            raise validation_error(f"未知獎項:{','.join(unknown)}")
    elif item.is_eval:
        raise validation_error("競賽報名須至少勾選一個獎項")

    # 審核制:報名後待管理員確認;非審核制送出即成功
    signup = Signup(
        item_id=item.id, club_id=user.club_id, confirmed=not item.requires_confirmation
    )
    signup.entries = [SignupEntry(answers=p.answers) for p in body.participants]
    db.add(signup)
    await db.flush()
    for award_id in dict.fromkeys(body.awards):
        db.add(SignupAward(signup_id=signup.id, award_id=award_id))
    # 送出報名即刪除草稿
    await db.execute(
        sa.delete(SignupDraft).where(
            SignupDraft.item_id == item.id, SignupDraft.club_id == user.club_id
        )
    )
    audit.record(
        db, action="signup_submitted", user=user,
        detail=f"item={item.id};count={len(body.participants)}", ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, user.club_id)
    pending = "(待確認)" if item.requires_confirmation else ""
    background.add_task(
        notify.club_event,
        "submit",
        "線上報名",
        f"{club.name}:{item.name}({len(body.participants)} 人){pending}",
        club.discord_webhook_url,
    )
    return ApiResponse()
