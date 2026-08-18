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
# 兩種都試,任一種對得上白名單就算涵蓋
_SAMPLES = ("1", "abc")


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


def _upload_locations() -> list[re.Pattern]:
    """nginx 裡掛了 auth_request 的上傳 location 正規式。"""
    conf = NGINX_CONF.read_text()
    out = []
    for match in re.finditer(r"location\s+~\s+(\S+)\s+\{(.*?)\n    \}", conf, re.S):
        pattern, block = match.groups()
        if "auth_request /_upload_precheck" in block:
            out.append(re.compile(pattern))
    return out


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
    conf = NGINX_CONF.read_text()
    for match in re.finditer(r"location\s+~\s+(\S+)\s+\{(.*?)\n    \}", conf, re.S):
        pattern, block = match.groups()
        if "auth_request /_upload_precheck" not in block:
            continue
        assert "client_max_body_size" in block, f"{pattern} 沒有宣告 client_max_body_size"


def test_the_precheck_subrequest_tolerates_the_largest_upload():
    """子請求的上限必須 ≥ 所有上傳 location:auth_request 收到 413 會轉成 500。"""
    conf = NGINX_CONF.read_text()
    sizes = {
        pattern: int(re.search(r"client_max_body_size (\d+)m", block)[1])
        for pattern, block in re.findall(
            r"location\s+[~=]\s+(\S+)\s+\{(.*?)\n    \}", conf, re.S
        )
        if "client_max_body_size" in block and re.search(r"client_max_body_size (\d+)m", block)
    }
    precheck = sizes["/_upload_precheck"]
    uploads = [v for k, v in sizes.items() if k != "/_upload_precheck" and "login" not in k]
    assert precheck >= max(uploads)
