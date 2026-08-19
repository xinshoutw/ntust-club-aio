"""評審端(/viewer):指派、評分 upsert、已完成清單、檔案權限、rubric seed 對帳。"""

import io
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import UploadFile

from app.models import (
    AuditLog,
    Award,
    AwardRubricItem,
    EvalGroup,
    EvalGroupClub,
    EvalGroupReviewer,
    EvalUpload,
    ReviewScore,
    ReviewScoreItem,
)
from app.models.enums import AwardKind
from app.services import files as file_service
from tests.conftest import csrf_headers, login, make_club, make_user

EVAL_YEAR = 116  # settings_service DEFAULTS 的評鑑視窗(2026-02-01 ~ 2027-01-31)
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def make_award(db, award_id="finance", name="最佳財務獎", *, has_presentation=True):
    award = Award(
        id=award_id, name=name, kind=AwardKind.GROUP, has_presentation=has_presentation
    )
    db.add(award)
    await db.commit()
    return award


async def make_rubric(db, award_id, specs, *, is_admin_item=False, year=EVAL_YEAR):
    """specs: [(item_key, max_score)];回傳依 sort 排序的 rubric 列。"""
    items = [
        AwardRubricItem(
            award_id=award_id,
            year=year,
            item_key=key,
            name=f"細項 {key}",
            max_score=max_score,
            is_admin_item=is_admin_item,
            sort=i,
        )
        for i, (key, max_score) in enumerate(specs, 1)
    ]
    db.add_all(items)
    await db.commit()
    for item in items:
        await db.refresh(item)
    return items


async def make_group(db, award_id, clubs, reviewers, *, year=EVAL_YEAR, name="A 組"):
    group = EvalGroup(year=year, award_id=award_id, name=name)
    db.add(group)
    await db.flush()
    for club in clubs:
        db.add(EvalGroupClub(group_id=group.id, club_id=club.id))
    for i, reviewer in enumerate(reviewers, 1):
        db.add(EvalGroupReviewer(group_id=group.id, user_id=reviewer.id, sort=i))
    await db.commit()
    return group


async def viewer_setup(client, db):
    """財務獎(含簡報)+ 兩細項 rubric + 兩社一組,viewer01 已登入。"""
    await make_award(db)
    items = await make_rubric(db, "finance", [("f1", 20), ("f2", 30)])
    club_a = await make_club(db, name="AAA社")
    club_b = await make_club(db, name="BBB社")
    viewer = await make_user(db, username="viewer01", role="viewer", can_view_eval=True)
    group = await make_group(db, "finance", [club_b, club_a], [viewer])
    await login(client, "viewer01")
    return viewer, items, club_a, club_b, group


def score_body(items, scores, presentation=None):
    body = {
        "items": [
            {"rubric_item_id": item.id, "score": value}
            for item, value in zip(items, scores, strict=True)
        ]
    }
    if presentation is not None:
        body["presentation_score"] = presentation
    return body


# ---- assignments ----


async def test_assignments_empty_without_groups(client, db):
    await make_user(db, username="viewer01", role="viewer", can_view_eval=True)
    await login(client, "viewer01")
    resp = await client.get("/api/v1/viewer/assignments")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


async def test_assignments_shape_and_scoped_to_me_and_year(client, db):
    viewer, items, club_a, club_b, group = await viewer_setup(client, db)
    # 行政資料項不出現在評審細項
    await make_rubric(db, "finance", [("ad1", 15)], is_admin_item=True)
    # 他人分組與他年度分組都不得出現
    other = await make_user(db, username="viewer02", role="viewer", can_view_eval=True)
    await make_group(db, "finance", [club_a], [other], name="他人組")
    await make_group(db, "finance", [club_a], [viewer], year=115, name="舊年組")

    resp = await client.get("/api/v1/viewer/assignments")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    entry = data[0]
    assert entry["award_id"] == "finance"
    assert entry["award_name"] == "最佳財務獎"
    assert entry["has_presentation"] is True
    assert entry["group_id"] == group.id
    assert entry["group_name"] == "A 組"
    assert entry["year"] == EVAL_YEAR
    assert [i["item_key"] for i in entry["items"]] == ["f1", "f2"]
    assert entry["items"][0]["max_score"] == 20
    # 分組內社團依名稱排序;未評分 → scored=False、total=None
    assert [c["club_name"] for c in entry["clubs"]] == ["AAA社", "BBB社"]
    assert all(c["scored"] is False and c["total"] is None for c in entry["clubs"])


# ---- detail ----


async def test_detail_shape_uploads_and_null_score(client, db):
    viewer, items, club_a, _, _ = await viewer_setup(client, db)
    uploader = await make_user(db, username="club_a", club_id=club_a.id)
    saved = await file_service.save_upload(
        db,
        UploadFile(io.BytesIO(PNG_BYTES), filename="帳冊.png", size=len(PNG_BYTES)),
        policy=file_service.IMAGE,
        module="eval",
        uploaded_by=uploader.id,
        club_id=club_a.id,
        subject_type="eval_upload",
        subject_id=items[0].id,
        slot=items[0].item_key,
    )
    db.add(
        EvalUpload(
            year=EVAL_YEAR, club_id=club_a.id, rubric_item_id=items[0].id, file_id=saved.id
        )
    )
    await db.commit()

    resp = await client.get(f"/api/v1/viewer/clubs/{club_a.id}/awards/finance")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["club"] == {
        "id": club_a.id, "name": "AAA社", "attribute": "藝術性", "kind": "社團",
    }
    assert [i["item_key"] for i in data["items"]] == ["f1", "f2"]
    uploads = data["uploads"]
    assert uploads == {
        str(items[0].id): [{"id": str(saved.id), "name": "帳冊.png", "size": len(PNG_BYTES)}]
    }
    assert data["score"] is None


async def test_detail_403_outside_assignment_404_unknown(client, db):
    viewer, items, club_a, _, _ = await viewer_setup(client, db)
    outsider = await make_club(db, name="CCC社")
    # 分組外社團 → 403
    resp = await client.get(f"/api/v1/viewer/clubs/{outsider.id}/awards/finance")
    assert resp.status_code == 403
    # 同社團、非我分組的獎項 → 403
    await make_award(db, "result", "最佳成果發表獎", has_presentation=False)
    resp = await client.get(f"/api/v1/viewer/clubs/{club_a.id}/awards/result")
    assert resp.status_code == 403
    # 不存在的獎項/社團 → 404
    assert (await client.get(f"/api/v1/viewer/clubs/{club_a.id}/awards/nope")).status_code == 404
    assert (await client.get("/api/v1/viewer/clubs/99999/awards/finance")).status_code == 404


# ---- score upsert ----


async def test_score_submit_then_modify_overwrites(client, db):
    viewer, items, club_a, _, _ = await viewer_setup(client, db)
    url = f"/api/v1/viewer/clubs/{club_a.id}/awards/finance/score"

    body = score_body(items, [18, 25], presentation=15)
    body["items"][0]["comment"] = "帳冊完整"
    resp = await client.put(url, json=body, headers=csrf_headers(client))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["items"][str(items[0].id)] == {"score": 18, "comment": "帳冊完整"}
    assert data["presentation_score"] == 15
    assert data["submitted_at"] is not None

    # 重複修改:同一列覆蓋(唯一鍵 year+award+club+reviewer),items 全量替換
    resp = await client.put(
        url, json=score_body(items, [10, 20], presentation=12), headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    scores = (await db.scalars(sa.select(ReviewScore))).all()
    assert len(scores) == 1
    assert scores[0].presentation_score == 12
    rows = (await db.scalars(sa.select(ReviewScoreItem))).all()
    assert sorted(r.score for r in rows) == [10, 20]
    # 稽核落地
    audit_count = await db.scalar(
        sa.select(sa.func.count()).where(AuditLog.action == "review_score_saved")
    )
    assert audit_count == 2

    # detail 回存後同形;assignments 呈現進度與合計
    detail = (await client.get(f"/api/v1/viewer/clubs/{club_a.id}/awards/finance")).json()
    assert detail["data"]["score"]["items"][str(items[1].id)] == {"score": 20, "comment": ""}
    assignments = (await client.get("/api/v1/viewer/assignments")).json()["data"][0]
    state = next(c for c in assignments["clubs"] if c["club_id"] == club_a.id)
    assert state["scored"] is True
    assert state["total"] == 42  # 10 + 20 + 簡報 12


async def test_presentation_score_kept_unless_explicitly_cleared(client, db):
    """簡報分是另一個時點補登的:省略該欄的請求不得把它清成 NULL。"""
    viewer, items, club_a, _, _ = await viewer_setup(client, db)
    url = f"/api/v1/viewer/clubs/{club_a.id}/awards/finance/score"

    first = score_body(items, [18, 25], presentation=15)
    await client.put(url, json=first, headers=csrf_headers(client))
    resp = await client.put(url, json=score_body(items, [10, 20]), headers=csrf_headers(client))
    assert resp.json()["data"]["presentation_score"] == 15

    body = score_body(items, [10, 20]) | {"presentation_score": None}
    resp = await client.put(url, json=body, headers=csrf_headers(client))
    assert resp.json()["data"]["presentation_score"] is None


async def test_score_validation_bounds_and_coverage(client, db):
    viewer, items, club_a, _, _ = await viewer_setup(client, db)
    admin_items = await make_rubric(db, "finance", [("ad1", 15)], is_admin_item=True)
    url = f"/api/v1/viewer/clubs/{club_a.id}/awards/finance/score"
    headers = csrf_headers(client)

    # 缺項(整份送出)
    resp = await client.put(
        url, json={"items": [{"rubric_item_id": items[0].id, "score": 1}]}, headers=headers
    )
    assert resp.status_code == 422
    # 超分 / 負分
    assert (
        await client.put(url, json=score_body(items, [21, 0]), headers=headers)
    ).status_code == 422
    assert (
        await client.put(url, json=score_body(items, [-1, 0]), headers=headers)
    ).status_code == 422
    # 行政資料項不可評
    bad = {"items": [
        {"rubric_item_id": items[0].id, "score": 1},
        {"rubric_item_id": items[1].id, "score": 1},
        {"rubric_item_id": admin_items[0].id, "score": 1},
    ]}
    assert (await client.put(url, json=bad, headers=headers)).status_code == 422
    # 重複項
    dup = {"items": [
        {"rubric_item_id": items[0].id, "score": 1},
        {"rubric_item_id": items[0].id, "score": 2},
    ]}
    assert (await client.put(url, json=dup, headers=headers)).status_code == 422
    # 簡報超界
    assert (
        await client.put(url, json=score_body(items, [1, 1], presentation=21), headers=headers)
    ).status_code == 422
    # 全錯情境未寫入任何列
    assert await db.scalar(sa.select(sa.func.count()).select_from(ReviewScore)) == 0


async def test_presentation_score_rejected_without_presentation(client, db):
    await make_award(db, "result", "最佳成果發表獎", has_presentation=False)
    items = await make_rubric(db, "result", [("r1", 50)])
    club = await make_club(db, name="AAA社")
    viewer = await make_user(db, username="viewer01", role="viewer", can_view_eval=True)
    await make_group(db, "result", [club], [viewer])
    await login(client, "viewer01")

    url = f"/api/v1/viewer/clubs/{club.id}/awards/result/score"
    resp = await client.put(
        url, json=score_body(items, [40], presentation=10), headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    # 不帶簡報分即可送出
    resp = await client.put(url, json=score_body(items, [40]), headers=csrf_headers(client))
    assert resp.status_code == 200
    assert resp.json()["data"]["presentation_score"] is None


# ---- done ----


async def test_done_pagination_and_sort(client, db):
    viewer, items, club_a, club_b, _ = await viewer_setup(client, db)

    def score_row(club_id, values, presentation, submitted_at):
        row = ReviewScore(
            year=EVAL_YEAR, award_id="finance", club_id=club_id, reviewer_id=viewer.id,
            presentation_score=presentation, submitted_at=submitted_at,
        )
        row.items = [
            ReviewScoreItem(rubric_item_id=item.id, score=value)
            for item, value in zip(items, values, strict=True)
        ]
        return row

    db.add(score_row(club_a.id, [10, 20], 15, datetime(2026, 7, 10, 8, 0, tzinfo=UTC)))
    db.add(score_row(club_b.id, [20, 30], 10, datetime(2026, 7, 11, 8, 0, tzinfo=UTC)))
    # 未送出(submitted_at NULL)不入清單
    club_c = await make_club(db, name="CCC社")
    db.add(
        ReviewScore(
            year=EVAL_YEAR, award_id="finance", club_id=club_c.id, reviewer_id=viewer.id
        )
    )
    await db.commit()

    resp = await client.get("/api/v1/viewer/done")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["meta"]["total"] == 2
    rows = payload["data"]
    # 預設 -submitted_at:新的在前
    assert [r["club_name"] for r in rows] == ["BBB社", "AAA社"]
    assert rows[0] == {
        "award_id": "finance", "award_name": "最佳財務獎",
        "club_id": club_b.id, "club_name": "BBB社",
        "total": 60, "submitted_at": rows[0]["submitted_at"],
    }
    assert rows[0]["total"] == 60  # 20+30+簡報10
    assert rows[1]["total"] == 45  # 10+20+簡報15

    # total 升冪
    rows = (await client.get("/api/v1/viewer/done?sort=total")).json()["data"]
    assert [r["total"] for r in rows] == [45, 60]
    # club 名稱排序
    rows = (await client.get("/api/v1/viewer/done?sort=club")).json()["data"]
    assert [r["club_name"] for r in rows] == ["AAA社", "BBB社"]
    # 分頁
    page2 = (await client.get("/api/v1/viewer/done?page=2&page_size=1")).json()
    assert page2["meta"] == {"page": 2, "page_size": 1, "total": 2}
    assert len(page2["data"]) == 1
    # 排序白名單
    assert (await client.get("/api/v1/viewer/done?sort=hax")).status_code == 422


# ---- 角色邊界 ----


async def test_other_roles_forbidden(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await make_user(db, username="admin01", role="admin", is_super=True)

    await login(client, "club01")
    assert (await client.get("/api/v1/viewer/assignments")).status_code == 403
    assert (await client.get("/api/v1/viewer/done")).status_code == 403

    await login(client, "admin01")
    assert (await client.get("/api/v1/viewer/assignments")).status_code == 403
    resp = await client.put(
        f"/api/v1/viewer/clubs/{club.id}/awards/finance/score",
        json={"items": []},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403


# ---- 檔案權限:僅被指派分組內社團的評鑑上傳檔 ----


async def test_viewer_file_access_scoped_to_assignment(client, db):
    viewer, items, club_a, club_b, group = await viewer_setup(client, db)
    # 只指派 club_a:重建僅含 club_a 的分組
    await db.execute(sa.delete(EvalGroupClub).where(EvalGroupClub.club_id == club_b.id))
    await db.commit()

    uploader = await make_user(db, username="club_a", club_id=club_a.id)

    async def eval_upload(club, name, content):
        saved = await file_service.save_upload(
            db,
            UploadFile(io.BytesIO(content), filename=name, size=len(content)),
            policy=file_service.IMAGE,
            module="eval",
            uploaded_by=uploader.id,
            club_id=club.id,
            subject_type="eval_upload",
            subject_id=items[0].id,
            slot=items[0].item_key,
        )
        db.add(
            EvalUpload(
                year=EVAL_YEAR, club_id=club.id, rubric_item_id=items[0].id, file_id=saved.id
            )
        )
        await db.commit()
        return saved

    file_a = await eval_upload(club_a, "a.png", PNG_BYTES)
    file_b = await eval_upload(club_b, "b.png", b"\x89PNG\r\n\x1a\n" + b"\x01" * 64)

    # 指派內可讀;指派外與不存在同訊息(404,避免探測)
    assert (await client.get(f"/api/v1/files/{file_a.id}")).status_code == 200
    assert (await client.get(f"/api/v1/files/{file_b.id}")).status_code == 404

    # 獎項維度:同社團、但屬「我未被指派的獎項」細項的上傳,不可讀
    # (club_a 同時在他人負責的 result 獎分組,該獎佐證檔對本評審仍 404)
    await make_award(db, "result", "最佳成果發表獎", has_presentation=False)
    other_items = await make_rubric(db, "result", [("r1", 50)])
    other_reviewer = await make_user(db, username="viewer_r", role="viewer")
    await make_group(db, "result", [club_a], [other_reviewer], name="成果 A 組")
    saved_other = await file_service.save_upload(
        db,
        UploadFile(io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x02" * 64), filename="r.png", size=72),
        policy=file_service.IMAGE,
        module="eval",
        uploaded_by=uploader.id,
        club_id=club_a.id,
        subject_type="eval_upload",
        subject_id=other_items[0].id,
        slot=other_items[0].item_key,
    )
    db.add(
        EvalUpload(
            year=EVAL_YEAR,
            club_id=club_a.id,
            rubric_item_id=other_items[0].id,
            file_id=saved_other.id,
        )
    )
    await db.commit()
    assert (await client.get(f"/api/v1/files/{saved_other.id}")).status_code == 404

    # 管理員不受影響(迴歸)
    await make_user(db, username="admin01", role="admin", is_super=True)
    await login(client, "admin01")
    assert (await client.get(f"/api/v1/files/{file_b.id}")).status_code == 200
    assert (await client.get(f"/api/v1/files/{saved_other.id}")).status_code == 200


# ---- rubric seed 對帳 ----


async def test_rubric_seed_idempotent_and_totals(db):
    from scripts.seed import AWARD_TOTALS, PRESENTATION_MAX, RUBRICS, seed, verify_rubrics

    verify_rubrics()
    await seed(None, None)
    count = await db.scalar(sa.select(sa.func.count()).select_from(AwardRubricItem))
    assert count == sum(len(items) for items in RUBRICS.values()) == 51
    await seed(None, None)  # idempotent:重跑不重複
    assert await db.scalar(sa.select(sa.func.count()).select_from(AwardRubricItem)) == count

    # DB 內合計對帳:有簡報獎 rubric=總分−20、無簡報獎=總分(club 為營運 group)
    for award_id, total in AWARD_TOTALS.items():
        award = await db.get(Award, award_id)
        manual_sum = await db.scalar(
            sa.select(sa.func.coalesce(sa.func.sum(AwardRubricItem.max_score), 0)).where(
                AwardRubricItem.award_id == award_id,
                AwardRubricItem.year == EVAL_YEAR,
                AwardRubricItem.is_admin_item.is_(False),
            )
        )
        presentation = PRESENTATION_MAX if award.has_presentation else 0
        assert manual_sum + presentation == total, award_id
    # 最佳社團獎行政資料 group 合計=行政分上限 100
    admin_sum = await db.scalar(
        sa.select(sa.func.sum(AwardRubricItem.max_score)).where(
            AwardRubricItem.award_id == "club",
            AwardRubricItem.year == EVAL_YEAR,
            AwardRubricItem.is_admin_item.is_(True),
        )
    )
    assert admin_sum == 100
