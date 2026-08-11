# 頁面規格

一頁一檔,描述**現況**:這頁做什麼、資料從哪來、有哪些規則、哪裡還沒做完或做錯。

不重複既有文件:資料表與狀態機看 `../data-model.md`,API 契約與部署看 `../architecture.md`,視覺與元件慣例看 `../design-guide.md`,通知文案看 `../discord-webhook-messages.md`。

跨頁彙總與編號在 [`../gaps.md`](../gaps.md)(未完成功能)與 [`../issues.md`](../issues.md)(已知問題);各頁的「未完成 / 問題」段只列該頁相關項,不重複編號。

## 每檔的固定結構

| 段 | 內容 |
|---|---|
| 抬頭 | 路由 · 角色 · 權限鍵 · 實作檔 |
| 用途 | 一句話 |
| 資料來源 | 端點表 |
| 畫面 | 區塊與欄位 |
| 規則 | 只寫非顯而易見的判斷 |
| 未完成 / 問題 | 該頁的問題條列;沒有問題時整段省略 |

## 共用

| 檔 | 內容 |
|---|---|
| [shared/login.md](shared/login.md) | 登入、強制改密、面板未開放 |
| [shared/shell.md](shared/shell.md) | 外殼、側欄、通知鈴鐺、蓋板公告、未存檔守衛、權限閘 |

## 社團端(`club`)

| 頁 | 路由 |
|---|---|
| [club/overview.md](club/overview.md) | `/` |
| [club/activity-form.md](club/activity-form.md) | `/activities/new`、`/activities/:id/edit` |
| [club/activity-close.md](club/activity-close.md) | `/activities/close` |
| [club/activity-list.md](club/activity-list.md) | `/activities` |
| [club/members.md](club/members.md) | `/members` |
| [club/club-settings.md](club/club-settings.md) | `/club-settings` |
| [club/booking-overview.md](club/booking-overview.md) | `/bookings` |
| [club/booking-fixed.md](club/booking-fixed.md) | `/bookings/fixed` |
| [club/booking-venue.md](club/booking-venue.md) | `/bookings/venue` |
| [club/booking-equipment.md](club/booking-equipment.md) | `/bookings/equipment` |
| [club/signup-list.md](club/signup-list.md) | `/signup` |
| [club/signup-form.md](club/signup-form.md) | `/signup/:id` |
| [club/maintenance.md](club/maintenance.md) | `/maintenance` |
| [club/postal.md](club/postal.md) | `/postal` |
| [club/certificate.md](club/certificate.md) | `/certificates` |
| [club/eval-docs.md](club/eval-docs.md) | `/eval` |
| [club/eval-award.md](club/eval-award.md) | `/eval/award/:award` |
| [club/eval-result.md](club/eval-result.md) | `/eval/result`(未實作) |
| [club/violations.md](club/violations.md) | `/violations` |

## 行政端(`admin`)

| 頁 | 路由 | 權限鍵 |
|---|---|---|
| [admin/home.md](admin/home.md) | `/admin` | 全體管理員 |
| [admin/review.md](admin/review.md) | `/admin/review` | `areview`/`aact`/簽核鍵 |
| [admin/close-review.md](admin/close-review.md) | `/admin/close-review` | `aclose`/`approve_advisor` |
| [admin/signups.md](admin/signups.md) | `/admin/signups` | `areg`/`asignup` |
| [admin/signup-builder.md](admin/signup-builder.md) | `/admin/signup-items/new` | `areg`/`asignup` |
| [admin/announcements.md](admin/announcements.md) | `/admin/announcements` | `aannounce` |
| [admin/bookings.md](admin/bookings.md) | `/admin/bookings` | `abooking` |
| [admin/rooms.md](admin/rooms.md) | `/admin/rooms` | `aroom` |
| [admin/manual-booking.md](admin/manual-booking.md) | `/admin/manual-booking` | super |
| [admin/venue-rules.md](admin/venue-rules.md) | `/admin/venue-rules` | super |
| [admin/club-overview.md](admin/club-overview.md) | `/admin/club-overview` | `amember` |
| [admin/members.md](admin/members.md) | `/admin/members` | `amember` |
| [admin/club-settings.md](admin/club-settings.md) | `/admin/club-settings` | `amember` |
| [admin/overdue.md](admin/overdue.md) | `/admin/overdue` | super |
| [admin/eval.md](admin/eval.md) | `/admin/eval` | `aeval` |
| [admin/accounts.md](admin/accounts.md) | `/admin/accounts` | super |
| [admin/applications.md](admin/applications.md) | `/admin/applications` | `aapply` |
| [admin/maintenance.md](admin/maintenance.md) | `/admin/maintenance` | `amaint` |
| [admin/violations.md](admin/violations.md) | `/admin/violations` | `aviol` |
| [admin/files.md](admin/files.md) | `/admin/files` | `afiles` |
| [admin/settings.md](admin/settings.md) | `/admin/settings` | super |
| [admin/audit.md](admin/audit.md) | `/admin/audit` | super |

## 工讀生端(`staff`,URL 前綴 `/pt`)

| 頁 | 路由 |
|---|---|
| [pt/violation-form.md](pt/violation-form.md) | `/pt/violations/new` |
| [pt/violations.md](pt/violations.md) | `/pt/violations` |
| [pt/checkout.md](pt/checkout.md) | `/pt/checkout` |
| [pt/checkin.md](pt/checkin.md) | `/pt/checkin` |
| [pt/overdue.md](pt/overdue.md) | `/pt/overdue` |

## 評審端(`viewer`)

| 頁 | 路由 |
|---|---|
| [viewer/my-reviews.md](viewer/my-reviews.md) | `/viewer` |
| [viewer/score.md](viewer/score.md) | `/viewer/score` |
| [viewer/done.md](viewer/done.md) | `/viewer/done` |
