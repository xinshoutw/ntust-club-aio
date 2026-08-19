"""磁碟容量告警:每天由 host cron 呼叫一次(decisions.md OPS-07)。

門檻 80% 警示、90% 告警,與上傳前置閘同一組常數(`services/files.DISK_*_RATIO`)。
到 90% 時系統已經不收新檔了 —— 那時才有人發現的話,社團已經傳不上東西一整天。

    20 8 * * *  cd /srv/club-aio && docker compose exec -T backend \\
        uv run --no-dev python scripts/check_disk.py >> /var/log/club-aio/disk.log 2>&1

水位正常時不推播(每天一則「一切正常」等於沒有告警)。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 tests/conftest.py)
import asyncio
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import files as file_service
from app.services import notify

_GIB = 1024**3
_TITLE = {
    "warn": "磁碟容量警示",
    "alert": "磁碟容量告警:已暫停接受上傳",
}


async def main() -> None:
    usage = shutil.disk_usage(file_service.upload_root())
    level = file_service.disk_level(usage)
    used_pct = (usage.total - usage.free) / usage.total * 100 if usage.total else 0
    line = (
        f"使用率 {used_pct:.1f}%,剩餘 {usage.free / _GIB:.1f} GiB / "
        f"共 {usage.total / _GIB:.1f} GiB"
    )
    print(f"{level}: {line}")
    if level == "ok":
        return
    detail = line
    if level == "alert":
        detail += "。上傳前置閘已關閉,請清理報修影片或擴充磁碟"
    else:
        detail += f"。達 {file_service.DISK_ALERT_RATIO:.0%} 時會暫停接受上傳"
    await notify.discord("alert", _TITLE[level], detail)


if __name__ == "__main__":
    asyncio.run(main())
