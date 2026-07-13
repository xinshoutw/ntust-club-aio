from datetime import date, timedelta

import sqlalchemy as sa

from app.models import Award, SignupDraft, SignupItem
from app.models.enums import AwardKind
from tests.conftest import csrf_headers, login, make_club, make_user

FIELDS = [
    {"key": "name", "label": "姓名", "type": "text", "required": True},
    {"key": "diet", "label": "葷素", "type": "radio", "options": ["葷", "素"], "required": True},
    {"key": "note", "label": "備註", "type": "textarea", "required": False},
]


async def make_item(db, admin_id: int, **kw) -> SignupItem:
    defaults = dict(
        year=114,
        name="社團負責人研習",
        description="",
        is_open=True,
        deadline=date.today() + timedelta(days=7),
        allow_multiple=True,
        max_participants=3,
        fields=FIELDS,
        created_by=admin_id,
    )
    item = SignupItem(**{**defaults, **kw})
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def setup(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    admin = await make_user(db, username="admin01", role="admin")
    await login(client, "club01")
    return club, admin


def participants(*names, diet="葷"):
    return [{"answers": {"name": n, "diet": diet}} for n in names]


async def test_signup_flow_with_field_validation(client, db):
    club, admin = await setup(client, db)
    item = await make_item(db, admin.id)

    # 缺必填 → 422
    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": [{"answers": {"name": "王小明"}}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 選項外的值 → 422
    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("王小明", diet="全素")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 未知欄位 → 422
    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": [{"answers": {"name": "王", "diet": "葷", "hack": 1}}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 超過上限 → 422
    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("甲", "乙", "丙", "丁")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("甲", "乙")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    # 一經報名不得更改
    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("丙")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    detail = (await client.get(f"/api/v1/club/signup-items/{item.id}")).json()["data"]
    assert detail["my_status"] == "signed"
    assert len(detail["my_signup"]["entries"]) == 2


async def test_draft_cross_device_and_cleared_on_submit(client, db):
    club, admin = await setup(client, db)
    item = await make_item(db, admin.id)

    resp = await client.put(
        f"/api/v1/club/signup-items/{item.id}/draft",
        json={"participants": [{"name": "先存一半"}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200

    detail = (await client.get(f"/api/v1/club/signup-items/{item.id}")).json()["data"]
    assert detail["my_status"] == "draft"
    assert detail["my_draft"] == [{"name": "先存一半"}]

    # 覆寫草稿
    await client.put(
        f"/api/v1/club/signup-items/{item.id}/draft",
        json={"participants": [{"name": "改好了"}]},
        headers=csrf_headers(client),
    )
    detail = (await client.get(f"/api/v1/club/signup-items/{item.id}")).json()["data"]
    assert detail["my_draft"] == [{"name": "改好了"}]

    await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("甲")},
        headers=csrf_headers(client),
    )
    assert await db.scalar(sa.select(sa.func.count()).select_from(SignupDraft)) == 0

    # 報名後不可再存草稿
    resp = await client.put(
        f"/api/v1/club/signup-items/{item.id}/draft",
        json={"participants": []},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409


async def test_single_participant_and_deadline(client, db):
    club, admin = await setup(client, db)
    single = await make_item(
        db, admin.id, name="單人活動", allow_multiple=False, max_participants=None
    )

    resp = await client.post(
        f"/api/v1/club/signup-items/{single.id}/signup",
        json={"participants": participants("甲", "乙")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    closed = await make_item(
        db, admin.id, name="過期活動", deadline=date.today() - timedelta(days=1)
    )
    resp = await client.post(
        f"/api/v1/club/signup-items/{closed.id}/signup",
        json={"participants": participants("甲")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409


async def test_eval_signup_requires_awards(client, db):
    club, admin = await setup(client, db)
    db.add(Award(id="club", name="最佳社團獎", kind=AwardKind.GROUP))
    await db.commit()
    item = await make_item(db, admin.id, name="社團競賽報名", is_eval=True)

    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("甲")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422  # 未勾獎項

    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("甲"), "awards": ["nope"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422  # 未知獎項

    resp = await client.post(
        f"/api/v1/club/signup-items/{item.id}/signup",
        json={"participants": participants("甲"), "awards": ["club"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    detail = (await client.get(f"/api/v1/club/signup-items/{item.id}")).json()["data"]
    assert detail["my_signup"]["awards"] == ["club"]


async def test_list_shows_my_status(client, db):
    club, admin = await setup(client, db)
    a = await make_item(db, admin.id, name="活動A")
    b = await make_item(db, admin.id, name="活動B")
    await make_item(db, admin.id, name="活動C")

    await client.post(
        f"/api/v1/club/signup-items/{a.id}/signup",
        json={"participants": participants("甲")},
        headers=csrf_headers(client),
    )
    await client.put(
        f"/api/v1/club/signup-items/{b.id}/draft",
        json={"participants": [{}]},
        headers=csrf_headers(client),
    )

    rows = (await client.get("/api/v1/club/signup-items")).json()["data"]
    status_by_name = {r["name"]: r["my_status"] for r in rows}
    assert status_by_name == {"活動A": "signed", "活動B": "draft", "活動C": "none"}
