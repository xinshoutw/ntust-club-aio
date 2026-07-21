"""parse_sort 多鍵語法(?sort=-a,b):鍵序、白名單、上限 3 鍵、去重、空字串視同未提供。"""

import pytest

from app.api.pagination import MAX_SORT_KEYS, parse_sort
from app.core.errors import AppError
from app.models import ClubMember

_ALLOWED = {
    "name": ClubMember.name,
    "student_id": ClubMember.student_id,
    "semester": ClubMember.semester,
    "updated_at": ClubMember.updated_at,
}


def _sql(clauses) -> list[str]:
    return [str(c) for c in clauses]


def test_multi_key_follows_key_order():
    assert _sql(parse_sort("-name,student_id", _ALLOWED, None)) == [
        "club_members.name DESC",
        "club_members.student_id ASC",
    ]


def test_single_key_unchanged():
    assert _sql(parse_sort("-updated_at", _ALLOWED, None)) == ["club_members.updated_at DESC"]


def test_empty_sort_falls_back_to_default_chain():
    default = (ClubMember.name.asc(), ClubMember.id.asc())
    assert parse_sort(None, _ALLOWED, default) == list(default)
    assert parse_sort("", _ALLOWED, default) == list(default)
    single = ClubMember.id.desc()
    assert parse_sort(None, _ALLOWED, single) == [single]
    assert parse_sort("", _ALLOWED, None) == []


def test_unknown_key_rejected_with_invalid_sort():
    with pytest.raises(AppError) as err:
        parse_sort("name,nope", _ALLOWED, None)
    assert err.value.status == 422
    assert err.value.code == "INVALID_SORT"


def test_more_than_max_keys_rejected():
    assert MAX_SORT_KEYS == 3
    with pytest.raises(AppError) as err:
        parse_sort("name,student_id,semester,updated_at", _ALLOWED, None)
    assert err.value.status == 422
    assert err.value.code == "INVALID_SORT"


def test_duplicate_keys_keep_first_direction():
    # 同鍵重複(含一升一降)保留首見;去重後才計鍵數上限
    assert _sql(parse_sort("-name,name,student_id", _ALLOWED, None)) == [
        "club_members.name DESC",
        "club_members.student_id ASC",
    ]
    assert len(parse_sort("name,name,name,name", _ALLOWED, None)) == 1
