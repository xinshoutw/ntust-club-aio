import httpx

from app.main import app


def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_health_returns_ok_envelope():
    async with client() as c:
        resp = await c.get("/api/v1/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {"status": "ok"}
    assert body["error"] is None


async def test_not_found_uses_error_envelope():
    async with client() as c:
        resp = await c.get("/api/v1/no-such-route")

    assert resp.status_code == 404
    body = resp.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]
