"""system_settings 存取:會變/可能變的營運參數(管理員後台可調)。"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemSetting

# 預設值(DB 無該 key 時採用;行政調整後以 DB 為準)
DEFAULTS: dict[str, Any] = {
    # 經費科目九項(2026-07-13 定案;UI 提示文字由前端維護)
    "budget_categories": [
        "指導老師、教練費",
        "保險費",
        "交通費",
        "膳食費",
        "印刷費",
        "比賽獎勵品",
        "雜支",
        "其他",
        "活動收入",
    ],
    # 違規勸導項目目錄(原型 VIOL_ITEMS;行政可調)
    "violation_items": [
        "未經申請使用場地",
        "場地使用後未復原",
        "噪音影響他人",
        "張貼未核可文宣",
        "器材未歸還或損壞",
        "其他",
    ],
    # 結案鎖定:活動日 +N 個月未結案即鎖定(管理員可解鎖)
    "close_lock_months": 1,
    # 器材歸還時限:結束日之隔天上班日此時刻前
    "equipment_return_time": "10:30",
    # 器材借用區間緩衝(工作天):活動開始日 −before ~ 活動結束日 +after
    "equipment_workday_buffer": {"before": 2, "after": 1},
    # 教室固定借用開放窗:預設每年 6 月、1 月受理;manual_open=管理員手動加開
    "fixed_booking_window": {"open_months": [6, 1], "manual_open": False},
    # 評鑑視窗(2026-07-14 拍板:預設 116 年,2026/02/01–2027/01/31)
    # 注意:ad7/ad8 以 signup_items.year == eval_window.year 篩選;
    # 管理端建報名項目時若用 current_year,兩者必須對齊,否則幹訓/會議餵不進行政分
    "eval_window": {"year": 116, "start": "2026-02-01", "end": "2027-01-31"},
    # 目前學年度(報名等年輪資料寫入時取用)
    "current_year": 114,
}


async def get_setting(db: AsyncSession, key: str) -> Any:
    row = await db.get(SystemSetting, key)
    if row is not None:
        return row.value
    return DEFAULTS[key]


async def set_setting(db: AsyncSession, key: str, value: Any) -> None:
    row = await db.get(SystemSetting, key)
    if row is None:
        db.add(SystemSetting(key=key, value=value))
    else:
        row.value = value
