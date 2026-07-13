"""登入/登出/改密業務邏輯(政策見 core/security.py)。"""

import secrets
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, unauthenticated, validation_error
from app.core.security import (
    LOCKOUT_DURATION,
    MAX_FAILED_LOGIN_ATTEMPTS,
    PASSWORD_HISTORY_GENERATIONS,
    SESSION_TTL,
    hash_password,
    needs_rehash,
    validate_password_strength,
    verify_password,
)
from app.models import PasswordHistory, Session, User
from app.services import audit

_GENERIC_LOGIN_ERROR = "帳號或密碼錯誤"


async def login(
    db: AsyncSession, *, username: str, password: str, ip: str | None, user_agent: str | None
) -> tuple[User, Session]:
    # 過期 session 順手清掉(單機低流量,不排程)
    await db.execute(sa.delete(Session).where(Session.expires_at <= sa.func.now()))

    user = await db.scalar(sa.select(User).where(User.username == username))
    now = datetime.now(UTC)

    if user is None or not user.is_active:
        verify_password(None, password)  # 時間等化,防帳號探測
        audit.record(db, action="login_failed", role=None, detail=f"username={username}", ip=ip)
        await db.commit()
        raise unauthenticated(_GENERIC_LOGIN_ERROR)

    if user.locked_until and user.locked_until > now:
        audit.record(db, action="login_locked", user=user, ip=ip)
        await db.commit()
        raise forbidden("登入失敗次數過多,帳號已鎖定 15 分鐘", code="ACCOUNT_LOCKED")

    if not verify_password(user.password_hash, password):
        user.failed_login_attempts += 1
        detail = f"attempt={user.failed_login_attempts}"
        if user.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = now + LOCKOUT_DURATION
            user.failed_login_attempts = 0
            detail += ";locked"
        audit.record(db, action="login_failed", user=user, detail=detail, ip=ip)
        await db.commit()
        raise unauthenticated(_GENERIC_LOGIN_ERROR)

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    session = Session(
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        ip=ip,
        user_agent=(user_agent or "")[:400] or None,
        expires_at=now + SESSION_TTL,
    )
    db.add(session)
    audit.record(db, action="login", user=user, ip=ip)
    await db.commit()
    return user, session


async def logout(db: AsyncSession, session: Session, user: User, ip: str | None) -> None:
    await db.delete(session)
    audit.record(db, action="logout", user=user, ip=ip)
    await db.commit()


async def change_password(
    db: AsyncSession,
    *,
    user: User,
    session: Session,
    old_password: str,
    new_password: str,
    ip: str | None,
) -> None:
    if not verify_password(user.password_hash, old_password):
        raise validation_error("目前密碼錯誤", code="PASSWORD_MISMATCH")
    validate_password_strength(new_password)

    # 3 代=現行密碼+前 2 代
    recent = await db.scalars(
        sa.select(PasswordHistory)
        .where(PasswordHistory.user_id == user.id)
        .order_by(PasswordHistory.id.desc())
        .limit(PASSWORD_HISTORY_GENERATIONS - 1)
    )
    reused = [h.password_hash for h in recent] + [user.password_hash]
    if any(verify_password(h, new_password) for h in reused):
        raise validation_error(
            f"新密碼不得與最近 {PASSWORD_HISTORY_GENERATIONS} 代密碼相同", code="PASSWORD_REUSED"
        )

    db.add(PasswordHistory(user_id=user.id, password_hash=user.password_hash))
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    # 改密後撤銷其他裝置的 session(保留當前)
    await db.execute(
        sa.delete(Session).where(Session.user_id == user.id, Session.id != session.id)
    )
    audit.record(db, action="password_changed", user=user, ip=ip)
    await db.commit()
