from datetime import datetime
from enum import StrEnum

import sqlalchemy as sa
from sqlalchemy import MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# 固定約束命名,alembic autogenerate 與未來 DDL 變更才有穩定名稱可引用
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def db_enum(enum_cls: type[StrEnum], name: str) -> sa.Enum:
    """非原生 enum(VARCHAR + CHECK):加值只改 CHECK,不需 ALTER TYPE;存 .value(含中文值)。

    create_constraint 必須明給:SQLAlchemy 預設不建 CHECK,少了它 raw SQL/遷移腳本
    寫壞值 DB 不擋,讀取時才 LookupError。
    """
    return sa.Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda e: [m.value for m in e],
    )


class TimestampMixin:
    """全表通用 created_at / updated_at(TIMESTAMPTZ,DB 端維護)。"""

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
