"""後台檔案管理:空間彙總(含 DB「文字內容」)、大型檔案列表、報修檔案刪除。"""

from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import AuditLog, File
from tests.conftest import csrf_headers, login, make_club, make_user


def make_file(club_id, user_id, *, module="maintenance", name="clip.mp4", size=1000, **kw):
    return File(
        club_id=club_id,
        uploaded_by=user_id,
        subject_type="maintenance",
        subject_id=1,
        slot="evidence",
        original_name=name,
        size=size,
        mime="video/mp4",
        sha256=f"hash-{module}-{name}-{size}",
        path=f"{module}/2026/06/{name}",
        **kw,
    )


async def seed(client, db, *, with_repair=True):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    await make_user(db, username="filesadmin", role="admin", permissions=["afiles"])
    await login(client, "filesadmin")

    files = [
        make_file(club.id, user.id, module="reports", name="photo.jpg", size=500),
        make_file(club.id, user.id, module="eval", name="doc.pdf", size=300),
        # 已歸檔:已離盤,不計佔用
        make_file(
            club.id, user.id, module="reports", name="old.jpg", size=9999,
            archived_at=datetime.now(UTC),
        ),
    ]
    if with_repair:
        files.append(make_file(club.id, user.id, module="maintenance", name="leak.mp4", size=8000))
        files.append(make_file(club.id, user.id, module="maintenance", name="door.mov", size=2000))
    db.add_all(files)
    await db.commit()
    for f in files:
        await db.refresh(f)
    return club, files


async def test_usage_summary_with_db_text_and_repair_first(client, db, monkeypatch):
    await seed(client, db)
    # 磁碟空間 mock 給定值:斷言不再依宿主磁碟狀態(CI 磁碟極滿也不脆化)
    import collections

    from app.services import files as file_service

    usage = collections.namedtuple("usage", "total used free")
    monkeypatch.setattr(
        file_service.shutil, "disk_usage", lambda p: usage(100_000, 70_000, 30_000)
    )

    data = (await client.get("/api/v1/admin/files/usage")).json()["data"]
    # 有報修檔案 → repair 排第一,其餘依固定順序
    assert [m["key"] for m in data["modules"]] == ["repair", "close", "eval", "apply", "apps"]
    by_key = {m["key"]: m for m in data["modules"]}
    assert (by_key["repair"]["size"], by_key["repair"]["count"]) == (10000, 2)
    assert (by_key["close"]["size"], by_key["close"]["count"]) == (500, 1)  # 已歸檔不計
    assert (by_key["eval"]["size"], by_key["eval"]["count"]) == (300, 1)
    assert by_key["apps"]["count"] == 0
    # 「文字內容」= 整個 DB 的估算大小(pg_database_size)
    assert data["db_size"] > 0
    assert data["total_size"] == 10800 + data["db_size"]
    # 實際磁碟總量/可用空間(2026-07-17 改磁碟空間;capacity/remaining 已改名)
    assert data["disk_total"] == 100_000
    assert data["disk_free"] == 30_000


async def test_usage_order_without_repair_files(client, db):
    await seed(client, db, with_repair=False)
    data = (await client.get("/api/v1/admin/files/usage")).json()["data"]
    assert [m["key"] for m in data["modules"]] == ["close", "eval", "apply", "apps", "repair"]


async def test_large_file_list_filter_and_sort(client, db):
    club, files = await seed(client, db)

    body = (await client.get("/api/v1/admin/files")).json()
    sizes = [f["size"] for f in body["data"]]
    assert sizes == sorted(sizes, reverse=True)  # 預設依大小降冪
    assert body["data"][0]["original_name"] == "old.jpg"
    assert body["data"][0]["archived"] is True
    assert body["data"][0]["club_name"] == "熱舞社"

    data = (await client.get("/api/v1/admin/files", params={"module": "repair"})).json()["data"]
    assert {f["original_name"] for f in data} == {"leak.mp4", "door.mov"}
    assert all(f["module"] == "repair" for f in data)

    assert (await client.get("/api/v1/admin/files", params={"module": "xxx"})).status_code == 422
    assert (await client.get("/api/v1/admin/files", params={"sort": "name"})).status_code == 422
    assert (
        await client.get("/api/v1/admin/files", params={"sort": "-created_at"})
    ).status_code == 200


async def test_delete_repair_file_only(client, db):
    club, files = await seed(client, db)
    repair = next(f for f in files if f.path.startswith("maintenance/") and "leak" in f.path)
    photo = next(f for f in files if f.path.startswith("reports/") and f.archived_at is None)

    # 非報修模組 → 403
    resp = await client.delete(f"/api/v1/admin/files/{photo.id}", headers=csrf_headers(client))
    assert resp.status_code == 403

    # 報修檔案可刪,記 audit
    resp = await client.delete(f"/api/v1/admin/files/{repair.id}", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text
    assert await db.scalar(sa.select(sa.func.count()).where(File.id == repair.id)) == 0
    audit_count = await db.scalar(
        sa.select(sa.func.count()).where(AuditLog.action == "repair_file_deleted")
    )
    assert audit_count == 1

    # 彙總同步反映
    data = (await client.get("/api/v1/admin/files/usage")).json()["data"]
    by_key = {m["key"]: m for m in data["modules"]}
    assert (by_key["repair"]["size"], by_key["repair"]["count"]) == (2000, 1)

    # 權限:無 afiles → 403
    await make_user(db, username="other", role="admin", permissions=["aact"])
    await login(client, "other")
    assert (await client.get("/api/v1/admin/files/usage")).status_code == 403