# 帳號管理

`/admin/accounts` · `admin`(**僅 super**) · `features/admin/AccountsPage.tsx`

## 用途

四類帳號的建立、刪除、停權、重設密碼、權限設定,合一頁四個分頁。

## 資料來源

| 動作 | 端點 |
|---|---|
| 管理員/工讀生/評審清單 | `GET /admin/accounts?role=…`(伺服器端分頁,每頁 20;一次一類) |
| 建立 / 刪除 / 啟停 / 重設密碼 / 權限 | `POST /admin/accounts`、`DELETE`、`PUT /{id}/active`、`POST /{id}/reset-password`、`PUT /{id}/permissions` |
| 社團分頁 | `GET /admin/clubs`、`POST /admin/clubs/{id}/account`、`POST /admin/clubs/{id}/reset-password`、`PATCH /admin/clubs/{id}` |

## 畫面

四個分頁:管理員 / 工讀生 / 評審 / 社團。前三類各自向後端要該角色的那一頁(姓名升冪由後端排,換分頁時頁碼歸 1)。社團分頁走不分頁的主檔端點,搜尋與分頁在前端(每頁 20)。

**權限設定彈窗**(僅管理員)— 12 個頁面權限鍵的勾選框:申請審核 `areview`、結案審核 `aclose`、報名管理 `asignup`、發布公告 `aannounce`、臨時場地器材借用審核 `abooking`、固定場地借用審核 `aroom`、社團管理 `amember`、行政分審核 `aeval`、維修管理 `amaint`、線上申請管理 `aapply`、違規管理 `aviol`、檔案管理 `afiles`。彈窗外的既有鍵(簽核關卡 `approve_*`)**只顯示不可勾,儲存時原樣保留**。

**一次性密碼彈窗** — 帳號 + 密碼(預設遮蔽,可複製),說明「密碼僅顯示這一次」。

## 規則

- 建立與重設密碼:後端產生一次性密碼、argon2id 雜湊、`must_change_password=true`;**明碼只在該次回應出現**
- 不可刪除或停權自己的帳號,也不可對 `is_super` 帳號動手
- `is_super` 不開放由 API 建立
- 刪除帳號時稽核紀錄保留(`audit_logs.user_id` ON DELETE SET NULL);已有簽核/開單等業務 FK 的帳號會撞 FK → 409「請改用停權」
- 停權與重設密碼都會**立即撤銷該帳號所有 session**
- 社團分頁的啟停是「社團主檔 + 帳號一併連動」,與前三類的純帳號停權語意不同(狀態標示亦分別為「停用」/「停權」)
- 社團分頁的狀態欄另標示器材逾期停權(`suspended_until` 未過期者顯示到期日):停權中但仍啟用的社團一眼看得出來
- 評審帳號建立時 `can_view_eval` 預設 true

## 未完成 / 問題

- 社團帳號重設密碼在此需 super,在管理項目頁只需 `amember`,兩處門檻不一致
- 資料庫層沒有「一社一帳號」唯一約束,只靠應用層檢查,遷移腳本又繞過應用層
