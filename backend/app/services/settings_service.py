"""system_settings 存取:會變/可能變的營運參數(管理員後台可調)。"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemSetting

# 預設值(DB 無該 key 時採用;行政調整後以 DB 為準)
DEFAULTS: dict[str, Any] = {
    # 經費科目九項;hint 選填,社團填申請選到該科目時顯示,由行政後台維護
    "budget_categories": [
        {"name": "指導老師、教練費", "hint": "請在下方加註講師相關專業工作背景"},
        {
            "name": "保險費",
            "hint": "保額上限為新台幣 100 萬元，申請學校補助要保人為國立臺灣科技大學",
        },
        {"name": "交通費", "hint": "若租賃遊覽車請於結案時上傳行照、駕照及租賃契約"},
        {"name": "膳食費", "hint": ""},
        {"name": "印刷費", "hint": ""},
        {"name": "比賽獎勵品", "hint": ""},
        {"name": "雜支", "hint": "請在下方註明細項內容"},
        {"name": "其他", "hint": "請在下方註明細項內容"},
        {"name": "活動收入", "hint": "請在下方註明活動預計收入總金額"},
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
    # 教室固定借用開放窗:日期區間;未設定即不開放,由管理員於系統設定調整
    "fixed_booking_window": {"open_from": None, "open_until": None},
    # 單檔上限(MB;magic-byte 型別驗證用的上界,管理員後台可調)
    "upload_limits": {"doc": 50, "img": 10, "zip": 100, "video": 200},
    # 各申請性質的附件加總上限(MB):
    # 活動申請附件 15、空間報修佐證 100(含影片)、活動結案照片 10
    "activity_attachment_total_mb": 15,
    "maintenance_total_mb": 100,
    "close_photo_total_mb": 10,
    # 儲存配額(GiB):系統總量取實際磁碟可用空間,此處只設單一社團未歸檔檔案上限
    "storage_limits": {"per_club_gib": 2},
    # 評鑑視窗(預設 116 年,2026/02/01–2027/01/31)
    # ad7/ad8 以「場次日期落在視窗」採計:報名項不存年度,故無年度對齊問題
    "eval_window": {"year": 116, "start": "2026-02-01", "end": "2027-01-31"},
    # 目前學年度(報名等年輪資料寫入時取用)
    "current_year": 114,
}


async def get_setting(db: AsyncSession, key: str) -> Any:
    row = await db.get(SystemSetting, key)
    if row is not None:
        return row.value
    return DEFAULTS[key]


async def get_budget_categories(db: AsyncSession) -> list[dict[str, str]]:
    """經費科目一律以 [{name, hint}] 形狀回傳。

    2026-07-17 之前存的是 list[str];寫入端(pydantic)與 DEFAULTS 都已是新結構,
    但殘留舊列或手改 DB 的字串元素在讀取端做形狀防禦,不讓申請/組態端點 500。
    """
    raw = await get_setting(db, "budget_categories")
    return [
        c if isinstance(c, dict) else {"name": str(c), "hint": ""}
        for c in raw
    ]


async def set_setting(db: AsyncSession, key: str, value: Any) -> None:
    row = await db.get(SystemSetting, key)
    if row is None:
        db.add(SystemSetting(key=key, value=value))
    else:
        row.value = value
