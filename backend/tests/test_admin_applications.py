"""線上申請管理(/admin,權限鍵 aapply):幹部證明/郵局帳戶異動的最小審核(2026-07-17)。"""

import sqlalchemy as sa

from app.models import AuditLog, File, OfficerCertificate, PostalAccountChange, User
from app.models.enums import CertPosition
from tests.conftest import csrf_headers, login, make_club, make_user

CERT_URL = "/api/v1/admin/officer-certificates"
POSTAL_URL = "/api/v1/admin/postal-changes"


async def seed(client, db):
    club = await make_club(db)
    await make_user(db, username="clubuser", club_id=club.id)
    await make_user(db, username="applyadmin", role="admin", permissions=["acert", "apostal"])
    await make_user(db, username="other", role="admin", permissions=["aviol"])
    cert = OfficerCertificate(
        club_id=club.id, term="114-2", position=CertPosition.LEADER, applicant_name="王小明"
    )
    postal = PostalAccountChange(
        club_id=club.id, reasons=["印鑑變更"], account_name="熱舞社",
        account_number="0001234567890",
    )
    db.add_all([cert, postal])
    await db.commit()
    await db.refresh(cert)
    await db.refresh(postal)
    await login(client, "applyadmin")
    return club, cert, postal


async def test_permission_gate(client, db):
    _, cert, postal = await seed(client, db)
    await login(client, "other")
    assert (await client.get(CERT_URL)).status_code == 403
    assert (await client.get(POSTAL_URL)).status_code == 403
    resp = await client.post(
        f"{CERT_URL}/{cert.id}/status",
        json={"status": "processing"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403


async def test_officer_cert_status_flow(client, db):
    club, cert, _ = await seed(client, db)

    data = (await client.get(CERT_URL)).json()["data"]
    assert [d["status"] for d in data] == ["pending"]
    assert data[0]["club_name"] == club.name
    assert data[0]["applicant_name"] == "王小明"

    # 只能往前:審核中 → 處理中 → 已完成
    resp = await client.post(
        f"{CERT_URL}/{cert.id}/status",
        json={"status": "processing"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "processing"
    resp = await client.post(
        f"{CERT_URL}/{cert.id}/status",
        json={"status": "completed"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    # 回退擋下:已完成的單不能退回處理中
    resp = await client.post(
        f"{CERT_URL}/{cert.id}/status",
        json={"status": "processing"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "INVALID_STATUS_TRANSITION"

    # 社團端看得到新狀態
    await login(client, "clubuser")
    listing = (await client.get("/api/v1/club/officer-certificates")).json()["data"]
    assert listing[0]["status"] == "completed"

    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert "officer_cert_status_updated" in actions


async def test_status_can_skip_processing(client, db):
    """審核中可直接跳到已完成(D-25):承辦當場開完證明就結案,不必先點一次處理中。

    「處理中」在這裡只是承辦的工作註記,跳過它不會漏掉任何一次真實動作。
    """
    _, cert, postal = await seed(client, db)

    resp = await client.post(
        f"{CERT_URL}/{cert.id}/status",
        json={"status": "completed"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "completed"

    # 郵局異動共用同一條狀態機
    resp = await client.post(
        f"{POSTAL_URL}/{postal.id}/status",
        json={"status": "completed"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text


async def test_postal_change_carries_the_passbook(client, db):
    """存簿影本是核對局號帳號的依據:單子上就要看得到。"""
    club, _, postal = await seed(client, db)
    admin = await db.scalar(sa.select(User).where(User.username == "applyadmin"))
    db.add(
        File(
            club_id=club.id,
            uploaded_by=admin.id,
            original_name="存簿.jpg",
            size=100,
            mime="image/jpeg",
            sha256="c" * 64,
            path="postal/2026/08/c",
            subject_type="postal_change",
            subject_id=postal.id,
            slot="passbook",
        )
    )
    await db.commit()

    data = (await client.get(POSTAL_URL)).json()["data"]
    assert [f["original_name"] for f in data[0]["passbook"]] == ["存簿.jpg"]


async def test_postal_change_status_flow(client, db):
    club, _, postal = await seed(client, db)

    data = (await client.get(POSTAL_URL)).json()["data"]
    assert data[0]["club_name"] == club.name
    assert data[0]["account_number"] == "0001234567890"

    resp = await client.post(
        f"{POSTAL_URL}/{postal.id}/status",
        json={"status": "processing"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    resp = await client.post(
        f"{POSTAL_URL}/{postal.id}/status",
        json={"status": "completed"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    await login(client, "clubuser")
    listing = (await client.get("/api/v1/club/postal-changes")).json()["data"]
    assert listing[0]["status"] == "completed"

    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert "postal_change_status_updated" in actions


async def test_status_not_found(client, db):
    await seed(client, db)
    resp = await client.post(
        f"{CERT_URL}/99999/status",
        json={"status": "processing"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 404
