"""事件通知:Discord webhook(全事件)+ Email(模板待需求方,先提供寄送與留底)。

- Discord:讀 .env DISCORD_WEBHOOK_URL,空值即停用;失敗只記 log,絕不影響業務交易
- Email:aiosmtplib;無 SMTP 憑證時降級 log-only;結果一律寫 email_logs
- 一律由 FastAPI BackgroundTasks 呼叫(fire-and-forget),不阻塞回應
- 公告通知:Email 基礎 HTML 模板 + Discord Components V2
"""

import html as html_escape
import logging
from email.message import EmailMessage
from typing import Any

import aiosmtplib
import httpx

from app.core.config import settings
from app.core.db import async_session_factory
from app.models import EmailLog
from app.models.enums import EmailStatus

logger = logging.getLogger("club_aio.notify")

_TIMEOUT = 5.0

SYSTEM_NAME = "臺科大社團管理系統"
SITE_URL = "https://clubs.ntust.edu.tw"
# webhook 顯示名稱與頭貼(頭貼=前端 public/logo.png,正式站對外可取用;
# 開發站無法解析時 Discord 僅略過頭貼,不影響訊息)
WEBHOOK_AVATAR_URL = f"{SITE_URL}/logo.png"


def _with_identity(payload: dict[str, Any]) -> dict[str, Any]:
    """為 webhook payload 補上統一的顯示名稱與頭貼(不覆蓋既有值)。"""
    return {"username": SYSTEM_NAME, "avatar_url": WEBHOOK_AVATAR_URL, **payload}

# Discord Components V2(flags 1<<15 = IS_COMPONENTS_V2)
IS_COMPONENTS_V2 = 1 << 15
_CONTAINER = 17  # Container
_TEXT_DISPLAY = 10  # Text Display

# 事件類別 → embed 顏色(Discord 十進位 RGB)
_COLORS = {
    "announce": 0x3B82F6,  # 藍:公告/一般通知
    "submit": 0xF59E0B,  # 橙:送審/新申請
    "approve": 0x22C55E,  # 綠:通過
    "reject": 0xEF4444,  # 紅:退回/拒絕
    "alert": 0x8B5CF6,  # 紫:系統事件(鎖定、解鎖、逾期)
}


async def _post_webhook(
    url: str, payload: dict[str, Any], label: str, params: dict[str, str] | None = None
) -> None:
    """低階發送:失敗只記 log,絕不影響業務交易。"""
    if not url:
        logger.info("discord disabled: %s", label)
        return
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, json=_with_identity(payload), params=params)
            resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        # 不記整條例外:httpx 的訊息含完整 webhook URL,那串路徑就是憑證
        logger.warning("discord webhook rejected (%s): %s", err.response.status_code, label)
    except Exception:  # noqa: BLE001 - 通知失敗不得影響業務
        logger.exception("discord webhook failed: %s", label)


async def discord_to(url: str, kind: str, title: str, description: str = "") -> None:
    """推送單一事件到指定 webhook;kind ∈ _COLORS。"""
    payload = {
        "embeds": [
            {
                "title": title[:256],
                "description": description[:2000],
                "color": _COLORS.get(kind, _COLORS["announce"]),
            }
        ]
    }
    await _post_webhook(url, payload, f"{kind} {title}")


async def discord(kind: str, title: str, description: str = "") -> None:
    """推送到學務處全域 webhook(.env)。"""
    await discord_to(settings.discord_webhook_url, kind, title, description)


async def club_event(
    kind: str, title: str, description: str = "", club_webhook: str | None = None
) -> None:
    """社團相關事件:推全域 webhook,社團自設 webhook(管理項目)另推一份。"""
    await discord(kind, title, description)
    if club_webhook:
        await discord_to(club_webhook, kind, title, description)


# ---- 公告通知 ----


def announcement_components(title: str, content: str, date: str) -> dict[str, Any]:
    """公告的 Discord Components V2 payload:Container 內含 Text Display。

    標題粗體 + 內容(markdown 原文,Discord 語法大致相容)+ 發布日期;
    需求方之後會再調整版型,此為乾淨模板函式。
    """
    text = f"**{title}**\n\n{content}"[:3800] + f"\n\n-# {date}"
    return {
        "flags": IS_COMPONENTS_V2,
        "components": [
            {
                "type": _CONTAINER,
                "accent_color": _COLORS["announce"],
                "components": [{"type": _TEXT_DISPLAY, "content": text}],
            }
        ],
    }


def announcement_email_html(title: str, content: str, date: str) -> str:
    """公告 Email 基礎 HTML 模板(之後需求方會給 MJML,先求乾淨可讀)。

    content 為 markdown 原文:以 <pre> 呈現(不在後端渲染 markdown)。
    """
    safe_title = html_escape.escape(title)
    safe_content = html_escape.escape(content)
    safe_date = html_escape.escape(date)
    body_style = (
        "font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;"
        "max-width:640px;margin:0 auto;color:#1f2430;"
    )
    header_style = (
        "padding:14px 20px;background:#14304A;color:#fff;font-size:15px;"
        "font-weight:600;border-radius:8px 8px 0 0;"
    )
    card_style = "border:1px solid #e3e6eb;border-top:none;border-radius:0 0 8px 8px;padding:20px;"
    pre_style = (
        "white-space:pre-wrap;word-break:break-word;font:inherit;"
        "font-size:14px;line-height:1.8;margin:0;"
    )
    return f"""\
<div style="{body_style}">
  <div style="{header_style}">{SYSTEM_NAME}</div>
  <div style="{card_style}">
    <h2 style="margin:0 0 4px;font-size:18px;">{safe_title}</h2>
    <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">{safe_date}</div>
    <pre style="{pre_style}">{safe_content}</pre>
  </div>
  <div style="padding:12px 4px;font-size:12px;color:#6b7280;">
    此信由系統自動發送,請勿直接回覆。前往
    <a href="{SITE_URL}" style="color:#2f6fb2;">{SITE_URL.removeprefix("https://")}</a>
    查看完整公告。
  </div>
</div>
"""


async def announcement_broadcast(
    title: str,
    content: str,
    date: str,
    emails: list[str],
    club_webhooks: list[str],
) -> None:
    """公告發布通知(BackgroundTasks):Email 給目標社團聯絡人、Discord 推全域與社團自設 webhook。

    收件者於請求交易內解析完成,此處不碰業務 DB(email_logs 留底除外)。
    """
    payload = announcement_components(title, content, date)
    # webhook 執行 Components V2 必須帶 with_components=true,否則 Discord 拒收元件
    v2 = {"with_components": "true"}
    await _post_webhook(settings.discord_webhook_url, payload, f"announce {title}", params=v2)
    for url in club_webhooks:
        await _post_webhook(url, payload, f"announce {title}", params=v2)

    html = announcement_email_html(title, content, date)
    plain = f"{title}\n{date}\n\n{content}\n\n-- {SYSTEM_NAME} {SITE_URL}"
    subject = f"【{SYSTEM_NAME}】{title}"
    for addr in emails:
        await send_email(addr, subject, plain, template="announcement", html=html)


async def send_email(
    to_addr: str, subject: str, body: str, template: str = "generic", html: str | None = None
) -> None:
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
        if html:
            message.add_alternative(html, subtype="html")
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
