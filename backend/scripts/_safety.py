"""破壞性腳本的環境防護。

`reset_db.py` / `seed_mock.py` 會 `DROP SCHEMA public CASCADE` 並清空上傳目錄,
`set_passwords.py` 會覆寫一整批帳號的密碼。`--yes` 是為了 CI 與重複開發流程存在的,
但它同時也讓「連到正式環境的 shell 裡順手貼一行」變成不可回復的事故 ——
環境本身必須先擋一次。
"""

import sys

from app.core.config import settings

_DEFAULT_CONSEQUENCE = "會清空整個資料庫與上傳目錄"


def refuse_on_prod(action: str, consequence: str = _DEFAULT_CONSEQUENCE) -> None:
    """ENV=prod 時直接中止(無覆寫旗標:正式庫的資料操作走既有維運流程,不走這裡)。"""
    if settings.env != "prod":
        return
    print(
        f"拒絕執行:目前 ENV=prod,{action}{consequence}。\n"
        "這類腳本只供開發與測試環境;正式環境要還原資料請走備份還原流程。",
        file=sys.stderr,
    )
    raise SystemExit(1)
