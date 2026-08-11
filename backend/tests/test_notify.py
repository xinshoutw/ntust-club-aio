import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.models import EmailLog
from app.services import notify


async def test_discord_posts_embed(monkeypatch):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["json"] = request.read()
        return httpx.Response(204)

    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient

    def patched(**kw):
        kw["transport"] = transport
        return original(**kw)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    monkeypatch.setattr(settings, "discord_webhook_url", "https://discord.test/webhook")

    await notify.discord("approve", "活動申請已核准", "熱舞社:期末成果展")
    assert captured["url"] == "https://discord.test/webhook"
    assert "活動申請已核准".encode() in captured["json"]


async def test_discord_disabled_without_url(monkeypatch):
    monkeypatch.setattr(settings, "discord_webhook_url", "")

    def boom(**kw):
        raise AssertionError("不應建立 HTTP client")

    monkeypatch.setattr(httpx, "AsyncClient", boom)
    await notify.discord("announce", "title")  # no-op,不應丟例外


async def test_discord_failure_is_swallowed(monkeypatch, caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient

    def patched(**kw):
        kw["transport"] = transport
        return original(**kw)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    monkeypatch.setattr(settings, "discord_webhook_url", "https://discord.test/webhook/s3cr3t")
    await notify.discord("reject", "title")  # 失敗只記 log,不往外拋

    # webhook URL 的尾段就是憑證,不得因為推送失敗而落進 log
    assert "s3cr3t" not in caplog.text


async def test_send_email_log_only_without_credentials(db, monkeypatch):
    monkeypatch.setattr(settings, "smtp_password", "")
    await notify.send_email("someone@example.com", "測試主旨", "內文", template="test")

    log = await db.scalar(sa.select(EmailLog))
    assert log is not None
    assert log.to_addr == "someone@example.com"
    assert log.status.value == "sent"
