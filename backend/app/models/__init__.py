"""SQLAlchemy models:docs/data-model.md 的落地;schema 以 Alembic migration 為準。"""

from app.models.activities import (
    Activity,
    ActivityBudgetItem,
    ActivityReflection,
    ActivityReport,
    ApprovalRecord,
)
from app.models.applications import MaintenanceRequest, OfficerCertificate, PostalAccountChange
from app.models.base import Base
from app.models.bookings import EquipmentLoan, RoomBookingRequest, RoomBookingSlot, VenueBooking
from app.models.clubs import Club, ClubMember
from app.models.evaluation import (
    Award,
    AwardRubricItem,
    EvalAdjustment,
    EvalGroup,
    EvalGroupClub,
    EvalGroupReviewer,
    EvalSetting,
    EvalUpload,
    ReviewScore,
    ReviewScoreItem,
)
from app.models.facilities import Equipment, Holiday, SystemSetting, Venue
from app.models.files import File
from app.models.misc import (
    Announcement,
    AnnouncementDismissal,
    AuditLog,
    EmailLog,
    LegacyIdMap,
    Violation,
)
from app.models.signups import (
    SessionAttendance,
    Signup,
    SignupAward,
    SignupDraft,
    SignupEntry,
    SignupItem,
    SignupItemSession,
)
from app.models.users import PasswordHistory, Session, User

__all__ = [
    "Activity",
    "ActivityBudgetItem",
    "ActivityReflection",
    "ActivityReport",
    "Announcement",
    "AnnouncementDismissal",
    "ApprovalRecord",
    "AuditLog",
    "Award",
    "AwardRubricItem",
    "Base",
    "Club",
    "ClubMember",
    "EmailLog",
    "Equipment",
    "EquipmentLoan",
    "EvalAdjustment",
    "EvalGroup",
    "EvalGroupClub",
    "EvalGroupReviewer",
    "EvalSetting",
    "EvalUpload",
    "File",
    "Holiday",
    "LegacyIdMap",
    "MaintenanceRequest",
    "OfficerCertificate",
    "PasswordHistory",
    "PostalAccountChange",
    "ReviewScore",
    "ReviewScoreItem",
    "RoomBookingRequest",
    "RoomBookingSlot",
    "Session",
    "SessionAttendance",
    "Signup",
    "SignupAward",
    "SignupDraft",
    "SignupEntry",
    "SignupItem",
    "SignupItemSession",
    "SystemSetting",
    "User",
    "Venue",
    "VenueBooking",
    "Violation",
]
