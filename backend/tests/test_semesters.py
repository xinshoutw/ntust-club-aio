from datetime import date

from app.core.semesters import next_semester_range, semester_of, semester_range


def test_semester_of_boundaries():
    assert semester_of(date(2026, 8, 1)) == "115-1"
    assert semester_of(date(2027, 1, 31)) == "115-1"
    assert semester_of(date(2027, 2, 1)) == "115-2"
    assert semester_of(date(2027, 7, 31)) == "115-2"


def test_next_semester_range():
    # 6 月開放窗(下學期中)→ 下一學期 = 當年 8/1–次年 1/31
    assert next_semester_range(date(2026, 6, 15)) == semester_range("115-1")
    # 1 月開放窗(上學期中)→ 下一學期 = 當年 2/1–7/31
    assert next_semester_range(date(2027, 1, 10)) == semester_range("115-2")
    # 學期中補開窗(如 9 月)→ 次年下學期
    assert next_semester_range(date(2026, 9, 1)) == semester_range("115-2")
    assert next_semester_range(date(2026, 6, 15)) == (date(2026, 8, 1), date(2027, 1, 31))
