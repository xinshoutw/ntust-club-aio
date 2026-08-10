import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import ApplicationStatus, CertPosition, MaintenanceStatus


class OfficerCertificate(Base, TimestampMixin):
    """幹部證明申請;姓名由成員名單依職位+學期自動帶出。"""

    __tablename__ = "officer_certificates"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    term: Mapped[str] = mapped_column(sa.Text)  # 如 114-2 或 114(全學年)
    position: Mapped[CertPosition] = mapped_column(db_enum(CertPosition, "cert_position"))
    applicant_name: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[ApplicationStatus] = mapped_column(
        db_enum(ApplicationStatus, "application_status"), default=ApplicationStatus.PENDING
    )


class PostalAccountChange(Base, TimestampMixin):
    """郵局帳戶異動;事由複選,互斥組合由應用層驗證。"""

    __tablename__ = "postal_account_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    reasons: Mapped[list[str]] = mapped_column(ARRAY(sa.Text))  # PostalReason 值(複選)
    account_name: Mapped[str] = mapped_column(sa.Text)
    account_number: Mapped[str] = mapped_column(sa.Text)  # 列表遮罩:前 3 碼+末 2 碼
    new_agent_name: Mapped[str | None] = mapped_column(sa.Text)
    new_agent_phone: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[ApplicationStatus] = mapped_column(
        db_enum(ApplicationStatus, "application_status"), default=ApplicationStatus.PENDING
    )


class MaintenanceRequest(Base, TimestampMixin):
    """社團空間報修;佐證照片/影片走 files(slot=evidence)。"""

    __tablename__ = "maintenance_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    location: Mapped[str] = mapped_column(sa.Text)
    items: Mapped[str] = mapped_column(sa.Text)  # 損壞項目
    status: Mapped[MaintenanceStatus] = mapped_column(
        db_enum(MaintenanceStatus, "maintenance_status"), default=MaintenanceStatus.PENDING
    )
    handle_note: Mapped[str | None] = mapped_column(sa.Text)
