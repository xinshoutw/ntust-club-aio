"""社團導覽頁設計定案後的減法(mock 驗證結論)

橫幅上不再壓任何文字,黑化、模糊、字色與亮度四欄因此失去用途;社群連結實測只有 IG
用得上,`[{kind,url}]` 的 jsonb 收成單一帳號 ID;成立年份不顯示;招生狀態改三值。

Revision ID: c7b41e9d3a58
Revises: a3f7c9e15b84
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "c7b41e9d3a58"
down_revision = "a3f7c9e15b84"
branch_labels = None
depends_on = None

_DROPPED = ("banner_dim", "banner_blur", "banner_text_mode", "banner_luma", "founded_year")
_OLD_RECRUIT = ("招生中", "額滿", "不定期", "暫停招生")
_NEW_RECRUIT = ("歡迎加入", "暫不開放", "額滿")
# 舊值 → 新值;「不定期」併入歡迎加入(仍收人),「暫停招生」即暫不開放
_RECRUIT_MAP = {"招生中": "歡迎加入", "不定期": "歡迎加入", "暫停招生": "暫不開放"}


def upgrade() -> None:
    for name in _DROPPED:
        op.drop_column("clubs", name)

    # 社群連結:只留 IG,且只存帳號 ID。先把既有的 instagram 那一筆搬過來再丟掉整欄 ——
    # 這一版上線前沒有人填過,但遷移不該假設資料一定是空的
    op.add_column("clubs", sa.Column("instagram", sa.Text(), nullable=True))
    op.execute(
        sa.text("""
        UPDATE clubs SET instagram = regexp_replace(
            (SELECT l ->> 'url' FROM jsonb_array_elements(social_links) AS l
              WHERE l ->> 'kind' = 'instagram' LIMIT 1),
            '^https?://(www\\.)?instagram\\.com/', ''
        )
        WHERE social_links <> '[]'::jsonb
        """)
    )
    op.execute(sa.text("UPDATE clubs SET instagram = rtrim(instagram, '/') WHERE instagram <> ''"))
    op.drop_column("clubs", "social_links")

    # 招生狀態換值域:CHECK 擋著,得先鬆綁、改值、再鎖回去
    # 裸名即可:alembic 的 target_metadata 會自己套上 ck_clubs_ 前綴
    op.drop_constraint("recruit_status", "clubs", type_="check")
    for old, new in _RECRUIT_MAP.items():
        op.execute(
            sa.text("UPDATE clubs SET recruit_status = :new WHERE recruit_status = :old").bindparams(
                new=new, old=old
            )
        )
    op.create_check_constraint(
        "recruit_status", "clubs", sa.column("recruit_status").in_(_NEW_RECRUIT)
    )


def downgrade() -> None:
    # 裸名即可:alembic 的 target_metadata 會自己套上 ck_clubs_ 前綴
    op.drop_constraint("recruit_status", "clubs", type_="check")
    op.execute(sa.text("UPDATE clubs SET recruit_status = '招生中' WHERE recruit_status = '歡迎加入'"))
    op.execute(sa.text("UPDATE clubs SET recruit_status = '暫停招生' WHERE recruit_status = '暫不開放'"))
    op.create_check_constraint(
        "recruit_status", "clubs", sa.column("recruit_status").in_(_OLD_RECRUIT)
    )

    op.add_column(
        "clubs",
        sa.Column(
            "social_links",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.execute(
        sa.text("""
        UPDATE clubs
           SET social_links = jsonb_build_array(
                 jsonb_build_object('kind', 'instagram',
                                    'url', 'https://instagram.com/' || instagram))
         WHERE instagram IS NOT NULL AND instagram <> ''
        """)
    )
    op.drop_column("clubs", "instagram")

    op.add_column("clubs", sa.Column("founded_year", sa.SmallInteger(), nullable=True))
    op.add_column("clubs", sa.Column("banner_luma", sa.SmallInteger(), nullable=True))
    op.add_column(
        "clubs",
        sa.Column(
            "banner_text_mode",
            sa.Enum(
                "auto", "light", "dark", name="banner_text_mode",
                native_enum=False, create_constraint=True, length=32,
            ),
            nullable=False,
            server_default="auto",
        ),
    )
    for name in ("banner_blur", "banner_dim"):
        op.add_column(
            "clubs",
            sa.Column(name, sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        )
