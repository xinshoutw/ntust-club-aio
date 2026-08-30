import io
from datetime import date, timedelta

import sqlalchemy as sa

from app.core.config import settings
from app.models import Activity, ApprovalRecord, AuditLog, SystemSetting
from tests.conftest import csrf_headers, login, make_club, make_user

JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def payload(**overrides) -> dict:
    base = {
        "name": "期末成果展",
        "type": "活動",
        "is_large": False,
        "date": "2026-06-20",
        "start_time": "18:00",
        "end_time": "21:00",
        "location": "學生活動中心",
        "content": "年度成果發表",
        "participants_in": 30,
        "participants_out": 10,
        "staff_text": "總務>陳大文",
        "budget_items": [
            {
                "category": "膳食費",
                "description": "工作人員便當",
                "self_fund": 1000,
                "requested_subsidy": 2000,
            },
            {"category": "印刷費", "description": "海報", "self_fund": 0, "requested_subsidy": 500},
        ],
    }
    return {**base, **overrides}


async def setup_session(client, db, username="club01", name="熱舞社"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


async def create_activity(client, **overrides) -> dict:
    resp = await client.post(
        "/api/v1/club/activities", json=payload(**overrides), headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def approve(db, activity_id: int, **values):
    await db.execute(
        sa.update(Activity).where(Activity.id == activity_id).values(status="approved", **values)
    )
    await db.commit()


async def upload_photo(client, aid: int, content: bytes = JPG, name: str = "photo.jpg") -> str:
    files = {"file": (name, io.BytesIO(content), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


def close_payload(**overrides) -> dict:
    base = {
        "member_count": 25,
        "non_member_count": 8,
        "actual_start": "18:10",
        "actual_end": "21:05",
        "actual_location": "學生活動中心",
        "highlights": "成果展演出順利",
        "goals": "展現年度練習成果",
        "others": "無",
        "review_meeting": False,
        "review_date": None,
        "video_url": None,
        "expense": 3200,
        "reflections": [
            {"student_name": f"社員{i}", "dept": "資工三", "body": "收穫很多"} for i in range(3)
        ],
    }
    return {**base, **overrides}


async def test_create_draft_with_budget_and_derived_totals(client, db):
    await setup_session(client, db)
    data = await create_activity(client)
    assert data["status"] == "draft"
    assert data["self_fund_total"] == 1000
    assert data["requested_total"] == 2500
    assert data["semester"] == "114-2"


async def test_negative_amounts_are_rejected_by_the_database(client, db):
    """金額/件數的下界:schema 擋 API,匯入腳本與 raw SQL 由 CHECK 收口。"""
    import pytest
    from sqlalchemy.exc import IntegrityError

    await setup_session(client, db)
    activity_id = (await create_activity(client))["id"]
    for sql, params in [
        ("UPDATE activities SET school_approved = -1 WHERE id = :id", {"id": activity_id}),
        ("UPDATE activity_budget_items SET requested_subsidy = -1 WHERE activity_id = :id",
         {"id": activity_id}),
        ("UPDATE activities SET participants_in = -1 WHERE id = :id", {"id": activity_id}),
    ]:
        with pytest.raises(IntegrityError):
            await db.execute(sa.text(sql), params)
            await db.flush()
        await db.rollback()


async def test_reading_tolerates_rows_longer_than_the_input_limit(client, db):
    """輸出 schema 不得沿用輸入的長度限制:舊系統遷入的明細有 633 字。

    沿用的話使用者什麼都沒做錯,活動卻一點開就 500(遷移資料實測 60 個活動打不開)。
    """
    await setup_session(client, db)
    activity_id = (await create_activity(client))["id"]
    long_text = "線" * 633  # BudgetItemIn 的上限是 200
    await db.execute(
        sa.text("UPDATE activity_budget_items SET description = :d WHERE activity_id = :id"),
        {"d": long_text, "id": activity_id},
    )
    await db.commit()

    resp = await client.get(f"/api/v1/club/activities/{activity_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["budget_items"][0]["description"] == long_text

    # 送件端的限制不受影響:超長仍然擋得住
    resp = await client.post(
        "/api/v1/club/activities",
        json={"name": "超長", "budget_items": [{"category": "印刷費", "description": long_text}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_budget_category_check_tolerates_legacy_strings(client, db):
    """殘留舊 list[str] 經費科目設定時,建立申請與 /club/config 都不得 500。"""
    await setup_session(client, db)
    db.add(SystemSetting(key="budget_categories", value=["膳食費", "印刷費"]))
    await db.commit()

    await create_activity(client)  # payload 科目為 膳食費/印刷費 → 校驗通過
    cfg = (await client.get("/api/v1/club/config")).json()["data"]
    assert cfg["budget_categories"] == [
        {"name": "膳食費", "hint": ""},
        {"name": "印刷費", "hint": ""},
    ]


async def test_validation_rules(client, db):
    await setup_session(client, db)
    bad_time = payload(end_time="17:00")
    resp = await client.post(
        "/api/v1/club/activities", json=bad_time, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 結束日早於開始日 → 422
    bad_range = payload(end_date="2026-06-19")
    resp = await client.post(
        "/api/v1/club/activities", json=bad_range, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    large_course = payload(type="社課或會議", is_large=True)
    resp = await client.post(
        "/api/v1/club/activities", json=large_course, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    bad_category = payload(
        budget_items=[{"category": "灰色支出", "self_fund": 1, "requested_subsidy": 0}]
    )
    resp = await client.post(
        "/api/v1/club/activities", json=bad_category, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_submit_flow_and_edit_guard(client, db):
    await setup_session(client, db)
    future = (date.today() + timedelta(days=30)).isoformat()
    data = await create_activity(client, date=future)
    aid = data["id"]

    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "pending_advisor"

    # 送審後不可修改/刪除/重複送審
    resp = await client.put(
        f"/api/v1/club/activities/{aid}", json=payload(date=future), headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    resp = await client.delete(f"/api/v1/club/activities/{aid}", headers=csrf_headers(client))
    assert resp.status_code == 409
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 409


async def test_deleting_a_draft_is_audited(client, db):
    """整張單連同附件實體刪除,事後只剩稽核查得到刪了什麼。"""
    await setup_session(client, db)
    activity = await create_activity(client)
    await client.post(
        f"/api/v1/club/activities/{activity['id']}/attachments",
        files={"file": ("企劃書.pdf", io.BytesIO(b"%PDF-1.7 " + b"\x00" * 32), "application/pdf")},
        headers=csrf_headers(client),
    )

    resp = await client.delete(
        f"/api/v1/club/activities/{activity['id']}", headers=csrf_headers(client)
    )
    assert resp.status_code == 200

    detail = await db.scalar(
        sa.select(AuditLog.detail).where(AuditLog.action == "activity_deleted")
    )
    assert activity["name"] in detail
    assert "files=1" in detail


async def test_new_application_rejects_past_start_but_a_rejected_one_keeps_its_date(client, db):
    """過去時間全面禁止(2026-07-21):送審/退回重送擋過去開始時刻;草稿不擋。"""
    await setup_session(client, db)
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # 過去日期仍可存草稿(結案補登等歷史草稿沿用既有行為)
    data = await create_activity(client, date=yesterday)
    aid = data["id"]
    assert data["status"] == "draft"

    # 送審 → 422
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    assert "早於現在" in resp.json()["error"]

    # 改為未來即可送審
    future = (date.today() + timedelta(days=7)).isoformat()
    resp = await client.put(
        f"/api/v1/club/activities/{aid}", json=payload(date=future), headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200

    # 退回件照原日期重送:活動日期常在審核往返之間就過了,不該逼社團改日期
    # (decisions.md D-05;新申請仍禁過去,即上面那段)。
    # 模擬「送審期間日期就過了」:直接把單據的日期挪到昨天,再退回
    await db.execute(
        sa.update(Activity)
        .where(Activity.id == aid)
        .values(status="rejected", date=date.fromisoformat(yesterday),
                end_date=date.fromisoformat(yesterday))
    )
    await db.commit()
    resp = await client.put(
        f"/api/v1/club/activities/{aid}",
        json=payload(date=yesterday),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["date"] == yesterday


async def test_rejected_activity_cannot_be_moved_further_into_the_past(client, db):
    """退回件可照原日期重送,但不得再往更早的日期改(decisions.md D-05)。

    活動日期決定它落在哪一個學期,而評鑑逐學期採計 —— 往回搬等於把活動塞進
    一個已經結案的評鑑年度。
    """
    await setup_session(client, db)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    long_ago = (date.today() - timedelta(days=200)).isoformat()
    future = (date.today() + timedelta(days=7)).isoformat()

    data = await create_activity(client, date=future)
    aid = data["id"]
    await db.execute(
        sa.update(Activity)
        .where(Activity.id == aid)
        .values(status="rejected", date=date.fromisoformat(yesterday),
                end_date=date.fromisoformat(yesterday))
    )
    await db.commit()

    back = await client.put(
        f"/api/v1/club/activities/{aid}",
        json=payload(date=long_ago),
        headers=csrf_headers(client),
    )
    assert back.status_code == 422
    assert "不得再往前" in back.json()["error"]

    # 往未來改一律放行
    ahead = await client.put(
        f"/api/v1/club/activities/{aid}", json=payload(date=future), headers=csrf_headers(client)
    )
    assert ahead.status_code == 200


async def test_club_detail_never_carries_the_approver_name(client, db):
    """簽核者姓名是行政端詳情才填的(ApprovalOut.actor_name 預設空字串)。

    社團端與行政端共用同一個 schema,而「填不進去」目前只是因為 ApprovalRecord
    沒有 actor_name 屬性 —— 哪天有人加上 actor relationship 或改成 join,就直接漏。
    社團看得到自己被誰退回沒有意義,而承辦人姓名是個資。
    """
    club = await setup_session(client, db)
    activity = await create_activity(client)
    admin = await make_user(db, username="reviewer", role="admin", name="承辦人張三")
    db.add(
        ApprovalRecord(
            subject_type="activity",
            subject_id=activity["id"],
            stage="advisor",
            decision="approve",
            actor_id=admin.id,
        )
    )
    await db.commit()

    resp = await client.get(f"/api/v1/club/activities/{activity['id']}")
    assert resp.status_code == 200, resp.text
    approvals = resp.json()["data"]["approvals"]
    assert len(approvals) == 1
    assert approvals[0]["actor_name"] is None  # None=這一端不提供,不是「姓名是空白」
    assert "承辦人張三" not in resp.text
    assert club.id == activity["club_id"]


async def test_club_scoping(client, db):
    await setup_session(client, db)
    data = await create_activity(client)

    other = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other.id)
    await login(client, "club02")
    resp = await client.get(f"/api/v1/club/activities/{data['id']}")
    assert resp.status_code == 404


async def test_close_requires_approved_and_ended(client, db):
    await setup_session(client, db)
    future = (date.today() + timedelta(days=30)).isoformat()
    data = await create_activity(client, date=future)
    aid = data["id"]

    # 未核准不可結案
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 已核准但未結束
    await approve(db, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert "尚未結束" in resp.json()["error"]


async def test_close_eligibility_and_lock_derive_from_end_date(client, db):
    """起訖區間(2026-07-15):結案資格與逾期鎖定皆以 end_date 推導。"""
    await setup_session(client, db)

    # 開始已過、結束在未來 → 進行中不可結案
    start = (date.today() - timedelta(days=5)).isoformat()
    end = (date.today() + timedelta(days=5)).isoformat()
    data = await create_activity(client, date=start, end_date=end)
    assert data["end_date"] == end
    await approve(db, data["id"])
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert "尚未結束" in resp.json()["error"]

    # 開始日已逾結案期限但結束日在近期 → 以 end_date 推導,不鎖定、可結案
    start = (date.today() - timedelta(days=70)).isoformat()
    end = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, name="跨日活動", date=start, end_date=end)
    await approve(db, data["id"])
    await upload_photo(client, data["id"])
    listing = (await client.get("/api/v1/club/activities")).json()["data"]
    row = next(a for a in listing if a["id"] == data["id"])
    assert row["close_locked"] is False
    assert row["can_close"] is True
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200


async def test_close_submit_and_report(client, db):
    await setup_session(client, db)
    past = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, date=past)
    aid = data["id"]
    await approve(db, aid)

    # 結案草稿寫 DB、跨裝置續填
    resp = await client.put(
        f"/api/v1/club/activities/{aid}/close-draft",
        json={"data": {"highlights": "先寫一半"}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    detail = (await client.get(f"/api/v1/club/activities/{aid}")).json()["data"]
    assert detail["close_draft"] == {"highlights": "先寫一半"}
    assert detail["can_close"] is True

    # 心得不足 3 筆 → 422
    bad = close_payload()
    bad["reflections"] = bad["reflections"][:2]
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close", json=bad, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 檢討會=是 但沒日期 → 422
    bad = close_payload(review_meeting=True)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close", json=bad, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 檢討會=是:日期/與會人數/討論事項/內容決議四欄皆必填(2026-07-15)
    review = {
        "review_meeting": True,
        "review_date": "2026-06-21",
        "review_attendees": 12,
        "review_topics": "動線與器材調度",
        "review_conclusion": "下次提前一週彩排",
    }
    async def close_error(**overrides) -> str:
        # 此時尚未上傳照片,零照片本身就會 422 —— 要看訊息才知道擋在哪一關
        resp = await client.post(
            f"/api/v1/club/activities/{aid}/close",
            json=close_payload(**{**review, **overrides}),
            headers=csrf_headers(client),
        )
        assert resp.status_code == 422
        return " ".join(d["msg"] for d in resp.json()["meta"].get("detail", []))

    for missing in ("review_attendees", "review_topics", "review_conclusion"):
        assert "必須填寫" in await close_error(**{missing: None}), missing

    # 與會 0 人不是「開過會」(前端 InputNumber min=1,直呼 API 也不放行)
    assert "與會人數" in await close_error(review_attendees=0)

    # 零照片 → 422(照片檢核收口到後端,直呼 API 也擋)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(**review),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "照片" in resp.json()["error"]

    await upload_photo(client, aid)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(**review),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "closing_pending_advisor"

    detail = (await client.get(f"/api/v1/club/activities/{aid}")).json()["data"]
    assert detail["close_draft"] is None  # 送出即清除草稿
    assert detail["report"]["member_count"] == 25
    assert len(detail["report"]["reflections"]) == 3
    assert detail["report"]["review_attendees"] == 12
    assert detail["report"]["review_topics"] == "動線與器材調度"
    assert detail["report"]["review_conclusion"] == "下次提前一週彩排"


def test_close_lock_boundary_is_the_whole_deadline_day():
    """期限日當天整天仍可結案,隔日零時起鎖定(改天制後這條界線只剩這裡驗)。"""
    from datetime import datetime, time

    from app.core.semesters import TAIPEI
    from app.models.enums import ActivityStatus
    from app.services.activity_service import is_close_locked

    base = date(2026, 3, 1)
    activity = Activity(
        status=ActivityStatus.APPROVED, close_unlocked=False, date=base, end_date=base
    )
    last_moment = datetime.combine(base + timedelta(days=30), time(23, 59), tzinfo=TAIPEI)
    assert not is_close_locked(activity, 30, last_moment)
    assert is_close_locked(activity, 30, last_moment + timedelta(minutes=1))


async def test_close_locked_after_deadline(client, db):
    await setup_session(client, db)
    stale = (date.today() - timedelta(days=63)).isoformat()  # 遠超過任何合理的 close_lock_days
    data = await create_activity(client, date=stale)
    aid = data["id"]
    await approve(db, aid)
    await upload_photo(client, aid)

    listing = (await client.get("/api/v1/club/activities")).json()["data"]
    assert listing[0]["close_locked"] is True
    assert listing[0]["can_close"] is False

    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert "鎖定" in resp.json()["error"]

    # 管理員解鎖後可結案
    await approve(db, aid, close_unlocked=True)
    resp = await client.post(
        f"/api/v1/club/activities/{aid}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200


async def test_photo_upload_dedupe_and_delete(client, db):
    await setup_session(client, db)
    past = (date.today() - timedelta(days=3)).isoformat()
    a1 = await create_activity(client, date=past)
    a2 = await create_activity(client, name="另一活動", date=past)
    await approve(db, a1["id"])
    await approve(db, a2["id"])

    files = {"file": ("photo.jpg", io.BytesIO(JPG), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{a1['id']}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 201
    file_id = resp.json()["data"]["id"]

    # 跨活動同內容 → 擋(SHA-256)
    files = {"file": ("renamed.jpg", io.BytesIO(JPG), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{a2['id']}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    resp = await client.delete(
        f"/api/v1/club/activities/{a1['id']}/photos/{file_id}", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    # 照片刪了就無從還原,稽核要留下誰刪了哪張
    logged = await db.scalar(
        sa.select(AuditLog.detail).where(AuditLog.action == "activity_photo_deleted")
    )
    assert "photo.jpg" in logged

    # 刪掉後可重傳
    files = {"file": ("photo.jpg", io.BytesIO(JPG), "image/jpeg")}
    resp = await client.post(
        f"/api/v1/club/activities/{a2['id']}/photos", files=files, headers=csrf_headers(client)
    )
    assert resp.status_code == 201
    a2_file = resp.json()["data"]["id"]

    # 結案送出後照片不可再刪(送出 vs 刪除以活動列鎖序列化,先送出者勝)
    resp = await client.post(
        f"/api/v1/club/activities/{a2['id']}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    resp = await client.delete(
        f"/api/v1/club/activities/{a2['id']}/photos/{a2_file}", headers=csrf_headers(client)
    )
    assert resp.status_code == 409


async def test_close_docs_share_the_photo_quota(client, db):
    """結案附件:收 PDF/影像,與照片共用 close_photo_total_mb,送出結案後不可再刪。"""
    from app.models import SystemSetting

    await setup_session(client, db)
    db.add(SystemSetting(key="close_photo_total_mb", value=1))  # 1MB 共用上限
    await db.commit()
    past = (date.today() - timedelta(days=3)).isoformat()
    activity = await create_activity(client, date=past)
    await approve(db, activity["id"])
    docs = f"/api/v1/club/activities/{activity['id']}/docs"

    pdf = b"%PDF-1.7 " + b"\x00" * 700_000  # ~0.7MB
    resp = await client.post(
        docs, files={"file": ("保單.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["data"]["id"]

    # 額度是照片與附件合計:附件吃掉 0.7MB 後,照片這一側也要看得到
    resp = await client.post(
        f"/api/v1/club/activities/{activity['id']}/photos",
        files={"file": ("big.jpg", io.BytesIO(JPG + b"\x00" * 700_000), "image/jpeg")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 413
    assert resp.json()["meta"]["code"] == "FILE_TOO_LARGE"

    # 不在預覽得了的四類之內 → 415
    resp = await client.post(
        docs, files={"file": ("單據.zip", io.BytesIO(b"PK\x03\x04"), "application/zip")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 415

    detail = (await client.get(f"/api/v1/club/activities/{activity['id']}")).json()["data"]
    assert [f["original_name"] for f in detail["close_docs"]] == ["保單.pdf"]

    await upload_photo(client, activity["id"])
    resp = await client.post(
        f"/api/v1/club/activities/{activity['id']}/close",
        json=close_payload(),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    resp = await client.delete(f"{docs}/{doc_id}", headers=csrf_headers(client))
    assert resp.status_code == 409


async def test_deleting_a_draft_sweeps_every_slot(client, db):
    """刪草稿要掃三個 slot:files 對活動是 subject_id 軟關聯,沒有 FK cascade ——
    漏掃一個 slot 就是 DB 列與磁碟檔一起變孤兒,還繼續佔社團儲存配額。"""
    from app.models import File

    await setup_session(client, db)
    past = (date.today() - timedelta(days=3)).isoformat()
    activity = await create_activity(client, date=past)
    aid = activity["id"]
    await client.post(
        f"/api/v1/club/activities/{aid}/attachments",
        files={"file": ("企劃書.pdf", io.BytesIO(b"%PDF-1.7 "), "application/pdf")},
        headers=csrf_headers(client),
    )
    # 結案照片與附件只有已核准才收得下;先核准、傳完再放回草稿,製造三個 slot 都有檔的列
    await approve(db, aid)
    await upload_photo(client, aid)
    await client.post(
        f"/api/v1/club/activities/{aid}/docs",
        files={"file": ("保單.pdf", io.BytesIO(b"%PDF-1.7 "), "application/pdf")},
        headers=csrf_headers(client),
    )
    await db.execute(sa.update(Activity).where(Activity.id == aid).values(status="draft"))
    await db.commit()
    assert await db.scalar(sa.select(sa.func.count()).select_from(File)) == 3

    resp = await client.delete(f"/api/v1/club/activities/{aid}", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text
    assert await db.scalar(sa.select(sa.func.count()).select_from(File)) == 0
    assert not [p for p in settings.upload_dir.rglob("*") if p.is_file()]


async def test_list_filters_and_sorting(client, db):
    await setup_session(client, db)
    await create_activity(client, name="甲", date="2026-03-01", type="社課或會議")
    await create_activity(client, name="乙", date="2026-04-01", type="活動")
    await create_activity(client, name="丙", date="2025-10-10", type="社課或會議")

    resp = await client.get("/api/v1/club/activities", params={"semester": "114-2"})
    assert resp.json()["meta"]["total"] == 2

    resp = await client.get("/api/v1/club/activities", params={"type": "社課或會議"})
    assert [a["name"] for a in resp.json()["data"]] == ["甲", "丙"]  # 預設 date desc

    resp = await client.get("/api/v1/club/activities", params={"sort": "date"})
    assert [a["name"] for a in resp.json()["data"]] == ["丙", "甲", "乙"]

    resp = await client.get("/api/v1/club/activities/semesters")
    assert resp.json()["data"] == ["114-2", "114-1"]


async def test_closable_filter_matches_the_python_derivation(client, db):
    """結案清單改由 DB 端篩:SQL 版 can_close 與 Python 版必須給同一個答案。"""
    await setup_session(client, db)
    today = date.today()

    ended = await create_activity(
        client, name="可結案", date=(today - timedelta(days=3)).isoformat()
    )
    await approve(db, ended["id"])
    future = await create_activity(
        client, name="還沒結束", date=(today + timedelta(days=7)).isoformat()
    )
    await approve(db, future["id"])
    locked = await create_activity(
        client, name="已鎖定", date=(today - timedelta(days=63)).isoformat()
    )
    await approve(db, locked["id"])
    await create_activity(client, name="未核准", date=(today - timedelta(days=3)).isoformat())

    resp = await client.get("/api/v1/club/activities", params={"closable": "true"})
    assert [a["name"] for a in resp.json()["data"]] == ["可結案"]
    assert resp.json()["meta"]["total"] == 1

    # 每一列的 can_close 欄(Python 端)與篩選(SQL 端)不得分歧
    rows = (await client.get("/api/v1/club/activities")).json()["data"]
    assert {a["name"] for a in rows if a["can_close"]} == {"可結案"}


async def test_status_filter_uses_the_displayed_status(client, db):
    """畫面把逾期鎖定的已核准列顯示成「已逾期」:狀態篩選要跟著同一條判定分開兩者。"""
    await setup_session(client, db)
    today = date.today()
    fresh = await create_activity(
        client, name="剛核准", date=(today - timedelta(days=3)).isoformat()
    )
    await approve(db, fresh["id"])
    locked = await create_activity(
        client, name="已逾期", date=(today - timedelta(days=63)).isoformat()
    )
    await approve(db, locked["id"])

    resp = await client.get("/api/v1/club/activities", params={"status": "approved"})
    assert [a["name"] for a in resp.json()["data"]] == ["剛核准"]
    resp = await client.get("/api/v1/club/activities", params={"status": "locked"})
    data = resp.json()["data"]
    assert [a["name"] for a in data] == ["已逾期"]
    assert data[0]["close_locked"] is True

    # 多值取聯集:兩種一起選就是全部已核准的
    resp = await client.get(
        "/api/v1/club/activities", params=[("status", "approved"), ("status", "locked")]
    )
    assert {a["name"] for a in resp.json()["data"]} == {"剛核准", "已逾期"}
    # 未知狀態 → 422(不是靜默不篩)
    assert (
        await client.get("/api/v1/club/activities", params={"status": "hack"})
    ).status_code == 422


async def test_ended_filter_for_the_booking_dropdown(client, db):
    """借用綁定的活動下拉只要「還沒結束」的:條件與 can_close 的已結束那一半同源。"""
    await setup_session(client, db)
    today = date.today()
    past = await create_activity(
        client, name="已結束", date=(today - timedelta(days=1)).isoformat()
    )
    await approve(db, past["id"])
    soon = await create_activity(
        client, name="還沒結束", date=(today + timedelta(days=7)).isoformat()
    )
    await approve(db, soon["id"])

    resp = await client.get(
        "/api/v1/club/activities", params={"status": "approved", "ended": "false"}
    )
    assert [a["name"] for a in resp.json()["data"]] == ["還沒結束"]
    resp = await client.get(
        "/api/v1/club/activities", params={"status": "approved", "ended": "true"}
    )
    assert [a["name"] for a in resp.json()["data"]] == ["已結束"]


async def test_status_sort_follows_the_workflow_order(client, db):
    """狀態排序照流程順序;排列舉字面值的話 approved 會跑到待審核前面。"""
    await setup_session(client, db)
    draft = await create_activity(client, name="草稿")
    approved = await create_activity(client, name="已核准")
    await approve(db, approved["id"])
    rejected = await create_activity(client, name="已退回")
    await db.execute(
        sa.update(Activity).where(Activity.id == rejected["id"]).values(status="rejected")
    )
    await db.commit()

    resp = await client.get("/api/v1/club/activities", params={"sort": "status"})
    assert [a["name"] for a in resp.json()["data"]] == ["草稿", "已核准", "已退回"]
    assert draft["status"] == "draft"


async def test_list_multi_value_type_and_budget_sort(client, db):
    """活動列表的篩選與排序全在後端:類型多選、經費欄=自籌+擬請補助合計。"""
    await setup_session(client, db)
    await create_activity(client, name="無經費", type="社課或會議", budget_items=[])
    await create_activity(
        client,
        name="小額",
        type="活動",
        budget_items=[
            {"category": "膳食費", "description": "便當", "self_fund": 100, "requested_subsidy": 0}
        ],
    )
    await create_activity(client, name="大額", type="活動")  # 預設 1000+2000+0+500

    resp = await client.get(
        "/api/v1/club/activities", params=[("type", "社課或會議"), ("type", "活動")]
    )
    assert len(resp.json()["data"]) == 3

    resp = await client.get("/api/v1/club/activities", params={"sort": "budget"})
    assert [a["name"] for a in resp.json()["data"]] == ["無經費", "小額", "大額"]
    resp = await client.get("/api/v1/club/activities", params={"sort": "-budget"})
    assert [a["name"] for a in resp.json()["data"]] == ["大額", "小額", "無經費"]

    # 同值也要有穩定全序,否則分頁會重複/漏列。
    # 注意:這條只是契約標記不是護欄 —— 小表拿掉 id tiebreak 照樣綠(回傳序由 planner 決定)
    page1 = (
        await client.get(
            "/api/v1/club/activities", params={"sort": "type", "page_size": 2, "page": 1}
        )
    ).json()["data"]
    page2 = (
        await client.get(
            "/api/v1/club/activities", params={"sort": "type", "page_size": 2, "page": 2}
        )
    ).json()["data"]
    assert len({a["id"] for a in page1 + page2}) == 3


async def test_attachment_total_cap(client, db):
    """附件加總上限(2026-07-16 第八輪):讀 system_settings,超過回 413。"""
    from app.models import SystemSetting

    await setup_session(client, db)
    db.add(SystemSetting(key="activity_attachment_total_mb", value=1))  # 1MB 加總上限
    await db.commit()
    activity = await create_activity(client)
    url = f"/api/v1/club/activities/{activity['id']}/attachments"

    pdf = b"%PDF-1.7 " + b"\x00" * 700_000  # ~0.7MB
    resp = await client.post(
        url, files={"file": ("企劃書.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text

    # 第二份使加總超過 1MB → 413,且不殘留孤兒檔
    resp = await client.post(
        url, files={"file": ("附件2.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 413
    assert resp.json()["meta"]["code"] == "FILE_TOO_LARGE"
    assert "加總" in resp.json()["error"]

    detail = (await client.get(f"/api/v1/club/activities/{activity['id']}")).json()["data"]
    assert len(detail["attachments"]) == 1
    on_disk = [p for p in settings.upload_dir.rglob("*") if p.is_file()]
    assert len(on_disk) == 1  # 超限檔案已清掉


async def test_partial_draft_and_submit_completeness(client, db):
    """草稿允許部分填寫(至少一欄);送審時檢核必填並列出缺漏。"""
    await setup_session(client, db)

    # 全空 → 422
    resp = await client.post(
        "/api/v1/club/activities",
        json={"name": "", "location": ""},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 只填名稱即可暫存
    resp = await client.post(
        "/api/v1/club/activities", json={"name": "迎新茶會"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    draft = resp.json()["data"]
    assert draft["status"] == "draft"
    assert draft["date"] is None
    assert draft["semester"] == ""

    # 送審 → 列出缺漏欄位
    resp = await client.post(
        f"/api/v1/club/activities/{draft['id']}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    msg = resp.json()["error"]
    assert "開始日期" in msg and "活動地點" in msg and "活動名稱" not in msg
    # 畫面上除了活動內容全是必填,後端不能只擋日期地點就放行
    assert "工作分配" in msg and "參加人數" in msg

    # 人數兩欄可以有一欄是 0(只有社員或只有校外人士),合計 0 才算沒填
    future = (date.today() + timedelta(days=30)).isoformat()
    resp = await client.put(
        f"/api/v1/club/activities/{draft['id']}",
        json=payload(date=future, participants_in=0, participants_out=0),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text  # 這支若掛了,下面的 422 會是別的原因
    resp = await client.post(
        f"/api/v1/club/activities/{draft['id']}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 422 and "參加人數" in resp.json()["error"]

    # 補齊後可送審(送審擋過去時間,補齊時帶未來日期;人數只有一欄是 0 仍算填了)
    resp = await client.put(
        f"/api/v1/club/activities/{draft['id']}",
        json=payload(date=future, participants_in=0, participants_out=5),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    resp = await client.post(
        f"/api/v1/club/activities/{draft['id']}/submit", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "pending_advisor"

    # 填了的欄位仍須自洽:起訖顛倒即擋(草稿也不收壞資料)
    resp = await client.post(
        "/api/v1/club/activities",
        json={"name": "壞日期", "date": "2026-06-20", "end_date": "2026-06-19"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_close_actual_times_overnight_rules(client, db):
    """實際時間先後僅單日活動比較;跨日活動的過夜時間(18:10–翌日 10:00)合法(2026-07-17)。"""
    await setup_session(client, db)

    # 單日活動:實際結束早於開始 → 422
    past = (date.today() - timedelta(days=3)).isoformat()
    data = await create_activity(client, date=past)
    await approve(db, data["id"])
    await upload_photo(client, data["id"])
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(actual_start="18:10", actual_end="10:00"),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "結束時間" in resp.json()["error"]

    # 跨日活動:同一組時間是合法過夜時段 → 200
    start = (date.today() - timedelta(days=5)).isoformat()
    end = (date.today() - timedelta(days=4)).isoformat()
    data = await create_activity(client, name="跨日宿營", date=start, end_date=end)
    await approve(db, data["id"])
    # 跨活動 SHA-256 去重:第二個活動的照片須用不同內容
    await upload_photo(client, data["id"], content=JPG + b"\x01", name="photo2.jpg")
    resp = await client.post(
        f"/api/v1/club/activities/{data['id']}/close",
        json=close_payload(actual_start="18:10", actual_end="10:00"),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text


async def test_delete_file_rejects_non_uuid_path_param(client, db):
    """非 UUID 的 file_id 由 FastAPI 擋成 422 —— 宣告成 str 會原樣送進 asyncpg 而 500。"""
    await setup_session(client, db)
    data = await create_activity(client, date=(date.today() - timedelta(days=3)).isoformat())
    for kind in ("photos", "attachments"):
        resp = await client.delete(
            f"/api/v1/club/activities/{data['id']}/{kind}/not-a-uuid",
            headers=csrf_headers(client),
        )
        assert resp.status_code == 422, (kind, resp.status_code, resp.text)
