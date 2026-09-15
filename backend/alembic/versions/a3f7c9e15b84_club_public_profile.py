"""clubs 的對外公開欄位與 files.public(社團導覽頁資料層)

社團導覽頁(GAP-16)要公開的欄位全部落在 clubs,由社團自填;`public_visible` 是
行政端的下架閥。形象圖走 files 但**不計社團配額**(club_id 留 NULL),
因此 files 需要一個「這個檔可以免登入取得」的屬性 —— `can_access()` 的四種角色
判定管不到匿名。

Revision ID: a3f7c9e15b84
Revises: e5a1c9d47b23
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "a3f7c9e15b84"
down_revision = "e5a1c9d47b23"
branch_labels = None
depends_on = None

_RECRUIT = ("招生中", "額滿", "不定期", "暫停招生")
_TEXT_MODE = ("auto", "light", "dark")

# 既有列一律補上不為 NULL 的欄位值,補完才拿掉 server_default 以外的 nullable
_NEW_COLUMNS = (
    ("public_visible", sa.Boolean(), sa.true()),
    ("tags", postgresql.ARRAY(sa.Text()), sa.text("'{}'::text[]")),
    ("social_links", postgresql.JSONB(astext_type=sa.Text()), sa.text("'[]'::jsonb")),
    ("banner_dim", sa.SmallInteger(), sa.text("0")),
    ("banner_blur", sa.SmallInteger(), sa.text("0")),
)


def upgrade() -> None:
    for name, type_, default in _NEW_COLUMNS:
        op.add_column(
            "clubs", sa.Column(name, type_, nullable=False, server_default=default)
        )
    op.add_column(
        "clubs",
        sa.Column(
            "banner_text_mode",
            sa.Enum(
                *_TEXT_MODE,
                name="banner_text_mode",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
            server_default="auto",
        ),
    )
    op.add_column(
        "clubs",
        sa.Column(
            "recruit_status",
            sa.Enum(
                *_RECRUIT,
                name="recruit_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=True,
        ),
    )
    for name in ("tagline", "public_email", "office_location", "regular_schedule",
                 "join_info", "signup_url"):
        op.add_column("clubs", sa.Column(name, sa.Text(), nullable=True))
    for name in ("founded_year", "banner_luma"):
        op.add_column("clubs", sa.Column(name, sa.SmallInteger(), nullable=True))

    op.add_column(
        "files",
        sa.Column("public", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # 形象圖:檔案被刪時欄位歸 NULL,而不是擋住刪除
    for col in ("avatar_file_id", "banner_file_id"):
        op.add_column("clubs", sa.Column(col, sa.Uuid(), nullable=True))
        op.create_foreign_key(
            f"fk_clubs_{col}_files", "clubs", "files", [col], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    for col in ("avatar_file_id", "banner_file_id"):
        op.drop_constraint(f"fk_clubs_{col}_files", "clubs", type_="foreignkey")
        op.drop_column("clubs", col)
    op.drop_column("files", "public")
    for name in ("public_visible", "tagline", "tags", "recruit_status", "public_email",
                 "social_links", "office_location", "regular_schedule", "join_info",
                 "signup_url", "founded_year", "banner_dim", "banner_blur",
                 "banner_text_mode", "banner_luma"):
        op.drop_column("clubs", name)
