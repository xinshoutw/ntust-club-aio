# 線上報名(填寫)

`/signup/:id` · `club` · `features/signup/SignupFormPage.tsx`

## 用途

依管理員定義的動態表單逐人填寫並送出報名。

## 資料來源

| 動作 | 端點 |
|---|---|
| 活動詳情 + 我的草稿 / 報名 | `GET /club/signup-items/{id}` |
| 存草稿 | `PUT /club/signup-items/{id}/draft` |
| 送出 | `POST /club/signup-items/{id}/signup` |

## 畫面

頁首「返回線上報名」。資訊卡:說明、活動時間、地點、截止日、每社名額。

競賽報名(`is_eval`)在參加人卡片之上多一張「參賽獎項」複選卡,選項來自詳情的 `award_options`(啟用中的獎項,依 `sort`);至少勾一項才送得出去。

參加人卡片逐張排列,每張依 `fields` 動態渲染(text / textarea / radio / checkbox / select);多人活動下方有「+ 新增參加人(N/上限)」虛線鈕,達上限即停用。底部:取消、儲存草稿、送出報名。

三種替代畫面:已報名 → 顯示報名紀錄與「一經報名不得更改」;活動不存在 → 說明;已截止 → 顯示截止日。

## 規則

- 草稿寫 DB(`signup_drafts`),跨裝置續填;送出時刪除
- 送出前前端會過濾掉不在目前 `fields` 內的 key(草稿可能殘留已被管理員移除的欄位),後端也一律拒絕未知 key
- 後端逐人驗證:必填、radio/select 值須在選項內、checkbox 須為選項子集、文字 ≤1000 字
- 人數不得超過 `max_participants`

## 未完成 / 問題

- 沒有未存檔守衛;「取消」直接導頁不確認
- 管理員在已有報名後修改 `fields`,舊 entries 不回填也不警告
