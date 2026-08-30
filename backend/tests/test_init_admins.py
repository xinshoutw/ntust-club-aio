"""行政帳號初始化腳本的權限解析。

這支腳本把承辦講的分工(顯示詞)翻成 `users.permissions` 的鍵。翻錯不會報錯,
只會讓某個人少一頁或多一頁 —— 而多的那一頁可能是帳號管理或稽核軌跡。
需要連 DB 的部分不在這裡測,這裡守住的是「顯示詞怎麼變成鍵」。
"""

import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import init_admins  # noqa: E402

from app.core.permissions import PAGE_KEYS, STAGE_KEYS  # noqa: E402


def test_labels_resolve_to_the_keys_the_backend_checks():
    admin = init_admins.Admin("x", ("申請審核", "社團總覽", "承辦人簽核"))
    assert init_admins.resolve(admin) == ["areview", "aclub", "approve_advisor"]


def test_all_grants_every_page_and_every_signing_stage():
    keys = init_admins.resolve(init_admins.Admin("x", init_admins.ALL))
    assert set(keys) == PAGE_KEYS | STAGE_KEYS


def test_super_needs_no_keys_because_it_bypasses_them():
    assert init_admins.resolve(init_admins.Admin("x", is_super=True)) == []


def test_an_unknown_label_stops_the_script_instead_of_writing_a_dead_key():
    # permissions.py 改過顯示詞時要在這裡炸掉,而不是靜靜寫進一把沒有作用的鍵
    with pytest.raises(SystemExit):
        init_admins.resolve(init_admins.Admin("x", ("申請稽核",)))


def test_the_shipped_table_only_uses_labels_that_exist():
    for admin in init_admins.ADMINS:
        for key in init_admins.resolve(admin):
            assert key in PAGE_KEYS | STAGE_KEYS


def test_keys_come_out_in_catalogue_order_so_reruns_show_no_diff():
    scrambled = init_admins.Admin("x", ("學務長簽核", "稽核軌跡", "申請審核"))
    assert init_admins.resolve(scrambled) == ["areview", "aaudit", "approve_dean"]
