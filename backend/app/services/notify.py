"""事件通知:Discord webhook(全事件)+ Email(模板待需求方,先提供寄送與留底)。

- Discord:讀 .env DISCORD_WEBHOOK_URL,空值即停用;失敗只記 log,絕不影響業務交易
- Email:aiosmtplib;無 SMTP 憑證時降級 log-only;結果一律寫 email_logs
- 一律由 FastAPI BackgroundTasks 呼叫(fire-and-forget),不阻塞回應
"""

import logging
from email.message import EmailMessage

import aiosmtplib
import httpx

from app.core.config import settings
from app.core.db import async_session_factory
from app.models import EmailLog
from app.models.enums import EmailStatus

logger = logging.getLogger("club_aio.notify")

_TIMEOUT = 5.0

# 事件類別 → embed 顏色(Discord 十進位 RGB)
_COLORS = {
    "announce": 0x3B82F6,  # 藍:公告/一般通知
    "submit": 0xF59E0B,  # 橙:送審/新申請
    "approve": 0x22C55E,  # 綠:通過
    "reject": 0xEF4444,  # 紅:退回/拒絕
    "alert": 0x8B5CF6,  # 紫:系統事件(鎖定、解鎖、逾期)
}


async def discord(kind: str, title: str, description: str = "") -> None:
    """推送單一事件到 Discord webhook;kind ∈ _COLORS。"""
    url = settings.discord_webhook_url
    if not url:
        logger.info("discord disabled: %s %s", kind, title)
        return
    payload = {
        "embeds": [
            {
                "title": title[:256],
                "description": description[:2000],
                "color": _COLORS.get(kind, _COLORS["announce"]),
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except Exception:  # noqa: BLE001 - 通知失敗不得影響業務
        logger.exception("discord webhook failed: %s %s", kind, title)


async def send_email(to_addr: str, subject: str, body: str, template: str = "generic") -> None:
    """寄信;無憑證降級 log-only。結果寫 email_logs(獨立 session,不掛業務交易)。"""
    status = EmailStatus.SENT
    error: str | None = None

    if not (settings.smtp_host and settings.smtp_username and settings.smtp_password):
        logger.info("email log-only(未設定 SMTP): to=%s subject=%s", to_addr, subject)
    else:
        message = EmailMessage()
        message["From"] = f"{settings.mail_from_name} <{settings.mail_from_address}>"
        message["To"] = to_addr
        message["Subject"] = subject
        message.set_content(body)
        try:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username,
                password=settings.smtp_password,
                use_tls=settings.smtp_security == "ssl",
                start_tls=settings.smtp_security == "starttls",
                timeout=15,
            )
        except Exception as exc:  # noqa: BLE001 - 失敗留底,不往外拋
            logger.exception("send email failed: to=%s", to_addr)
            status = EmailStatus.FAILED
            error = str(exc)[:500]

    async with async_session_factory() as db:
        db.add(
            EmailLog(
                to_addr=to_addr, subject=subject, template=template, status=status, error=error
            )
        )
        await db.commit()
