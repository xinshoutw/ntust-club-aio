import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.models import EmailLog
from app.services import notify


def _use(monkeypatch, handler) -> None:
    """把 httpx.AsyncClient 換成走 MockTransport 的版本。"""
    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient

    def patched(**kw):
        kw["transport"] = transport
        return original(**kw)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    monkeypatch.setattr(settings, "discord_webhook_url", "https://discord.test/webhook")


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
    _fast_retry(monkeypatch)

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


def _fast_retry(monkeypatch) -> None:
    """重試的等待歸零(改常數,不去動 asyncio.sleep 本身)。"""
    monkeypatch.setattr(notify, "_BACKOFF", (0.0, 0.0))
    monkeypatch.setattr(notify, "_MAX_RETRY_AFTER", 0.0)


async def test_discord_retries_on_rate_limit_then_succeeds(monkeypatch):
    """429 帶 Retry-After 就照它等,重送成功即止(decisions.md ISS-65)。"""
    _fast_retry(monkeypatch)
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "0.2"})
        return httpx.Response(204)

    _use(monkeypatch, handler)
    await notify.discord("approve", "活動申請已核准")
    assert len(calls) == 2


async def test_discord_gives_up_on_a_client_error_without_retrying(monkeypatch):
    """4xx 是設定錯的 webhook,重送幾次都一樣 —— 一次就放棄。"""
    _fast_retry(monkeypatch)
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(404)

    _use(monkeypatch, handler)
    await notify.discord("approve", "活動申請已核准")
    assert len(calls) == 1


async def test_discord_stops_after_the_retry_budget(monkeypatch):
    """5xx 一直失敗也不會無限重送:記憶體重試有上限,失敗只記 log。"""
    _fast_retry(monkeypatch)
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(503)

    _use(monkeypatch, handler)
    await notify.discord("approve", "活動申請已核准")
    assert len(calls) == 3  # = _RETRIES;寫死才擋得住有人把上限改掉


async def test_email_retries_then_records_the_failure(db, monkeypatch):
    """SMTP 暫時性失敗重送;用完額度才寫 failed 留底。"""
    _fast_retry(monkeypatch)
    monkeypatch.setattr(settings, "smtp_host", "mail.test")
    monkeypatch.setattr(settings, "smtp_username", "u")
    monkeypatch.setattr(settings, "smtp_password", "p")
    calls: list[int] = []

    async def boom(*a, **k):
        calls.append(1)
        raise ConnectionError("relay 拒接")

    monkeypatch.setattr(notify.aiosmtplib, "send", boom)
    await notify.send_email("someone@example.com", "測試主旨", "內文", template="test")

    # 寫死 3(= _RETRIES):拿 notify._RETRIES 來比是恆真的
    assert len(calls) == 3
    log = (await db.scalars(sa.select(EmailLog).order_by(EmailLog.id.desc()))).first()
    assert log.status.value == "failed"
    assert "relay 拒接" in log.error
