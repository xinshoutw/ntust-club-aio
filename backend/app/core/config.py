from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

# repo 根目錄(club-aio/):config.py 位於 backend/app/core/
REPO_ROOT = Path(__file__).resolve().parents[3]

# 已知的佔位字串一律不得用於正式環境(含 .env.example 的範本值)
_PLACEHOLDER_SECRETS = frozenset(
    {"dev-secret-change-me", "change-me", "change-me-to-a-long-random-string"}
)
_DEV_SECRET = "dev-secret-change-me"


class Settings(BaseSettings):
    """恆不變的環境設定(.env);會變動的營運參數放 DB 的 system_settings。"""

    # 依序讀 repo 根與 backend/ 下的 .env(後者優先);容器內由環境變數注入
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["dev", "prod"] = "dev"
    secret_key: str = _DEV_SECRET
    upload_dir: Path = Path("./data/uploads")

    # DB 連線用分離欄位,由 URL.create 安全組合(密碼含特殊字元不會壞)
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "club"
    postgres_password: str = "club"
    postgres_db: str = "club_aio"

    # Discord webhook(公告/審核/通過/拒絕等事件推送;空值=停用)
    discord_webhook_url: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_username: str = ""
    smtp_password: str = ""
    mail_from_address: str = ""
    mail_from_name: str = "noreply"

    @property
    def sqlalchemy_url(self) -> URL:
        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )

    @model_validator(mode="after")
    def _forbid_dev_defaults_in_prod(self) -> Settings:
        if self.env == "prod":
            problems = []
            if self.secret_key in _PLACEHOLDER_SECRETS or len(self.secret_key) < 32:
                problems.append("SECRET_KEY 必須為 32 字元以上的隨機值")
            if self.postgres_password in ("", "club"):
                problems.append("POSTGRES_PASSWORD 不可使用開發預設值")
            if problems:
                raise ValueError("正式環境設定不安全:" + ";".join(problems))
        return self


settings = Settings()
