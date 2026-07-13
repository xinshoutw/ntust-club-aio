import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class File(Base, TimestampMixin):
    """所有上傳檔的單一中介資料表;磁碟路徑不進業務表,存取一律經帶權限檢查的 API。"""

    __tablename__ = "files"
    __table_args__ = (
        sa.Index("ix_files_subject", "subject_type", "subject_id"),
        sa.Index("ix_files_club_sha256", "club_id", "sha256"),
        # 照片去重的 DB 層收口:並發同檔上傳其一會撞索引 → 全域 handler 回 409
        sa.Index(
            "uq_files_club_report_photo_sha",
            "club_id",
            "sha256",
            unique=True,
            postgresql_where=sa.text("archived_at IS NULL AND slot = 'report_photo'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    club_id: Mapped[int | None] = mapped_column(sa.ForeignKey("clubs.id"))  # 權限邊界
    uploaded_by: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))
    subject_type: Mapped[str | None] = mapped_column(sa.Text)  # 所屬單據
    subject_id: Mapped[int | None] = mapped_column()
    slot: Mapped[str | None] = mapped_column(sa.Text)  # report_photo / evidence / passbook…
    original_name: Mapped[str] = mapped_column(sa.Text)
    size: Mapped[int] = mapped_column(sa.BigInteger)
    mime: Mapped[str] = mapped_column(sa.Text)
    sha256: Mapped[str] = mapped_column(sa.Text)  # 評鑑照片以此拒重複(後端驗證)
    path: Mapped[str] = mapped_column(sa.Text)  # {module}/{YYYY}/{MM}/{uuid}
    archived_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
