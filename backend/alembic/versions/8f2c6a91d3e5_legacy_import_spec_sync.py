"""舊系統遷移前置 schema(2026-07-21 需求方拍板)

- clubs.kind(社團/學會):取代「名稱強制社/會結尾」規則,負責人顯示詞由此推導;
  既有列以名稱結尾回填,推導不到者暫回填「社團」
- clubs.en_name:英文名(舊系統 EN_Name 遷入)
- clubs.attribute 改 NULL:停社舊社團原性質不可考
- clubs.advisor_out_*:校外指導老師(校內/校外各一位)
- club_members.phone:成員電話(舊系統 Phone 遷入)
- activities.type 三分改二分:社課/會議 → 社課或會議;活動不變

Revision ID: 8f2c6a91d3e5
Revises: 9d4b7e2c5a18
Create Date: 2026-07-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8f2c6a91d3e5'
down_revision: Union[str, Sequence[str], None] = '9d4b7e2c5a18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_KIND = sa.Enum(
    '社團', '學會',
    name='club_kind', native_enum=False, create_constraint=True, length=32,
)


def upgrade() -> None:
    # clubs.kind:先加 NULL 欄 → 依名稱結尾回填 → 收 NOT NULL
    op.add_column('clubs', sa.Column('kind', _KIND, nullable=True))
    op.execute(
        "UPDATE clubs SET kind = CASE WHEN name LIKE '%會' THEN '學會' ELSE '社團' END"
    )
    op.alter_column('clubs', 'kind', nullable=False)

    op.add_column('clubs', sa.Column('en_name', sa.Text(), nullable=True))
    op.alter_column('clubs', 'attribute', nullable=True)
    op.add_column('clubs', sa.Column('advisor_out_name', sa.Text(), nullable=True))
    op.add_column('clubs', sa.Column('advisor_out_dept', sa.Text(), nullable=True))
    op.add_column('clubs', sa.Column('advisor_out_email', sa.Text(), nullable=True))
    op.add_column('clubs', sa.Column('advisor_out_phone', sa.Text(), nullable=True))

    op.add_column('club_members', sa.Column('phone', sa.Text(), nullable=True))

    # activities.type 二分制:先卸 CHECK 才能改值
    # (drop_constraint 會再套 naming convention 疊出 ck_ck_ 前綴,故用 raw SQL)
    op.execute('ALTER TABLE activities DROP CONSTRAINT ck_activities_activity_type')
    op.execute("UPDATE activities SET type = '社課或會議' WHERE type IN ('社課', '會議')")
    op.create_check_constraint(
        'activity_type', 'activities', "type IN ('社課或會議', '活動')"
    )


def downgrade() -> None:
    # 「會議」已無從還原:一律回「社課」
    op.execute('ALTER TABLE activities DROP CONSTRAINT ck_activities_activity_type')
    op.execute("UPDATE activities SET type = '社課' WHERE type = '社課或會議'")
    op.create_check_constraint(
        'activity_type', 'activities', "type IN ('社課', '活動', '會議')"
    )

    op.drop_column('club_members', 'phone')

    op.drop_column('clubs', 'advisor_out_phone')
    op.drop_column('clubs', 'advisor_out_email')
    op.drop_column('clubs', 'advisor_out_dept')
    op.drop_column('clubs', 'advisor_out_name')
    # 回收 NOT NULL 前先清 NULL(停社社團補「聯誼性」佔位)
    op.execute("UPDATE clubs SET attribute = '聯誼性' WHERE attribute IS NULL")
    op.alter_column('clubs', 'attribute', nullable=False)
    op.drop_column('clubs', 'en_name')
    op.drop_column('clubs', 'kind')
