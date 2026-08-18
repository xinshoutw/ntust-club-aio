"""`app/` 不得以行程時區判定日期。

業務時區只有台北一個(`core.semesters.TAIPEI`),而正式容器與 CI 的行程時區都是 UTC
(`Dockerfile` 與 `compose.yml` 都沒設 TZ)。測試靠 `conftest.py` 固定台北才對得上後端,
但那個 pin 保護不到 `app/` —— 有人在那裡寫下 `date.today()`,CI 會全綠、線上每天錯 8 小時。
"""

import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"

# `datetime.now()` 不帶 tz、`date.today()`、已棄用的 `utcnow()` 都讀行程時區
FORBIDDEN = re.compile(r"\bdate\.today\(\)|\bdatetime\.(now\(\s*\)|utcnow\(\)|today\(\))")


def test_app_never_reads_the_process_local_date():
    hits = [
        f"{path.relative_to(APP_DIR.parent)}:{lineno}: {line.strip()}"
        for path in sorted(APP_DIR.rglob("*.py"))
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if FORBIDDEN.search(line)
    ]
    assert not hits, "請改用 datetime.now(TAIPEI) 或 datetime.now(UTC):\n" + "\n".join(hits)
