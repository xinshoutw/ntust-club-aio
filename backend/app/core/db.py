from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# hide_parameters:DB 錯誤的 traceback 會進 log,而 SQLAlchemy 預設把繫結參數一起印出來 ——
# 那是使用者送進來的原值(郵局帳號、學號姓名電話)。SQL 語句本身仍保留,除錯不受影響
engine = create_async_engine(settings.sqlalchemy_url, pool_pre_ping=True, hide_parameters=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        yield session
