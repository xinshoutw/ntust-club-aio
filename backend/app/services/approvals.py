"""簽核紀錄的讀取端:把承辦的處置補回輸出列。

寫入端在各 API(`audit.record` 與 `db.add(ApprovalRecord(...))`),這裡只負責讀。
"""

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRecord, User
from app.models.enums import ApprovalDecision, ApprovalSubject


async def attach_decisions(
    db: AsyncSession, subject: ApprovalSubject, rows: list, *, with_actor: bool = False
) -> None:
    """把承辦的退回/撤銷原因補進輸出列;`with_actor` 另帶簽核者姓名(行政端才給)。

    退回與撤銷都由承辦填原因,最終狀態不同(rejected / cancelled),前端據狀態分辨
    「退回原因」與「撤銷原因」;社團自行取消沒有紀錄,那種取消件維持 None。
    退回是終局狀態(要重申請就是新的一張單),每張單至多一筆;仍以 id 序取最後一筆,
    不靠「只會有一筆」這個假設。

    社團端看的是自己的單,只需要「為什麼」;行政端要能追到人,所以多帶 `decided_by`。
    """
    # 只有終局的兩個狀態可能帶紀錄。三種借用是兩個不同的 enum,但這兩個值的字面值
    # 相同 —— 比字串而不是放進 set:Enum 的 hash 依名稱,跨 enum 的集合查詢會落空
    ids = [r.id for r in rows if r.status in ("rejected", "cancelled")]
    if not ids:
        return
    query = sa.select(ApprovalRecord).where(
        ApprovalRecord.subject_type == subject,
        ApprovalRecord.subject_id.in_(ids),
        ApprovalRecord.decision.in_([ApprovalDecision.REJECT, ApprovalDecision.REVOKE]),
    )
    records = list(await db.scalars(query.order_by(ApprovalRecord.id)))
    names: dict[int, str] = {}
    if with_actor and records:
        # 一次查完簽核者:逐列查就是 N+1,而這一頁最多 page_size 筆
        names = {
            uid: name
            for uid, name in await db.execute(
                sa.select(User.id, User.name).where(
                    User.id.in_({r.actor_id for r in records})
                )
            )
        }
    by_subject = {r.subject_id: r for r in records}
    for out in rows:
        record = by_subject.get(out.id)
        if record is not None:
            out.decision_reason = record.reason
            out.decided_at = record.created_at
            if with_actor:
                out.decided_by = names.get(record.actor_id)
