"""files 評鑑上傳去重唯一索引(Task #6 審查 FUNC-04)

save_upload 的先查後寫在兩個 session 併發時會一起通過;
以 (club_id, subject_id, sha256) 的 partial unique index 在 DB 層收口,
僅涵蓋 active(未歸檔)的 subject_type='eval_upload'。
subject_id = rubric_item_id(逐年唯一),不可用 slot=item_key——
item_key 跨年度重複,會誤擋隔年同內容的合法上傳。
撞索引由全域 IntegrityError handler 回 409,API 行為不變。

Revision ID: a9c2e51d7f43
Revises: b8d5e3f61a24
Create Date: 2026-07-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a9c2e51d7f43'
down_revision: Union[str, Sequence[str], None] = 'b8d5e3f61a24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 既有重複資料會使唯一索引建立失敗:先檢查並給出可操作的錯誤訊息
    dup = op.get_bind().execute(
        sa.text(
            "SELECT club_id, subject_id, sha256, count(*) FROM files "
            "WHERE subject_type = 'eval_upload' AND archived_at IS NULL "
            "GROUP BY club_id, subject_id, sha256 HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if dup is not None:
        raise RuntimeError(
            f"active eval uploads contain duplicates (club_id={dup[0]}, subject_id={dup[1]}, "
            f"sha256={dup[2]}, count={dup[3]}); archive or delete the extra rows "
            "before upgrading"
        )
    op.create_index(
        'uq_files_club_eval_subject_sha',
        'files',
        ['club_id', 'subject_id', 'sha256'],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL AND subject_type = 'eval_upload'"),
    )


def downgrade() -> None:
    op.drop_index('uq_files_club_eval_subject_sha', table_name='files')
