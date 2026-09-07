"""簽核紀錄的讀取端:把承辦的處置補回輸出列。

寫入端在各 API(`audit.record` 與 `db.add(ApprovalRecord(...))`),這裡只負責讀。
"""

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRecord, User
from app.models.enums import ApprovalDecision, ApprovalSubject


async def attach_decisions(
    db: AsyncSession,
    subject: ApprovalSubject,
    rows: list,
    *,
    with_actor: bool = False,
    approve_notes: bool = False,
) -> None:
    """把承辦的處置補進輸出列;`with_actor` 另帶簽核者姓名(行政端才給)。

    退回與撤銷都由承辦填原因,最終狀態不同(rejected / cancelled),前端據狀態分辨
    「退回原因」與「撤銷原因」;社團自行取消沒有紀錄,那種取消件維持 None。
    退回是終局狀態(要重申請就是新的一張單),每張單至多一筆;仍以 id 序取最後一筆,
    不靠「只會有一筆」這個假設。

    `approve_notes`(只有器材借用開):核准時留了話(改數量:「數量調整:5 → 3」)的
    **已核准列**也帶回去 —— 申請數只剩這裡看得到,社團在借用列點開「核准說明」才知道為什麼
    變成 3。只看已核准那一族(approved / checked_out / returned):核准後又被撤銷或社團自己
    取消的,給的仍是撤銷原因或 None,核准意見不得冒充處置原因。場地清單不開這個開關,
    已核准的場地列照舊不發這支查詢。

    社團端看的是自己的單,只需要「為什麼」;行政端要能追到人,所以多帶 `decided_by`。
    """
    # 三種借用是兩個不同的 enum,但字面值相同 —— 比字串而不是放進 set:
    # Enum 的 hash 依名稱,跨 enum 的集合查詢會落空
    terminal = [r.id for r in rows if r.status in ("rejected", "cancelled")]
    approved = (
        [r.id for r in rows if r.status in ("approved", "checked_out", "returned")]
        if approve_notes
        else []
    )
    scopes = []
    if terminal:
        scopes.append(
            sa.and_(
                ApprovalRecord.subject_id.in_(terminal),
                ApprovalRecord.decision.in_([ApprovalDecision.REJECT, ApprovalDecision.REVOKE]),
            )
        )
    if approved:
        scopes.append(
            sa.and_(
                ApprovalRecord.subject_id.in_(approved),
                ApprovalRecord.decision == ApprovalDecision.APPROVE,
                ApprovalRecord.reason.is_not(None),
            )
        )
    if not scopes:
        return
    query = sa.select(ApprovalRecord).where(
        ApprovalRecord.subject_type == subject, sa.or_(*scopes)
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
