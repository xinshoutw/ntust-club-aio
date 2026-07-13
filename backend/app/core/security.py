"""密碼雜湊與密碼政策(2026-07-14 定案)。

- argon2id 雜湊
- 密碼 ≥10 碼,含大小寫、數字、特殊符號
- 3 代不重用(比對 password_history 最近 3 筆)
- 連錯 5 次鎖 15 分
- session cookie 7 天滑動效期
"""

import re
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.errors import validation_error

PASSWORD_MIN_LENGTH = 10
PASSWORD_HISTORY_GENERATIONS = 3
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
SESSION_TTL = timedelta(days=7)
# 滑動效期:剩餘效期低於 TTL−此間隔才回寫 DB,避免每個請求都 UPDATE
SESSION_RENEW_INTERVAL = timedelta(hours=1)

_hasher = PasswordHasher()  # argon2id(套件預設即 type ID)

# 帳號不存在時仍走一次驗證,避免以回應時間探測帳號存在與否
_DUMMY_HASH = _hasher.hash("timing-equalizer-dummy")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
        return password_hash is not None
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def validate_password_strength(password: str) -> None:
    ok = (
        len(password) >= PASSWORD_MIN_LENGTH
        and re.search(r"[A-Z]", password)
        and re.search(r"[a-z]", password)
        and re.search(r"[0-9]", password)
        and re.search(r"[^A-Za-z0-9]", password)
    )
    if not ok:
        raise validation_error(
            f"密碼須至少 {PASSWORD_MIN_LENGTH} 碼,並包含大寫字母、小寫字母、數字與特殊符號",
            code="PASSWORD_POLICY",
        )
