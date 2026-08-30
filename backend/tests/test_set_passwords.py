"""一次性密碼發放 CSV 的不變式(`scripts/set_passwords.py --random`)。

明碼只存在於那一份 CSV,承辦是用 Excel 開它 —— 檔案格式錯了不會有人報錯,
只會有幾個社團拿到看不見或打不開的密碼。需要連 DB 的部分不在這裡測。
"""

import csv
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import set_passwords  # noqa: E402

from app.core.security import generate_password  # noqa: E402
from app.models.enums import UserRole  # noqa: E402


def test_every_role_has_a_csv_label():
    """少一個角色會在寫檔前 KeyError,整批白跑一輪 argon2。"""
    assert set(set_passwords.ROLE_LABELS) == set(UserRole)


def test_generated_password_never_starts_with_a_formula_character():
    """Excel 把 `=` `+` `-` `@` 開頭的儲存格當公式:那一格會顯示 #NAME?。"""
    assert all(generate_password()[0].isalnum() for _ in range(2000))


def test_csv_is_excel_readable_and_round_trips(tmp_path, monkeypatch):
    monkeypatch.setattr(set_passwords, "OUT_DIR", tmp_path)
    rows = [
        ("社團", "資訊研究社", "501", "Ab3!ef2hij"),
        ("管理員", "姓名,含逗號", "900", 'Xy9"quote"'),
    ]
    out = set_passwords.write_csv(rows)

    assert out.read_bytes().startswith(b"\xef\xbb\xbf")  # 沒有 BOM 中文就是亂碼
    with out.open(encoding="utf-8-sig", newline="") as fh:
        assert list(csv.reader(fh)) == [["類型", "名稱", "代號", "密碼"], *(list(r) for r in rows)]
    assert out.stat().st_mode & 0o077 == 0  # mkstemp 開成 0600:明碼不給同機其他使用者
