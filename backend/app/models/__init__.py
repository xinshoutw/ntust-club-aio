from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# 固定約束命名,Alembic autogenerate 才能穩定 diff。
# 注意:ck 使用 %(constraint_name)s → 所有 CheckConstraint 一律要給 name=;
# 複合 unique 建議也自行命名,避免 column_0 撞名。
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referent_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# 之後每個 model 模組都必須在此 import,Alembic autogenerate 才看得到
# from app.models.users import User  # noqa: ERA001
