"""政府行事曆假日匯入(decisions.md GAP-06):每年一次,由行政手動執行。

資料源=人事行政總處「中華民國政府行政機關辦公日曆表」開放資料(data.gov.tw 第 14718 號),
CSV 欄位 `西元日期,星期,是否放假,備註`,`是否放假` 2=放假、0=上班。

    cd backend
    uv run python scripts/import_holidays.py --year 116          # 先看會寫什麼(不寫入)
    uv run python scripts/import_holidays.py --year 116 --yes    # 實際寫入
    uv run python scripts/import_holidays.py --file 116.csv --yes  # 沒有對外連線時先自行下載

`holidays` 只影響器材逾期的「隔天上班日 10:30」判定(`booking_service.add_workdays`)。
**週六日不入表**:那條推導本來就排除週末,把 100 多天例假日灌進來只是把表撐大。
同理,政府偶爾指定的「補上班的週六」目前也不會被當成上班日 —— 那條推導不看本表的
上班紀錄,只看「不是週末、不在假日表裡」。年度只差幾天,先不為它加一層例外。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 tests/conftest.py)
import argparse
import asyncio
import csv
import io
import sys
from datetime import date
from pathlib import Path

import httpx
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.db import async_session_factory
from app.core.tls import lenient_extension_context
from app.models import Holiday

DATASET_API = "https://data.gov.tw/api/v2/rest/dataset/14718"
DEFAULT_NAME = "例假日"


def parse_calendar(text: str) -> list[tuple[date, str]]:
    """CSV → [(日期, 名稱)];只留放假的**平日**,週六日不入表。

    來源檔帶 UTF-8 BOM,日期是 `YYYYMMDD`。看不懂的列直接跳過 ——
    行事曆一年換一次,寧可少匯入幾天讓人發現,也不要塞進解析錯的日期。
    """
    out: list[tuple[date, str]] = []
    for row in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        raw = (row.get("西元日期") or "").strip()
        if (row.get("是否放假") or "").strip() != "2" or len(raw) != 8 or not raw.isdigit():
            continue
        try:
            day = date(int(raw[:4]), int(raw[4:6]), int(raw[6:]))
        except ValueError:
            continue
        if day.weekday() >= 5:  # 週六日:add_workdays 本來就排除
            continue
        out.append((day, (row.get("備註") or "").strip() or DEFAULT_NAME))
    return out


def resource_url(payload: dict, roc_year: int) -> str:
    """從 dataset metadata 挑出該民國年的 CSV(排除 Google 行事曆專用版)。"""
    for item in payload["result"]["distribution"]:
        desc = item.get("resourceDescription", "")
        if desc.startswith(f"{roc_year}年") and "Google" not in desc:
            return item["resourceDownloadUrl"]
    raise SystemExit(f"開放資料中找不到 {roc_year} 年的辦公日曆表(非 Google 版)")


def fetch(roc_year: int) -> str:
    # dgpa.gov.tw 的憑證鏈上有 CA 缺 Subject Key Identifier(與校方 SMTP relay 同一種毛病);
    # 鏈與主機名照驗,只放寬那一項擴充欄位檢查
    ctx = lenient_extension_context()
    with httpx.Client(timeout=30, follow_redirects=True, verify=ctx) as client:
        meta = client.get(DATASET_API).raise_for_status().json()
        url = resource_url(meta, roc_year)
        print(f"下載 {roc_year} 年行事曆:{url[:100]}…")
        return client.get(url).raise_for_status().text


async def upsert(rows: list[tuple[date, str]]) -> None:
    async with async_session_factory() as db:
        before = set(await db.scalars(sa.select(Holiday.date)))
        await db.execute(
            pg_insert(Holiday)
            .values([{"date": d, "name": n} for d, n in rows])
            .on_conflict_do_update(
                index_elements=[Holiday.date], set_={"name": sa.text("excluded.name")}
            )
        )
        await db.commit()
    added = [d for d, _ in rows if d not in before]
    print(f"寫入完成:新增 {len(added)} 天、更新 {len(rows) - len(added)} 天")


def main() -> None:
    parser = argparse.ArgumentParser(description="匯入政府行政機關辦公日曆表的假日")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--year", type=int, help="民國年(自動由 data.gov.tw 取得)")
    source.add_argument("--file", type=Path, help="已下載的 CSV")
    parser.add_argument("--yes", action="store_true", help="實際寫入(預設只列出)")
    args = parser.parse_args()

    text = args.file.read_text(encoding="utf-8-sig") if args.file else fetch(args.year)
    rows = parse_calendar(text)
    if not rows:
        raise SystemExit("解析不到任何放假日,請確認檔案格式(欄位:西元日期/是否放假/備註)")
    span = f"{rows[0][0]} ~ {rows[-1][0]}"
    print(f"解析到 {len(rows)} 天平日假期({span}):")
    for day, name in rows:
        print(f"  {day} {name}")
    if not args.yes:
        print("\n以上為預覽,加 --yes 才會寫入")
        return
    asyncio.run(upsert(rows))


if __name__ == "__main__":
    main()
