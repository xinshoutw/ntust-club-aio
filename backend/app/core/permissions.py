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

# 社團三頁共用的唯讀資料(單一社團、成員名單):任一頁的權限都讀得到
CLUB_READ_KEYS = ("aclub", "amember", "aclubset")

# 社團清單再多兩個讀者:帳號管理的社團分頁、公告的分眾選擇
CLUB_LIST_KEYS = (*CLUB_READ_KEYS, "aaccount", "aannounce")


def catalogue() -> list[dict[str, object]]:
    """供 `/auth/me` 送給前端;順序即權限彈窗的排列順序。"""
    return [
        {"key": p.key, "label": p.label, "paths": list(p.paths), "also": list(p.also)}
        for p in ADMIN_PAGES
    ]
