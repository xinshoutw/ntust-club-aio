"""學期規則:上學期 8–1 月、下學期 2–7 月;標籤如 114-1、114-2。

活動只存 date,統計與行政分依區間篩選——規則變動不影響歷史資料。
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")


def semester_of(d: date) -> str:
    if d.month >= 8:  # 8–12 月:當年度上學期
        return f"{d.year - 1911}-1"
    if d.month == 1:  # 1 月:前一年度上學期
        return f"{d.year - 1 - 1911}-1"
    return f"{d.year - 1 - 1911}-2"  # 2–7 月:前一年度下學期


def semester_sort_key(label: str) -> tuple[int, int]:
    """學期標籤的排序鍵:(學年, 學期)以數字比。

    字串比大小會把 99-1 排在 100-1 之後(「9」> 「1」);學期下拉是新到舊,
    民國 100 年以前的標籤一比就跑到最上面。所有列學期的端點一律用這把鍵。
    """
    year, term = label.rsplit("-", 1)
    return int(year), int(term)


def semester_range(label: str) -> tuple[date, date]:
    """含頭含尾;label 如 114-1。"""
    year_part, sem = label.split("-")
    roc = int(year_part)
    if sem == "1":
        return date(roc + 1911, 8, 1), date(roc + 1912, 1, 31)
    return date(roc + 1912, 2, 1), date(roc + 1912, 7, 31)


def semester_bounds(label: str) -> tuple[datetime, datetime]:
    """學期的 timestamptz 半開區間 [start, end),以台北時區日界計。"""
    start, end = semester_range(label)
    return (
        datetime(start.year, start.month, start.day, tzinfo=TAIPEI),
        datetime(end.year, end.month, end.day, tzinfo=TAIPEI) + timedelta(days=1),
    )


def academic_year_of(d: date) -> int:
    """民國學年度(8 月起算)。"""
    return d.year - 1911 if d.month >= 8 else d.year - 1912


def next_semester_range(d: date) -> tuple[date, date]:
    """d 之後最近開始的學期起訖(含頭含尾)。

    固定借用於開放窗(預設 6 月、1 月)受理「下一學期」的申請,
    申請單以此區間快照為生效範圍。
    """
    year_part, sem = semester_of(d).split("-")
    nxt = f"{year_part}-2" if sem == "1" else f"{int(year_part) + 1}-1"
    return semester_range(nxt)
