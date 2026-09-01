# 場地不開放規則

`/admin/venue-rules` · `admin` · 權限鍵 `arule` · `features/admin/VenueRulesPage.tsx`

## 用途

設定場地在特定期間、特定星期、特定節次不開放借用(連假、行政徵用、保養)。

## 資料來源

| 動作 | 端點 |
|---|---|
| 場地主檔 | `GET /admin/venues` |
| 規則清單 | `GET /admin/venue-rules[?venue_id=]`(不分頁) |
| 新增 / 刪除 | `POST /admin/venue-rules`、`DELETE /admin/venue-rules/{id}` |

## 畫面

**新增規則** — 場地、期間(RangePicker,單日 = 起訖同日)、限定星期(複選,不選 = 每天)、原因(欄位掛 Tooltip 提醒**這段字公開**)、不開放時段(`PeriodPicker`)。

**規則清單** — 場地、期間、星期、時段、原因、刪除。依結束日新到舊排序。

## 規則

- `weekdays` 為 ISO 1–7,NULL/空 = 區間內每天
- 生效範圍:場況圖標「不開放」(實心深灰,比固定借用深一階;原因掛 hover,匿名也看得到)且**蓋過所有其他狀態**;社團申請臨時場地時 422、行政核准臨時場地時 409 `SLOT_BLOCKED`
- **行政手動借用不受規則限制**
- 建立規則**不回溯撤銷既有已核准借用**
- **固定借用兩關都檢核本規則**:送出時擋(`booking_service` 的 `blocked` 判定 —— 區間內只要有一天的該星期該節次被封,整個每週時段就不受理),核准時再擋一次(409 `SLOT_BLOCKED`)
- 刪除是硬刪,異動軌跡靠 `audit_logs`

## 未完成 / 問題

- 建立規則時不提示該區間已有多少筆已核准借用會被覆蓋
- 規則不可編輯,打錯只能刪掉重建;清單不分頁
