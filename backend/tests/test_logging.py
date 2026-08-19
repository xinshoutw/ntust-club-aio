"""應用層 log 的輸出前提。

uvicorn 只設定自己的 logger,root 停在 WARNING 且沒有 handler —— 少了 `main` 那段
`basicConfig`,所有 `logger.info` 都是 no-op(通知跳過、SMTP 降級、心跳啟動全靜默)。
而一旦打開 INFO,httpx 會把每一次請求的完整 URL 記下來,那串路徑就是憑證。
"""

import logging

import app.main  # noqa: F401 - import 即套用 logging 設定


def test_application_logs_reach_a_handler():
    assert logging.getLogger("club_aio.notify").isEnabledFor(logging.INFO)
    assert logging.getLogger().handlers, "root 沒有 handler,warning 會走裸訊息的 lastResort"


def test_httpx_never_logs_request_urls():
    """Kuma push URL 的尾段與 Discord webhook 的路徑都是憑證,不得隨 INFO 落地。"""
    assert not logging.getLogger("httpx").isEnabledFor(logging.INFO)
