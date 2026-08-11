# 我負責的評分

`/viewer` · `viewer` · `features/viewer/MyReviewsPage.tsx`

## 用途

評審登入後的首頁:看自己被指派了哪些「獎項 × 分組」以及進度。

## 資料來源

`GET /viewer/assignments` — 依 `eval_group_reviewers(user_id=me)` → `eval_groups(year=當前評鑑年)` 展開,回獎項、分組、評分細項、受評社團與各社評分狀態。

## 畫面

卡片格。每張:獎項名、分組名、「評分細項 N 項,滿分 M(含現場簡報 20)」、「已完成 X / Y 社團」。點卡進 `/viewer/score?group={groupId}`。

無指派時顯示「尚未被指派評分」。

## 規則

- 評鑑年一律由 `system_settings.eval_window` 推導,不由前端指定
- 停用的獎項不列入指派(與 detail/save 端點對停用獎項回 404 保持一致)
- 細項只取 `is_admin_item=false` —— 最佳社團獎的 ad1–ad8 是系統自動評分,不給評審打
- 卡片以 `groupId` 而非 `awardId` 為鍵:同一評審可能在同獎項被指派多個分組(A/B 組)

## 未完成 / 問題

- **分組與評審指派沒有任何寫入 API**,只能直接操作 DB;正式環境本頁必定是「尚未被指派評分」
