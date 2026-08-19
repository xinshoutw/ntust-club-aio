"""SMTP 的 TLS context 只鬆綁一項,不是關掉驗證。

校方 relay 的憑證鏈上有一張 CA 缺 Subject Key Identifier,Python 3.13 起的嚴格模式
會因此拒絕整條鏈。修法是清掉 `VERIFY_X509_STRICT` —— 很容易被後人「順手」改成
`CERT_NONE` 或 `check_hostname = False` 收工,那就變成任何憑證都收。這支測試擋的是那個。
"""

import ssl

from app.services.notify import _smtp_tls_context


def test_chain_and_hostname_are_still_verified():
    ctx = _smtp_tls_context()
    assert ctx.verify_mode == ssl.CERT_REQUIRED
    assert ctx.check_hostname is True


def test_only_the_strict_extension_check_is_relaxed():
    ctx = _smtp_tls_context()
    default = ssl.create_default_context()
    assert not ctx.verify_flags & ssl.VERIFY_X509_STRICT
    # 除了那一項,其餘旗標與預設完全相同
    assert ctx.verify_flags == default.verify_flags & ~ssl.VERIFY_X509_STRICT
