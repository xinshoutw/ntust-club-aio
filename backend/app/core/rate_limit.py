"""程序內固定視窗限流。

ponytail: 單機部署(GCE 一台、uvicorn 單 app),程序內 dict 即正解;
若未來多 instance,換 Redis 或改在 web 層 limit_req。
"""

import time

_SWEEP_THRESHOLD = 10_000  # 防記憶體無限增長:超過即掃掉過期視窗


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, tuple[float, int]] = {}

    def blocked(self, key: str) -> bool:
        now = time.monotonic()
        start, count = self._hits.get(key, (now, 0))
        return now - start < self.window and count >= self.limit

    def hit(self, key: str) -> None:
        now = time.monotonic()
        start, count = self._hits.get(key, (now, 0))
        if now - start >= self.window:
            start, count = now, 0
        if len(self._hits) >= _SWEEP_THRESHOLD and key not in self._hits:
            self._hits = {k: v for k, v in self._hits.items() if now - v[0] < self.window}
        self._hits[key] = (start, count + 1)

    def allow(self, key: str) -> bool:
        if self.blocked(key):
            return False
        self.hit(key)
        return True

    def reset(self) -> None:
        self._hits.clear()


# 登入防爆破:每 IP 每 5 分鐘 10 次「失敗」(校園 NAT 共用出口,成功登入不計;
# 帳號層另有連錯 5 次鎖 15 分)
login_limiter = RateLimiter(limit=10, window_seconds=300)
# 上傳限流:每 IP 每分鐘 30 次
upload_limiter = RateLimiter(limit=30, window_seconds=60)
