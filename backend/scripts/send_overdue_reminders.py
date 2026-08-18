"""器材逾期歸還提醒:每個上班日由 host cron 呼叫一次(decisions.md DEC-11)。

逾期判定是「結束日之隔天上班日 10:30」,所以排在判定成立之後幾分鐘跑:

    35 10 * * 1-5  cd /srv/club-aio && docker compose exec -T backend \\
        uv run --no-dev python scripts/send_overdue_reminders.py \
        >> /var/log/club-aio/remind.log 2>&1

假日不必在 cron 排除 —— 逾期判定本身就吃 `holidays` 表,國定假日當天不會有單成立。
重寄間隔見 `services/loan_remind.REMIND_EVERY_WORKDAYS`;寄到歸還為止,不設次數上限。

刻意不在程序內跑排程器:重啟不會漏班,也不必多裝套件。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 tests/conftest.py)
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.db import async_session_factory
from app.services.loan_remind import send_due_reminders


async def main() -> None:
    stamp = datetime.now(UTC).isoformat(timespec="seconds")
    async with async_session_factory() as db:
        sent = await send_due_reminders(db)
    if not sent:
        print(f"{stamp} 無待提醒的逾期借用")
        return
    print(f"{stamp} 寄出 {len(sent)} 則逾期提醒")
    for desc in sent:
        print(f"  {desc}")


if __name__ == "__main__":
    asyncio.run(main())
