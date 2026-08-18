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


def test_retry_delay_reads_retry_after_and_classifies_the_status():
    """`_retry_delay` 決定「等多久 / 要不要再送」;走 `_fast_retry` 的那幾支測試
    把等待歸零,反而驗不到這裡的判斷,所以直接測這支純函式。"""

    class Resp:
        def __init__(self, status_code, headers=None):
            self.status_code = status_code
            self.headers = headers or {}

    # 429 照 Retry-After;上限夾住(Discord 偶爾給很長的值)
    assert notify._retry_delay(1, Resp(429, {"Retry-After": "7"})) == 7.0
    assert notify._retry_delay(1, Resp(429, {"Retry-After": "9999"})) == notify._MAX_RETRY_AFTER
    assert notify._retry_delay(1, Resp(429, {"Retry-After": "亂寫"})) == 1.0
    assert notify._retry_delay(1, Resp(429)) == 1.0
    # 5xx 與連線層失敗走退避;4xx 是設定錯的 webhook,不重送
    assert notify._retry_delay(1, Resp(503)) == notify._BACKOFF[0]
    assert notify._retry_delay(2, Resp(503)) == notify._BACKOFF[1]
    assert notify._retry_delay(1, None) == notify._BACKOFF[0]
    assert notify._retry_delay(1, Resp(404)) is None
    # 用完額度就停
    assert notify._retry_delay(3, Resp(503)) is None


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


async def test_email_does_not_retry_a_permanent_failure(db, monkeypatch):
    """收件人不存在、認證失敗這種重送幾次都一樣,白等 4 秒不會有不同結果。"""
    _fast_retry(monkeypatch)
    monkeypatch.setattr(settings, "smtp_host", "mail.test")
    monkeypatch.setattr(settings, "smtp_username", "u")
    monkeypatch.setattr(settings, "smtp_password", "p")
    calls: list[int] = []

    async def refused(*a, **k):
        calls.append(1)
        raise notify.aiosmtplib.SMTPAuthenticationError(535, "auth failed")

    monkeypatch.setattr(notify.aiosmtplib, "send", refused)
    await notify.send_email("someone@example.com", "測試主旨", "內文", template="test")

    assert len(calls) == 1
    log = (await db.scalars(sa.select(EmailLog).order_by(EmailLog.id.desc()))).first()
    assert log.status.value == "failed"


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


async def test_broadcast_fans_out_instead_of_going_one_by_one(monkeypatch):
    """逐筆序列 × 60+ 社 × 每社 3 個信箱,再乘上重試的等待,單一 BackgroundTask
    會跑上好幾個小時,期間任何重新部署就整批靜默遺失(ISS-65 的副作用)。"""
    _fast_retry(monkeypatch)
    monkeypatch.setattr(settings, "smtp_password", "")  # Email 走 log-only
    inflight = 0
    peak = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal inflight, peak
        inflight += 1
        peak = max(peak, inflight)
        inflight -= 1
        return httpx.Response(204)

    _use(monkeypatch, handler)
    posted: list[str] = []

    async def spy_post(url, payload, label, params=None):
        posted.append(url)

    monkeypatch.setattr(notify, "_post_webhook", spy_post)
    hooks = [f"https://discord.test/{i}" for i in range(20)]
    await notify.announcement_broadcast("維護公告", "內文", "2026/08/20", [], hooks)

    # 全域 + 20 社,一個都不能少
    assert len(posted) == 21
    assert notify._BROADCAST_CONCURRENCY >= 2, "並發上限設成 1 就退回逐筆序列了"
