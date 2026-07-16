from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    STAFF = "staff"
    CLUB = "club"
    VIEWER = "viewer"


class AuthProvider(StrEnum):
    LOCAL = "local"
    SSO = "sso"


class ClubAttribute(StrEnum):
    AUTONOMOUS = "自治性"
    ACADEMIC = "學藝性"
    SERVICE = "服務性"
    SOCIAL = "聯誼性"
    ART = "藝術性"
    SPORTS = "體育性"


class MemberKind(StrEnum):
    """標準身份值;正副負責人顯示時依社團名稱末字推導(社→社長、會→會長)。"""

    PRESIDENT = "負責人"
    VICE_PRESIDENT = "副負責人"
    OFFICER = "幹部"
    MEMBER = "社員"


class VenueCategory(StrEnum):
    CLASSROOM = "教室"
    PRACTICE = "練習空間"
    OUTDOOR = "廣場戶外"
    DORM = "宿舍區"  # 2026-07-15 場地主檔定案新增(一宿 B2)


class EquipmentCategory(StrEnum):
    GENERAL = "一般"
    ELECTRONIC = "電子設備"
    SCREEN = "投影布幕"
    TENT = "帳篷"


class ActivityType(StrEnum):
    COURSE = "社課"
    EVENT = "活動"
    MEETING = "會議"


class ActivityStatus(StrEnum):
    DRAFT = "draft"
    PENDING_ADVISOR = "pending_advisor"
    PENDING_CHIEF = "pending_chief"
    PENDING_DEAN = "pending_dean"
    APPROVED = "approved"
    REJECTED = "rejected"
    CLOSING_PENDING_ADVISOR = "closing_pending_advisor"
    CLOSED = "closed"


class ApprovalSubject(StrEnum):
    ACTIVITY = "activity"
    ACTIVITY_CLOSE = "activity_close"
    ROOM_BOOKING = "room_booking"
    VENUE_BOOKING = "venue_booking"
    EQUIPMENT_LOAN = "equipment_loan"
    OFFICER_CERT = "officer_cert"
    POSTAL_CHANGE = "postal_change"
    MAINTENANCE = "maintenance"
    SIGNUP = "signup"


class ApprovalDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    UNLOCK = "unlock"
    REVOKE = "revoke"


class BookingStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class LoanStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CHECKED_OUT = "checked_out"
    RETURNED = "returned"


class CertPosition(StrEnum):
    LEADER = "社長或會長"
    VICE_LEADER = "副社長或副會長"


class PostalReason(StrEnum):
    """郵局帳戶異動事由(2026-07-13 前端定案:複選 + 存簿密碼異動)。"""

    CHANGE_AGENT = "更換代理人"
    NEW_ACCOUNT = "新開戶"
    SEAL_CHANGE = "印鑑變更"
    PASSBOOK_LOST = "帳簿遺失"
    CLOSE_ACCOUNT = "結清銷戶"
    PASSWORD_CHANGE = "存簿密碼異動"


class MaintenanceStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class SignupKind(StrEnum):
    NORMAL = "normal"
    CADRE_TRAINING = "cadre_training"
    LEADER_MEETING = "leader_meeting"


class AwardKind(StrEnum):
    GROUP = "團體"
    INDIVIDUAL = "個人"


class AdjustmentKind(StrEnum):
    ADMIN_SCORE_OVERRIDE = "admin_score_override"
    MERIT_BONUS = "merit_bonus"
    FINAL_OVERRIDE = "final_override"
    AWARD_OVERRIDE = "award_override"


class AnnouncementTarget(StrEnum):
    ALL = "all"
    ATTR = "attr"
    CLUB = "club"


class ViolationStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class EmailStatus(StrEnum):
    SENT = "sent"
    FAILED = "failed"


class LegacySystem(StrEnum):
    CMS = "cms"
    CLUBCLASS = "clubclass"
