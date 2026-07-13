"""稽核軌跡:高風險操作全記(登入/改密/簽核/調整/帳號管理/檔案刪除…)。

只 add 不 commit,隨呼叫端的交易一起落地(避免業務失敗但稽核已寫)。
"""

from ipaddress import ip_address

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


def _valid_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    try:
        ip_address(ip)
        return ip
    except ValueError:
        return None


def record(
    db: AsyncSession,
    *,
    action: str,
    user: User | None = None,
    role: str | None = None,
    detail: str = "",
    ip: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            role=(user.role.value if user else role),
            action=action,
            detail=detail,
            ip=_valid_ip(ip),
        )
    )
