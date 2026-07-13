from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """恆不變的環境設定(.env);會變動的營運參數放 DB 的 system_settings。"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["dev", "prod"] = "dev"
    secret_key: str = "dev-secret-change-me"
    database_url: str = "postgresql+asyncpg://club:club@localhost:5432/club_aio"
    upload_dir: Path = Path("./data/uploads")

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_username: str = ""
    smtp_password: str = ""
    mail_from_address: str = ""
    mail_from_name: str = "noreply"


settings = Settings()
