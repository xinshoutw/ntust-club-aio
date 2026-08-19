"""上傳端點與 nginx 白名單的對照(ISS-51)。

大小上限、pre-body 驗證與磁碟水位閘都在 `frontend/nginx.conf` 的上傳 location 上。
新增一支 `UploadFile` 端點卻忘了同步那份白名單的話,那支端點會落到預設的
`client_max_body_size 1m`、也不會經過 `auth_request` —— 症狀是「傳大檔一律 413」
或「未登入的 multipart 照樣 spool 到 /tmp」,兩者都不會有測試以外的地方報錯。
"""

import itertools
import re
from pathlib import Path

from app.main import app

NGINX_CONF = Path(__file__).resolve().parents[2] / "frontend" / "nginx.conf"

# path 參數的代表值:id 可能是數字(活動、報修)也可能是字串 slug(獎項),
# 都試一遍,任一種對得上白名單就算涵蓋。`a-b_1` 是為了讓「白名單的 `[a-z]+` 配不上
# 新增的 `best_club` 這種 id」會紅 —— 配不上就會掉到 `location /api`,
# 上限退回 1m 且完全跳過 auth_request
_SAMPLES = ("1", "abc", "a-b_1")


def _upload_routes() -> list[str]:
    """收 multipart 的端點(以 OpenAPI 為準:FastAPI 的路由物件是延遲展開的)。"""
    schema = app.openapi()
    paths = []
    for path, methods in schema["paths"].items():
        for spec in methods.values():
            content = spec.get("requestBody", {}).get("content", {})
            if "multipart/form-data" in content:
                paths.append(path)
                break
    return sorted(paths)


# `location ~ `、`location ~* ` 與 `location = ` 都收:漏掉一種寫法會讓對照悄悄變空轉
_LOCATION_RE = re.compile(r"location\s+(?:~\*?|=)\s+(\S+)\s+\{(.*?)\n    \}", re.S)


def _blocks() -> list[tuple[str, str]]:
    return _LOCATION_RE.findall(NGINX_CONF.read_text())


def _upload_blocks() -> list[tuple[str, str]]:
    return [(p, b) for p, b in _blocks() if "auth_request /_upload_precheck" in b]


def _upload_locations() -> list[re.Pattern]:
    """nginx 裡掛了 auth_request 的上傳 location 正規式。"""
    return [re.compile(p) for p, _b in _upload_blocks()]


def _sample_paths(template: str) -> list[str]:
    slots = template.count("{")
    if not slots:
        return [template]
    out = []
    for combo in itertools.product(_SAMPLES, repeat=slots):
        path = template
        for value in combo:
            path = re.sub(r"\{\w+\}", value, path, count=1)
        out.append(path)
    return out


def test_every_upload_endpoint_is_on_the_nginx_whitelist():
    routes = _upload_routes()
    assert routes, "找不到任何 UploadFile 端點,這支測試自己壞了"
    locations = _upload_locations()
    assert locations, "nginx.conf 裡找不到掛 auth_request 的上傳 location"

    missing = [
        path
        for path in routes
        if not any(rx.match(sample) for sample in _sample_paths(path) for rx in locations)
    ]
    assert not missing, f"這些上傳端點不在 nginx 上傳白名單裡:{missing}"


def test_upload_locations_declare_a_body_limit():
    """每個上傳 location 都要自己宣告上限:繼承 server 層的 1m 等於整條路走不通。"""
    blocks = _upload_blocks()
    assert blocks, "解析不到任何上傳 location —— 這支測試自己壞了(nginx.conf 的寫法變了?)"
    for pattern, block in blocks:
        assert "client_max_body_size" in block, f"{pattern} 沒有宣告 client_max_body_size"


def test_the_precheck_subrequest_tolerates_the_largest_upload():
    """子請求的上限必須 ≥ 所有上傳 location:auth_request 收到 413 會轉成 500。"""
    sizes = {
        pattern: int(re.search(r"client_max_body_size (\d+)m", block)[1])
        for pattern, block in _blocks()
        if re.search(r"client_max_body_size (\d+)m", block)
    }
    precheck = sizes["/_upload_precheck"]
    uploads = [v for k, v in sizes.items() if k != "/_upload_precheck" and "login" not in k]
    assert precheck >= max(uploads)


def test_the_gate_response_survives_auth_request():
    """`auth_request` 只認 2xx/401/403,其餘一律轉成 500。

    容量閘因此必須回 403 + `X-Upload-Gate` 標頭,由 nginx 依標頭換成 507 的文案;
    後端直接回 507 的話使用者只會看到「HTTP 500」,而 nginx 連 500 的 error_page 都沒有。
    """
    blocks = _upload_blocks()
    assert blocks
    # 每個掛 auth_request 的 location 都要把標頭取出來
    for pattern, block in blocks:
        assert "auth_request_set $upload_gate $upstream_http_x_upload_gate;" in block, pattern
    # 403 的處理要能分辨「沒有權限」與「磁碟滿了」
    conf = NGINX_CONF.read_text()
    forbidden = re.search(r"location @forbidden \{(.*?)\n    \}", conf, re.S)[1]
    assert "$upload_gate = closed" in forbidden
    assert "507" in forbidden


def test_admin_adjustable_limits_stay_under_the_nginx_caps():
    """承辦把上限調到 nginx 擋得住的範圍以外,就會出現「畫面說 100MB、送出吃 413」。

    `upload_limits` 的上界必須留在各 location 的 `client_max_body_size` 之內。
    """
    from app.schemas.settings import UploadLimitsIn

    caps = {
        pattern: int(re.search(r"client_max_body_size (\d+)m", block)[1])
        for pattern, block in _upload_blocks()
    }
    assert caps
    video_cap = max(v for k, v in caps.items() if "maintenance" in k)
    other_cap = min(v for k, v in caps.items() if "maintenance" not in k)

    bounds = {k: f.metadata[-1].le for k, f in UploadLimitsIn.model_fields.items()}
    assert bounds["video"] <= video_cap
    # zip(ARCHIVE)沒有任何端點在用,不對應任何 location
    for key in ("doc", "img"):
        assert bounds[key] <= other_cap, f"{key} 上界 {bounds[key]}MB 超過 nginx 的 {other_cap}m"
