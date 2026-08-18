"""兩套舊系統匯入腳本的純函式。

匯入腳本只在切換前跑幾次,但寫錯的欄位會一路帶進正式資料 —— 已經踩過一次:
`staff_text` 用了前端讀不懂的格式,每張遷移進來的活動工作分配都顯示成一行亂碼。
需要連舊庫的部分無法在此測,這裡守住的是「值怎麼被轉換」。
"""

import sys
from datetime import UTC, date, datetime
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parents[2] / "migration"
sys.path.insert(0, str(MIGRATION_DIR))

import cc_import  # noqa: E402
import cms_import  # noqa: E402

from app.models.enums import ClubKind, MemberKind  # noqa: E402


def test_club_kind_follows_the_name_then_the_override():
    assert cms_import.derive_club_kind("資訊工程系學會") is ClubKind.ASSOCIATION
    assert cms_import.derive_club_kind("熱舞社") is ClubKind.CLUB
    for name, kind in cms_import.KIND_OVERRIDES.items():
        assert cms_import.derive_club_kind(name) is kind


def test_semester_format_conversion():
    assert cms_import.to_semester("104 1") == "104-1"
    assert cms_import.to_semester("104 2") == "104-2"
    # 不合格式一律回 None(呼叫端跳過該列),不得硬湊
    for bad in (None, "", "104", "104 3", "104-1", "abc 1"):
        assert cms_import.to_semester(bad) is None


def test_member_kind_maps_titles_to_standard_identities():
    assert cms_import.member_kind("幹部", "社長") == (MemberKind.PRESIDENT, None)
    assert cms_import.member_kind("社員", "會長") == (MemberKind.PRESIDENT, None)
    assert cms_import.member_kind("幹部", "副社長") == (MemberKind.VICE_PRESIDENT, None)
    # 幹部沒填職稱補「幹部」;社員的「社員」不是職稱
    assert cms_import.member_kind("幹部", None) == (MemberKind.OFFICER, "幹部")
    assert cms_import.member_kind("幹部", "公關") == (MemberKind.OFFICER, "公關")
    assert cms_import.member_kind("社員", "社員") == (MemberKind.MEMBER, None)
    assert cms_import.member_kind("社員", "學術長") == (MemberKind.MEMBER, "學術長")


def test_naive_legacy_timestamps_are_read_as_taipei():
    """dump 裡的 timestamp without time zone 若用主機時區解讀,日期會整批位移一天。"""
    midnight = datetime(2026, 3, 5, 0, 30)  # naive
    assert cms_import.local_date(midnight).isoformat() == "2026-03-05"
    assert cms_import.local_time(midnight).isoformat() == "00:30:00"
    # 已帶時區的值照常換算到台北
    utc_evening = datetime(2026, 3, 4, 20, 0, tzinfo=UTC)  # = 台北 3/5 04:00
    assert cms_import.local_date(utc_evening).isoformat() == "2026-03-05"
    assert cms_import.local_date(None) is None


def test_staff_text_uses_the_format_the_form_reads():
    """工作分配:表單讀的是每行一筆的『項目:負責人』,不是舊碼的 `項目>負責人;`。"""
    assert cms_import.staff_line("場地佈置", "王小明") == "場地佈置:王小明"
    assert cms_import.staff_line("  報到 ", " 李小華 ") == "報到:李小華"
    # 只填一欄仍成行(承辦要看得出缺哪一半);兩欄皆空不產生行
    assert cms_import.staff_line("器材", None) == "器材:"
    assert cms_import.staff_line(None, None) == ""
    assert cms_import.staff_line("   ", "") == ""


def test_cc_import_exposes_a_main_entry():
    """教室借用系統匯入腳本要能被 import(sys.path 與 app 匯入順序容易寫壞)。"""
    assert callable(cc_import.main)


def test_unresolvable_booking_units_are_kept_as_office_bookings():
    """舊系統 960 筆 `club_id` 是空字串。欄位沒填不代表那張單不存在 ——
    丟掉等於整段借用歷史憑空少一塊(decisions.md MIG-03)。"""
    lookup = {"dance": 7}
    assert cc_import.resolve_club(lookup, "dance") == 7
    # 空字串 / None / admin / 8 開頭偽帳號 / 認不出來的:一律留下來,掛「學務處」
    for raw in ("", None, "admin", "80001", "who-is-this"):
        assert cc_import.resolve_club(lookup, raw) is None


def test_cc_import_offers_reset_and_unknown_club_report():
    """換一份新 dump 之前要清得乾淨(MIG-04);認不出來的帳號要導得出清單(MIG-06)。"""
    assert callable(cc_import.reset)
    assert callable(cc_import.report_unknown_clubs)


def test_cms_import_reset_covers_every_id_mapped_table():
    """重置漏掉一張表就會在重跑時撞唯一鍵,或留下一批孤兒列(decisions.md MIG-04)。"""
    import re

    mapped = set(re.findall(r'ids\.record\(db, "([^"]+)"', cms_import.__file__ and
                            Path(cms_import.__file__).read_text()))
    assert mapped, "找不到任何 ids.record 呼叫,這支測試自己壞了"
    assert {t for t, _ in cms_import._RESET_ORDER} == mapped


def test_holiday_calendar_parsing():
    """人事行政總處的辦公日曆表:`是否放假` 2=放假,週六日不入表
    (`add_workdays` 本來就排除週末)。"""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "import_holidays", Path(__file__).resolve().parents[1] / "scripts" / "import_holidays.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    csv_text = (
        "﻿西元日期,星期,是否放假,備註\n"
        "20270101,五,2,開國紀念日\n"   # 平日假期 → 入表
        "20270102,六,2,\n"             # 週六 → 不入表
        "20270103,日,2,\n"             # 週日 → 不入表
        "20270104,一,0,\n"             # 上班日 → 不入表
        "20270209,二,2,\n"             # 平日放假但沒寫名稱 → 補預設名
        "2027,三,2,壞資料\n"            # 日期長度不對 → 跳過
        "20271332,三,2,壞日期\n"        # 月份 13 → 跳過
    )
    assert module.parse_calendar(csv_text) == [
        (date(2027, 1, 1), "開國紀念日"),
        (date(2027, 2, 9), "例假日"),
    ]
