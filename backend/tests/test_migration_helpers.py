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


def test_free_text_spellings_still_identify_the_president():
    """舊 Title 是自由文字:只認四個標準字串會把 239 位正副社長降級成幹部,
    連帶 66 個(社團,學期)沒有負責人 —— 幹部證明被擋、公告 Email 寄 0 人。"""
    for title in ("副社", "副社長&文書", "系副會長", "關懷組組長兼任副社長"):
        assert cms_import.member_kind("社員", title) == (MemberKind.VICE_PRESIDENT, None), title
    for title in ("系會長", "第十三屆會長", "系學會會長"):
        assert cms_import.member_kind("社員", title) == (MemberKind.PRESIDENT, None), title
    # 帶了「社長」但本人不是社長
    assert cms_import.member_kind("幹部", "榮譽社長") == (MemberKind.OFFICER, "榮譽社長")
    assert cms_import.member_kind("幹部", "社長組") == (MemberKind.OFFICER, "社長組")
    assert cms_import.member_kind("幹部", "社長秘書") == (MemberKind.OFFICER, "社長秘書")


def test_president_titles_are_discarded_not_kept():
    """正副社長/會長一律不留職稱(D-27):身份本身就是職稱。

    非標準寫法只用來認人 —— 屆數(第十三屆)與兼任(&文書)都跟著捨棄。
    """
    for title in ("第十三屆會長", "系會長", "副社長&文書", "副社"):
        assert cms_import.member_kind("幹部", title)[1] is None, title


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


def test_club_resolution_is_not_a_reason_to_skip_a_booking():
    """MIG-03 真正的改動是「借用單位認不出來不再是跳過的理由」。

    `resolve_club` 回 None 只代表掛「學務處」;匯不匯得進來由 apply_is_importable
    決定,而它**看不到**借用單位。
    """
    assert cc_import.apply_is_importable("pending", [1], date(2026, 5, 1), ["3"])
    # 真正該跳過的四種:未知狀態/未知場地/壞日期/無節次
    assert not cc_import.apply_is_importable(None, [1], date(2026, 5, 1), ["3"])
    assert not cc_import.apply_is_importable("pending", None, date(2026, 5, 1), ["3"])
    assert not cc_import.apply_is_importable("pending", [1], None, ["3"])
    assert not cc_import.apply_is_importable("pending", [1], date(2026, 5, 1), [])


def test_unidentified_units_split_into_identifiable_and_not():
    """空白欄位再怎麼看也看不出是誰:960 筆空白混進辨識清單只會把真正該看的淹掉。"""
    assert cc_import.unidentified_kind("") == "blank"
    assert cc_import.unidentified_kind(None) == "blank"
    assert cc_import.unidentified_kind("admin") == "office"
    assert cc_import.unidentified_kind("80001") == "unknown"


def test_reset_clears_without_re_importing():
    """`--reset` 只清不匯:清除順序與匯入順序相反(借用單掛在活動與社團上,
    外鍵是 NO ACTION),清完立刻重匯會讓下一支腳本的刪除撞外鍵 —— 而重置正是 MIG-04
    的全部目的。兩支 main() 的 --reset 分支都必須 return。"""
    for module in (cc_import, cms_import):
        src = Path(module.__file__).read_text()
        branch = src[src.index('if "--reset" in sys.argv:') :][:220]
        assert "await reset(db)" in branch
        assert "return" in branch.split("await reset(db)")[1].split("\n\n")[0], (
            f"{module.__name__} 的 --reset 沒有 return,會清完立刻重匯"
        )


def test_cms_reset_deletes_children_before_parents():
    """刪除順序寫反就會撞外鍵:活動與成員都掛在社團上,公告不掛任何人。"""
    order = [t for t, _ in cms_import._RESET_ORDER]
    assert order.index("Club_activity") < order.index("Club_club")
    assert order.index("Club_student") < order.index("Club_club")
    assert order.index("Club_staff") < order.index("Club_club")


def test_cc_import_offers_the_unknown_club_report():
    """認不出來的帳號要導得出清單交承辦辨識(MIG-06)。"""
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


def test_photo_reset_must_run_before_the_cms_reset():
    """`cms_import.reset()` 收尾會刪光 system=cms 的所有 id-map,照片對照也在裡面 ——
    先跑它,4,000 列 files 與盤上 4.9 GB 就再也沒有腳本找得到。防呆比對的表名必須
    真的等於 media_import 記的那張,不然改個常數就靜靜失效。"""
    import media_import

    assert media_import.LEGACY_TABLE not in {t for t, _ in cms_import._RESET_ORDER}, (
        "照片由 media_import 自己清(要連盤上檔案),不該進 cms_import 的刪除順序"
    )
    guard = Path(cms_import.__file__).read_text()
    assert f'== "{media_import.LEGACY_TABLE}"' in guard, (
        "cms_import.reset() 沒有擋照片對照,或表名與 media_import.LEGACY_TABLE 不一致"
    )


def test_reflection_slots_need_all_three_columns():
    """心得三欄一組。只填一半就整組不算 —— 而且呼叫端會據此整列不動,
    否則承辦誤刪一格,既有的三篇會被砍成兩篇。"""
    import text_fields

    header = text_fields._reflection_header()
    good = dict.fromkeys(header, "")
    good.update({"填_心得1_姓名": "王小明", "填_心得1_系級": "資工四", "填_心得1_內容": "很好玩"})
    parsed, problems = text_fields.parse_reflections(good, header)
    assert not problems
    assert parsed == [{"student_name": "王小明", "dept": "資工四", "body": "很好玩"}]

    half = dict(good)
    half["填_心得1_內容"] = ""
    parsed, problems = text_fields.parse_reflections(half, header)
    assert parsed == [] and problems, "缺一欄必須報問題,不能當成沒填而放行"


def test_reflection_lengths_come_from_the_schema():
    """超長的值寫進去,退回件的社團一按儲存就 422 而且自己改不掉。
    上限一律取自 schema,遷移腳本不得自己寫死第二份數字。"""
    import text_fields

    from app.schemas.activities import ActivityIn

    assert text_fields.CONTENT_MAX == _field_max_length(ActivityIn, "content")
    header = text_fields._reflection_header()
    row = dict.fromkeys(header, "")
    row.update(
        {
            "填_心得1_姓名": "王小明",
            "填_心得1_系級": "資工四",
            "填_心得1_內容": "x" * (text_fields.REFLECTION_MAX["body"] + 1),
        }
    )
    parsed, problems = text_fields.parse_reflections(row, header)
    assert parsed == [] and problems


def _field_max_length(model, field: str) -> int:
    """獨立於 text_fields._max_len 的第二種讀法:兩邊算出同一個數才算數。"""
    metadata = model.model_fields[field].metadata
    return next(m.max_length for m in metadata if hasattr(m, "max_length"))


def test_opinion_residual_drops_the_boilerplate_the_new_form_prints_itself():
    """舊審核意見裡 1,387 / 1,518 筆的全部內容就是那段「※…結報提醒」——
    新系統本身會催結案,那段話原文照搬只是把「意見回饋」那格塞滿樣板。
    留下來的必須只有承辦人真正寫的那句。"""
    assert cms_import.opinion_residual(None) == ""
    assert cms_import.opinion_residual("※請於活動後2周內上傳結報。表格如網址：https://x") == ""
    assert (
        cms_import.opinion_residual("本案由企業捐贈款支應。\r\n\r\n※請於活動後2周內上傳結報。")
        == "本案由企業捐贈款支應。"
    )
    # 多行提醒(換行在 ※ 之後)也要整段去掉
    multiline = "活動重複申請\r\n※請於…\r\n1.活動照片 5 張"
    assert cms_import.opinion_residual(multiline) == "活動重複申請"


def test_apply_stages_match_the_review_flow():
    """初核/複核/決行三格對的是 advisor/chief/dean 三關。這裡與行政端的
    `_STAGE_BY_STATUS` 是同一份判定,對不上就會有一格印錯人。"""
    from app.api.v1.admin_activities import _STAGE_BY_STATUS
    from app.services.activity_service import APPLY_STAGES

    assert set(APPLY_STAGES) == {stage for _, stage in _STAGE_BY_STATUS.values()}
    assert len(APPLY_STAGES) == 3
