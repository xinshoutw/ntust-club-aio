# 帳號管理

`/admin/accounts` · `admin`(**僅 super**) · `features/admin/AccountsPage.tsx`

## 用途

四類帳號的建立、刪除、停權、重設密碼、權限設定,合一頁四個分頁。

## 資料來源

| 動作 | 端點 |
|---|---|
| 管理員/工讀生/評審清單 | `GET /admin/accounts` |
| 建立 / 刪除 / 啟停 / 重設密碼 / 權限 | `POST /admin/accounts`、`DELETE`、`PUT /{id}/active`、`POST /{id}/reset-password`、`PUT /{id}/permissions` |
| 社團分頁 | `GET /admin/clubs`、`POST /admin/clubs/{id}/account`、`POST /admin/clubs/{id}/reset-password`、`PATCH /admin/clubs/{id}` |

## 畫面

四個分頁:管理員 / 工讀生 / 評審 / 社團。前三類清單依姓名升冪(前端排)。社團分頁支援搜尋與前端分頁(每頁 20)。

**權限設定彈窗**(僅管理員)— 12 個頁面權限鍵的勾選框:申請審核 `areview`、結案審核 `aclose`、活動管理 `asignup`、發布公告 `aannounce`、臨時場地器材借用審核 `abooking`、固定場地借用審核 `aroom`、社團管理 `amember`、行政分審核 `aeval`、維修管理 `amaint`、線上申請管理 `aapply`、違規管理 `aviol`、檔案管理 `afiles`。彈窗外的既有鍵(簽核關卡 `approve_*`、舊鍵 `aact`/`areg`)**只顯示不可勾,儲存時原樣保留**。

**一次性密碼彈窗** — 帳號 + 密碼(預設遮蔽,可複製),說明「密碼僅顯示這一次」。

## 規則

- 建立與重設密碼:後端產生一次性密碼、argon2id 雜湊、`must_change_password=true`;**明碼只在該次回應出現**
- 不可刪除或停權自己的帳號,也不可對 `is_super` 帳號動手
- `is_super` 不開放由 API 建立
- 刪除帳號時稽核紀錄保留(`audit_logs.user_id` ON DELETE SET NULL);已有簽核/開單等業務 FK 的帳號會撞 FK → 409「請改用停權」
- 停權與重設密碼都會**立即撤銷該帳號所有 session**
- 社團分頁的啟停是「社團主檔 + 帳號一併連動」,與前三類的純帳號停權語意不同
- 評審帳號建立時 `can_view_eval` 預設 true

## 未完成 / 問題

- **一次性密碼彈窗在缺 `password` 時會用前端 `genPassword()` 產生假密碼並顯示** —— 承辦會拿到一組完全無效的密碼
- 權限鍵前後端命名未統一(`areview`/`aact`、`asignup`/`areg`),靠 any-of 硬撐 —— 報名管理走 `require_permission("areg","asignup")`,活動審核則是 `admin_activities._reviewer` 自訂的 any-of。後端白名單兩套都收,DB 裡兩套鍵皆合法;**正式建帳號之前必須先統一**
- 社團帳號重設密碼在此需 super,在管理項目頁只需 `amember`,兩處門檻不一致
- 資料庫層沒有「一社一帳號」唯一約束,只靠應用層檢查,遷移腳本又繞過應用層
- 密碼重設與登入可競態,可能產生「重設後舊密碼仍有效」的 session
- 複製失敗的提示文案「複製失敗!請按下顯示密碼後手動複製」使用驚嘆號,違反文案規範
