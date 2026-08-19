"""金額/數量的非負約束

pydantic schema 擋得住 API 進來的值,但匯入腳本與 raw SQL 直接寫表;
負數的補助金額或負的借用件數會一路穿到核銷與可借數推導裡。
下界與 schema 一致:件數 ≥1(借用單、單次可借上限),其餘 ≥0。

Revision ID: b8e5d1c06f47
Revises: a1c7f42d9b30
Create Date: 2026-08-11
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8e5d1c06f47'
down_revision: Union[str, Sequence[str], None] = 'a1c7f42d9b30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECKS = [
    (
        'activities',
        'amounts_non_negative',
        'participants_in >= 0 AND participants_out >= 0'
        ' AND (school_approved IS NULL OR school_approved >= 0)',
    ),
    (
        'activity_budget_items',
        'amounts_non_negative',
        'self_fund >= 0 AND requested_subsidy >= 0'
        ' AND (approved_subsidy IS NULL OR approved_subsidy >= 0)',
    ),
    (
        'activity_reports',
        'counts_non_negative',
        'member_count >= 0 AND non_member_count >= 0 AND expense >= 0'
        ' AND (review_attendees IS NULL OR review_attendees >= 0)',
    ),
    ('equipment_loans', 'qty_positive', 'qty >= 1'),
    (
        'equipment',
        'qty_non_negative',
        'total_qty >= 0 AND (max_lease_count IS NULL OR max_lease_count >= 1)',
    ),
]


def upgrade() -> None:
    for table, name, condition in CHECKS:
        op.create_check_constraint(name, table, condition)


def downgrade() -> None:
    for table, name, _ in CHECKS:
        op.drop_constraint(name, table, type_='check')
