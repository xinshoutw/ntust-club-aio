"""Uptime Kuma 心跳:推送參數與啟用條件。"""

import httpx
import pytest

from app.core.config import settings
from app.services import heartbeat


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_backend_beat_reports_up_with_a_ping(monkeypatch):
    monkeypatch.setattr(settings, "uptime_push_backend_url", "https://kuma.test/api/push/back")
    monkeypatch.setattr(settings, "uptime_push_frontend_url", "")
    monkeypatch.setattr(settings, "web_health_url", "")
    seen: list[httpx.QueryParams] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.params)
        return httpx.Response(200)

    async with _client(handler) as client:
        await heartbeat.beat_once(client)

    assert len(seen) == 1
    assert seen[0]["status"] == "up"
    assert seen[0]["ping"].isdigit()  # 量到的是 SELECT 1 的來回時間,不是固定值


async def test_frontend_beat_reports_down_when_the_web_layer_is_unreachable(monkeypatch):
    """nginx 掛掉時要推 down —— 後端自己還活著,不能拿它的狀態代表前端。"""
    monkeypatch.setattr(settings, "uptime_push_backend_url", "")
    monkeypatch.setattr(settings, "uptime_push_frontend_url", "https://kuma.test/api/push/front")
    monkeypatch.setattr(settings, "web_health_url", "http://web/")
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "web":
            raise httpx.ConnectError("connection refused")
        seen.append(request)
        return httpx.Response(200)

    async with _client(handler) as client:
        await heartbeat.beat_once(client)

    assert len(seen) == 1
    assert seen[0].url.params["status"] == "down"


async def test_a_push_failure_never_raises(monkeypatch):
    """心跳壞掉不能拖垮服務。"""
    monkeypatch.setattr(settings, "uptime_push_backend_url", "https://kuma.test/api/push/back")
    monkeypatch.setattr(settings, "uptime_push_frontend_url", "")
    monkeypatch.setattr(settings, "web_health_url", "")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    async with _client(handler) as client:
        await heartbeat.beat_once(client)  # 不得拋出


@pytest.mark.parametrize(
    ("env", "url", "expected"),
    [
        ("prod", "https://kuma.test/api/push/back", True),
        ("dev", "https://kuma.test/api/push/back", False),  # 開發機會把正式站餵成 up
        ("prod", "", False),
    ],
)
def test_enabled_only_in_prod_with_a_url(monkeypatch, env, url, expected):
    monkeypatch.setattr(settings, "env", env)
    monkeypatch.setattr(settings, "uptime_push_backend_url", url)
    monkeypatch.setattr(settings, "uptime_push_frontend_url", "")
    assert heartbeat.enabled() is expected


async def test_a_rejected_push_never_logs_the_url(monkeypatch, caplog):
    """push URL 的尾段就是憑證:例外訊息含完整 URL,不得整條進 log。"""
    token = "s3cr3t-token"
    monkeypatch.setattr(settings, "uptime_push_backend_url", f"https://kuma.test/api/push/{token}")
    monkeypatch.setattr(settings, "uptime_push_frontend_url", "")
    monkeypatch.setattr(settings, "web_health_url", "")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    with caplog.at_level("WARNING"):
        async with _client(handler) as client:
            await heartbeat.beat_once(client)

    assert token not in caplog.text
    assert "404" in caplog.text
