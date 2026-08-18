"""對外連線的 TLS context。

台灣幾個政府/校園主機的憑證鏈上有 CA 缺 RFC 5280 的 Subject Key Identifier
(校方 SMTP relay `mail.ntust.edu.tw`、人事行政總處 `www.dgpa.gov.tw` 都是),
而 Python 3.13 起 `ssl.create_default_context()` 預設開 `VERIFY_X509_STRICT`,
整條鏈會因此驗不過(`Missing Subject Key Identifier`)。
"""

import ssl
from functools import cache


@cache
def lenient_extension_context() -> ssl.SSLContext:
    """憑證鏈與主機名照驗,**只**關掉 RFC 5280 的嚴格擴充欄位檢查。

    `CERT_REQUIRED` 與 `check_hostname` 都保留 —— 偽造憑證或換一台主機一樣連不上。
    很容易被後人「順手」改成 `CERT_NONE` 或 `check_hostname = False` 收工,
    那就變成任何憑證都收;`tests/test_smtp_tls.py` 釘住這件事。
    """
    ctx = ssl.create_default_context()
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx
