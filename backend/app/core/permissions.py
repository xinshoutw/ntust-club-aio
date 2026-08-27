"""行政端頁面權限鍵的單一真相。

**一頁一鍵**,沒有「只有 super 進得去」的頁面 —— super 仍然全通,但每一頁都可以
單獨授權給一般管理員(decisions.md D-01)。

這張表同時供給:

- 後端各 router 的 `require_permission`(鍵名從這裡取,不再各自寫字串)
- `schemas/accounts.PERMISSION_KEYS` 白名單
- 前端的側欄過濾、路由守衛與權限勾選彈窗(隨 `/auth/me` 一起送出)

前端曾經自己維護 `lib/permissions.ts` 的路徑→鍵對照與 `AccountsPage` 的鍵→顯示詞
兩份清單,兩份都對不上後端 —— 報名管理的鍵一度被標成「活動管理」。改由後端出這張表
之後,前端沒有任何一處還寫得出第三種說法。**例外規則也一律寫在這裡**(`paths` 的第二個
入口、`also` 的簽核關卡鍵),否則前端又得為那兩條各留一份對照。
"""

from typing import NamedTuple


class AdminPage(NamedTuple):
    key: str
    label: str  # 權限彈窗與側欄共用的顯示詞
    paths: tuple[str, ...]  # 前端路由前綴;第一個為主要入口
    also: tuple[str, ...] = ()  # 另外開給哪些非頁面鍵(簽核關卡帳號要進得了審核頁)


# 簽核關卡鍵:寫在同一個 `users.permissions`,但不開頁、只開簽核動作。
# 顯示詞為「承辦人」,程式鍵維持 advisor(AGENTS.md 核心業務規則)。
# 這是**唯一一份**字面值 —— 白名單與權限彈窗目錄都由它推導,少了任何一邊,
# 就會出現「後端收得下、彈窗授不出」或反過來「畫得出、存檔 422」
APPROVAL_STAGES: tuple[tuple[str, str], ...] = (
    ("approve_advisor", "承辦人簽核"),
    ("approve_chief", "組長簽核"),
    ("approve_dean", "學務長簽核"),
)
_STAGES = tuple(k for k, _ in APPROVAL_STAGES)

# 顯示順序即權限彈窗的排列順序,與側欄分組一致
ADMIN_PAGES: tuple[AdminPage, ...] = (
    AdminPage("areview", "申請審核", ("/admin/review",), _STAGES),
    AdminPage("aclose", "結案審核", ("/admin/close-review",), ("approve_advisor",)),
    AdminPage("aactivity", "所有活動", ("/admin/activities",)),
    # 報名管理的兩頁共用一把鍵:能看報名就能建報名活動(decisions.md D-01)
    AdminPage("asignup", "報名管理", ("/admin/signups", "/admin/signup-items")),
    AdminPage("aannounce", "發布系統公告", ("/admin/announcements",)),
    AdminPage("abooking", "臨時場地器材借用審核", ("/admin/bookings",)),
    AdminPage("aroom", "固定場地借用審核", ("/admin/rooms",)),
    AdminPage("amanual", "手動借用", ("/admin/manual-booking",)),
    AdminPage("arule", "場地不開放規則", ("/admin/venue-rules",)),
    AdminPage("aclub", "社團總覽", ("/admin/club-overview",)),
    AdminPage("amember", "成員列表", ("/admin/members",)),
    AdminPage("aclubact", "社團活動列表", ("/admin/club-activities",)),
    AdminPage("aclubset", "社團管理項目", ("/admin/club-settings",)),
    AdminPage("aoverdue", "逾期追蹤與停權", ("/admin/overdue",)),
    AdminPage("aeval", "行政分審核", ("/admin/eval",)),
    AdminPage("aaccount", "帳號管理", ("/admin/accounts",)),
    AdminPage("acert", "幹部證明管理", ("/admin/certificates",)),
    AdminPage("apostal", "郵局帳戶管理", ("/admin/postal",)),
    AdminPage("amaint", "維修管理", ("/admin/maintenance",)),
    AdminPage("aviol", "違規管理", ("/admin/violations",)),
    AdminPage("afiles", "檔案管理", ("/admin/files",)),
    # 工讀生端與評審端的頁面在行政端整組再掛一次(前綴 /admin/pt、/admin/viewer,
    # 共用同一批元件與同一批端點)。**一組一把鍵,不是一頁一把** —— 那兩組各自是
    # 「一個人一份工作」,沒有只給借出不給歸還、或只給評分不給回顧的分法(同 asignup)。
    # 一把鍵配一個路徑前綴,底下所有子頁一次涵蓋
    AdminPage("astaff", "工讀生作業", ("/admin/pt",)),
    AdminPage("aviewer", "評審評分", ("/admin/viewer",)),
    AdminPage("asetting", "系統設定與主檔", ("/admin/settings",)),
    AdminPage("aaudit", "稽核軌跡", ("/admin/audit",)),
)

PAGE_KEYS = frozenset(p.key for p in ADMIN_PAGES)

STAGE_KEYS = frozenset(_STAGES)

PERMISSION_KEYS = PAGE_KEYS | STAGE_KEYS

# ---- 跨頁共用的讀取端點:誰真的需要,就只給誰 ----
#
# 一把鍵開得了頁面卻讀不到那頁的資料,等於那把鍵沒用;反過來給太寬,
# 就是拿別頁的鍵讀得到不該看的資料。每一組都以「哪些頁面實際會呼叫」為準,
# 對應的測試在 tests/test_admin_permissions.PAGE_READS。

# GET /admin/clubs 全校社團清單(含帳號名、啟用狀態、停權日):
# 帳號管理的社團分頁、逾期追蹤的停權中清單。公告的分眾走 /clubs/options,不在此列
CLUB_LIST_KEYS = ("aaccount", "aoverdue")

# GET /admin/clubs/{id} 單一社團詳情(指導老師、聯絡信箱、停權原因)
CLUB_DETAIL_KEYS = ("aclub", "aclubset", "aoverdue")

# GET /admin/clubs/{id}/members 成員名單:成員列表頁專用,不含上面那些社團資料
CLUB_MEMBER_KEYS = ("amember",)

# GET /admin/venues 場地主檔:借用審核的篩選、系統設定的場地卡、
# 手動借用與不開放規則的場地下拉。`include_inactive` 另限主檔維護頁
VENUE_READ_KEYS = ("abooking", "asetting", "amanual", "arule")

# GET /admin/equipment-loans 器材借用清單:借用審核、逾期追蹤
LOAN_READ_KEYS = ("abooking", "aoverdue")

# ---- 檔案下載:看得到那一頁 = 下載得了那一頁的檔案(decisions.md D-02)----
#
# 改這張表之前先想清楚:`afiles`(檔案管理)**刻意不在任何一列**。那頁的用途是
# 看磁碟怎麼被吃掉、清理報修的大型影片,不是取得檔案內容 —— 讓它下載得到全部,
# 就回到 ISS-23 原本的問題(只持檔案管理權限的人拿得到郵局存簿影本這類個資)。
# `subject_type` 不在表內的檔案一律只有 super 下載得到(fail-closed)。
FILE_SUBJECT_KEYS: dict[str, tuple[str, ...]] = {
    # 活動申請附件與結案照片:會實際審閱或檢視活動的頁面
    "activity": ("areview", "aclose", "aactivity", "aclubact", "aeval", "aclub"),
    "maintenance": ("amaint", "aclub"),
    "postal_change": ("apostal",),
    # **`aviewer` 刻意不在這裡**:admin 分支的下載不做指派範圍檢查(services/files.can_access),
    # 給了就等於讓一把「只多三頁」的鍵拿到全校全年度的佐證檔,繞過 2026-07-21 對評審收緊的
    # 那條分組 × 獎項 × 年度。而且管理員身上沒有評審指派(GAP-01 沒有寫入 API),
    # 那頁一個檔案都列不出來 —— 要開回來,得連同 can_access 的範圍檢查一起做
    "eval_upload": ("aeval",),
    "violation": ("aviol",),
}


def can_download(subject_type: str | None, user_permissions: list[str]) -> bool:
    """非 super 管理員能否下載此類檔案。"""
    return any(k in user_permissions for k in FILE_SUBJECT_KEYS.get(subject_type or "", ()))


def catalogue() -> list[dict[str, object]]:
    """供 `/auth/me` 送給前端;順序即權限彈窗的排列順序。"""
    return [
        {"key": p.key, "label": p.label, "paths": list(p.paths), "also": list(p.also)}
        for p in ADMIN_PAGES
    ]


def stage_catalogue() -> list[dict[str, str]]:
    """簽核關卡目錄:權限彈窗要授得出去,否則正式庫沒有人簽得了學務長關。

    `super` 也不能代簽學務長(`_require_stage_key`),所以這三把鍵**只能**由這裡授出。
    """
    return [{"key": k, "label": label} for k, label in APPROVAL_STAGES]
