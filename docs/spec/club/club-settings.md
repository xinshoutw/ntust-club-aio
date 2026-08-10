# 管理項目

`/club-settings` · `club` · `features/club-settings/ClubSettingsPage.tsx`

## 用途

社團自己維護的四類資料:指導老師、社團簡介、聯絡與通知、更換密碼。頂欄帳號選單的「設定」也指到這裡。

## 資料來源

| 動作 | 端點 |
|---|---|
| 讀取 | `GET /club/profile` |
| 儲存 | `PATCH /club/profile` |
| 改密 | `POST /auth/change-password` |

## 畫面

單一表單、四張卡片(2×2),右下角統一「儲存」。被改過的欄位加橘黃外框(`.field-dirty`),有變更時「儲存」左側顯示「尚未儲存」。

| 卡片 | 欄位 |
|---|---|
| 指導老師 | 校內(姓名必填、系所、Email、分機)、校外(姓名、單位/職稱、Email、電話,全選填) |
| 社團簡介 | 社團名稱(唯讀)、英文名稱、社團網頁連結、簡介 |
| 聯絡與通知 | 聯絡通知信箱 1(必填)、2、3、Discord Webhook URL |
| 更換密碼 | 目前密碼、新密碼、確認新密碼 |

## 規則

- 密碼三欄只要填了任一欄就三欄一起驗;密碼與 profile 是兩支 API,profile 成功而改密失敗時只有密碼欄維持 dirty
- 網頁連結填了即得 ad6 的 5 分(不追蹤更新時間)
- Discord Webhook 前端驗 `https://discord.com/api/webhooks/…`;該社事件會在全域 webhook 之外另推一份到這裡
- 聯絡信箱是公告 Email 通知的收件人
- 社團名稱與屬性(自治性/學藝性…)不可自行修改,只能由行政端改
- profile 變更寫 `audit_logs`

## 未完成 / 問題

- 停權狀態(`suspended_until` / `suspend_reason`)後端有回傳,但 `api/clubProfile.ts` 的 `ClubProfile` 型別根本沒接;社團只有在送借用撞到 403 `CLUB_SUSPENDED` 時才知道自己被停權
