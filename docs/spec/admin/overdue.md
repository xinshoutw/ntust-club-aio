# 逾期追蹤與停權

`/admin/overdue` · `admin`(**僅 super**) · `features/admin/OverduePage.tsx`

## 用途

看逾期未還器材、寄提醒、停權社團與解除停權。停權會直接擋掉該社的所有借用申請。

## 資料來源

| 動作 | 端點 |
|---|---|
| 逾期清單 | `GET /admin/equipment-loans?status=overdue` |
| 停權中社團 | `GET /admin/clubs`(前端篩 `suspended_until`)+ 逐社 `GET /admin/clubs/{id}` 補 `suspend_reason`(列表的 `AdminClubOut` 不含此欄) |
| 停權表單的社團選單 | `GET /admin/clubs/options`(`require_role(ADMIN)`,與列表的 `amember` 是不同權限) |
| 寄提醒 | `POST /admin/equipment-loans/{id}/remind` |
| 停權 / 解除 | `POST\|DELETE /admin/clubs/{id}/suspend` |

## 畫面

**逾期未還器材** — 社團、器材與數量、借用資訊(區間 + 活動)、狀態、寄送提醒。

**停權中社團** — 社團、狀態、停權資訊(至 YYYY/MM/DD · 原因)、解除停權。

右上「停權社團…」開表單:社團(Cascader)、停權至(不可早於今天)、原因(必填,會通知社團)。

## 規則

- 逾期清單附申請時填的聯絡電話:這頁的主要動作是催還,聯絡方式要在手邊

- 逾期定義與工讀生端一致:`checked_out` 且已過「結束日之隔天上班日 10:30」,以單調門檻日在 SQL 篩選
- 停權寫 `clubs.suspended_until` / `suspend_reason`;**攔截點在社團端的借用申請**(`_ensure_not_suspended`,回 403 `CLUB_SUSPENDED`),不影響登入與其他功能
- 解除停權即清空兩個欄位
- 停權與解除都寫 `audit_logs` 並推 Discord

## 未完成 / 問題

- 兩張表都沒有分頁,逾期或停權筆數一多就整頁塞滿
- 停權不會自動發生:逾期到什麼程度該停權完全靠人工判斷,沒有建議或門檻提示
- 提醒無次數限制也不顯示上次提醒時間
- 停權中社團的清單靠前端從全部社團篩出來,沒有專屬端點,而且要逐社再打一次詳情才拿得到停權原因
- 前端只篩 `suspended_until != null` 不比日期,但後端攔截條件是 `suspended_until >= today`:**停權日已過的社團仍留在表格上,實際早已不再被擋**
