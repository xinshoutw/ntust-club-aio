"""Uptime Kuma push monitor 心跳。

Push monitor 由被監控端主動推,kuma 逾時收不到就判定 down。間隔 30 秒,而 cron 的
最小粒度是分鐘 —— 這一支因此只能跑在程序內。與逾期提醒那類業務排程不同:那些要能
重試、要留紀錄、漏掉就是真的漏掉;心跳漏一次下一次就補上,失敗只記 log。

兩個 monitor 各自有意義:
- backend:量一次 `SELECT 1` 的來回時間當 ping。連不上 DB 就推 down —— 程序活著但
  資料庫不通,對使用者而言一樣是壞的
- frontend:web 層是純 nginx,沒有自己的程序可以推。由這裡打它一次,通了才推 up

**只在 ENV=prod 送出**:開發機也推的話,正式站掛掉時 kuma 會被開發機的心跳餵成 up,
監控就成了裝飾。
"""

import asyncio
import logging
import time

import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.core.db import async_session_factory

logger = logging.getLogger("club_aio.heartbeat")

_TIMEOUT = 10.0


async def push(
    client: httpx.AsyncClient, url: str, *, status: str, msg: str, ping: float | None
) -> None:
    """送一次心跳;url 為空即跳過。"""
    if not url:
        return
    params: dict[str, str] = {"status": status, "msg": msg[:180]}
    if ping is not None:
        params["ping"] = str(round(ping))
    try:
        resp = await client.get(url, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - 心跳失敗絕不影響服務
        logger.warning("uptime push failed (%s): %s", status, exc)


async def _beat_backend(client: httpx.AsyncClient) -> None:
    if not settings.uptime_push_backend_url:
        return
    started = time.perf_counter()
    try:
        async with async_session_factory() as session:
            await session.execute(sa.text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        await push(
            client, settings.uptime_push_backend_url, status="down", msg=str(exc), ping=None
        )
        return
    elapsed_ms = (time.perf_counter() - started) * 1000
    await push(client, settings.uptime_push_backend_url, status="up", msg="OK", ping=elapsed_ms)


async def _beat_frontend(client: httpx.AsyncClient) -> None:
    # 沒有 monitor 就不必去敲 web:探測本身是為了推送而做的
    if not settings.uptime_push_frontend_url:
        return
    started = time.perf_counter()
    try:
        resp = await client.get(settings.web_health_url, timeout=_TIMEOUT)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        await push(
            client, settings.uptime_push_frontend_url, status="down", msg=str(exc), ping=None
        )
        return
    elapsed_ms = (time.perf_counter() - started) * 1000
    await push(client, settings.uptime_push_frontend_url, status="up", msg="OK", ping=elapsed_ms)


async def beat_once(client: httpx.AsyncClient) -> None:
    """兩個 monitor 各推一次;其中一個壞掉不影響另一個。"""
    await asyncio.gather(_beat_backend(client), _beat_frontend(client), return_exceptions=True)


def enabled() -> bool:
    return settings.env == "prod" and bool(
        settings.uptime_push_backend_url or settings.uptime_push_frontend_url
    )


async def run() -> None:
    """心跳迴圈;由 lifespan 起停。"""
    logger.info("uptime heartbeat every %ss", settings.uptime_push_interval)
    async with httpx.AsyncClient() as client:
        while True:
            await beat_once(client)
            await asyncio.sleep(settings.uptime_push_interval)
