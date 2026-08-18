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


_STAGES = ("approve_advisor", "approve_chief", "approve_dean")

# 顯示順序即權限彈窗的排列順序,與側欄分組一致
ADMIN_PAGES: tuple[AdminPage, ...] = (
    AdminPage("areview", "申請審核", ("/admin/review",), _STAGES),
    AdminPage("aclose", "結案審核", ("/admin/close-review",), ("approve_advisor",)),
    # 報名管理的兩頁共用一把鍵:能看報名就能建報名活動(decisions.md D-01)
    AdminPage("asignup", "報名管理", ("/admin/signups", "/admin/signup-items")),
    AdminPage("aannounce", "發布系統公告", ("/admin/announcements",)),
    AdminPage("abooking", "臨時場地器材借用審核", ("/admin/bookings",)),
    AdminPage("aroom", "固定場地借用審核", ("/admin/rooms",)),
    AdminPage("amanual", "手動借用", ("/admin/manual-booking",)),
    AdminPage("arule", "場地不開放規則", ("/admin/venue-rules",)),
    AdminPage("aclub", "社團總覽", ("/admin/club-overview",)),
    AdminPage("amember", "成員列表", ("/admin/members",)),
    AdminPage("aclubset", "社團管理項目", ("/admin/club-settings",)),
    AdminPage("aoverdue", "逾期追蹤與停權", ("/admin/overdue",)),
    AdminPage("aeval", "行政分審核", ("/admin/eval",)),
    AdminPage("aaccount", "帳號管理", ("/admin/accounts",)),
    AdminPage("aapply", "線上申請管理", ("/admin/applications",)),
    AdminPage("amaint", "維修管理", ("/admin/maintenance",)),
    AdminPage("aviol", "違規管理", ("/admin/violations",)),
    AdminPage("afiles", "檔案管理", ("/admin/files",)),
    AdminPage("asetting", "系統設定與主檔", ("/admin/settings",)),
    AdminPage("aaudit", "稽核軌跡", ("/admin/audit",)),
)

PAGE_KEYS = frozenset(p.key for p in ADMIN_PAGES)

# 簽核關卡鍵:寫在同一個 `users.permissions`,但不是頁面權限,權限彈窗不列
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


def catalogue() -> list[dict[str, object]]:
    """供 `/auth/me` 送給前端;順序即權限彈窗的排列順序。"""
    return [
        {"key": p.key, "label": p.label, "paths": list(p.paths), "also": list(p.also)}
        for p in ADMIN_PAGES
    ]
