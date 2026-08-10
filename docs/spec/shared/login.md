# 登入 / 強制改密 / 面板未開放

`/login`、`/change-password`、`/coming-soon` · 全角色 · `features/auth/`

## 用途

唯一入口。目前 `/` 對未登入者即導向 `/login`(Roadmap 要改成社團導覽頁,登入鈕移到右上角)。

## 資料來源

| 動作 | 端點 |
|---|---|
| 登入 | `POST /auth/login` |
| 恢復 session | `GET /auth/me` |
| 登出 | `POST /auth/logout` |
| 改密 | `POST /auth/change-password` |
| 上傳前置驗證(nginx `auth_request`) | `GET /auth/precheck` |

## 畫面

**登入頁**:標題「社團管理系統」、帳號、密碼、登入鈕;頁尾 `Copyright © 2026 國立臺灣科技大學` + 維護者資訊 Popover(姓名、Discord、信箱)。跨年後自動顯示 `2026-{今年}`。

**改密頁**:目前密碼、新密碼、確認新密碼;副標依 `mustChangePassword` 切換為「首次登入需變更密碼後才能繼續使用」或「變更登入密碼」。密碼規則以說明文字呈現。底部「改用其他帳號登入」= 登出。

**面板未開放頁**:`homeOf()` 對未知角色的落點,只有姓名與登出鈕。四種角色現皆有面板,實際到不了。

## 規則

- 登入成功後依 `mustChangePassword` 導向 `/change-password`,否則導向 `homeOf(role)`:`admin`→`/admin`、`club`→`/`、`staff`→`/pt`、`viewer`→`/viewer`
- 未改密時後端 `get_current_user` 對所有業務端點回 403 `PASSWORD_CHANGE_REQUIRED`,只放行 `/auth/me`、改密、登出
- session 存 DB,cookie `session_id` 為 HttpOnly;7 天滑動效期,剩餘 < 6 天 23 小時才續期,續期時一併重送 cookie
- CSRF double-submit:`csrf_token` cookie 非 HttpOnly,前端 `client.ts` 對 POST/PUT/PATCH/DELETE 自動附 `X-CSRF-Token`
- 登入限流在應用層(`login_limiter`,只計失敗)與 nginx `limit_req` 各一道;帳號本身連錯 5 次鎖 15 分
- 登入成功會清 `sessionStorage` 的蓋板已關閉紀錄,使蓋板公告每次登入重新顯示

## 未完成 / 問題

- 登入/登出不清 TanStack Query 快取,同一台電腦換人登入會先看到前一位使用者的資料
- Argon2 雜湊在事件迴圈同步執行,登入尖峰會阻塞整站
- 密碼重設與登入可競態,產生「重設後舊密碼仍有效」的 session
- `/coming-soon` 是死路由,四角色皆有面板
