# 評鑑結果

`/eval/result` · `club` · `features/eval/EvalResultPage.tsx`

## 用途

原始設計:社團看自己各獎項的成績、等第與評審評語。

## 現況

**整頁是寫死的假資料。** `RESULTS` 是模組層級常數(最佳社團獎 82.4 分 A 等、兩則評審評語;最佳活動獎「成績尚未公布」),整個檔案沒有任何 `api` import,不是 fallback 也不是 dev-only —— 每個社團登入後看到的都是同一份。副標「114 學年」也是寫死的。

側欄「社團評鑑 → 評鑑結果」直接指向這裡。

## 需要什麼才能做

這頁是評鑑成績彙總鏈的最末端,前面三段都還沒做:

1. 分組與評審指派(`eval_groups` / `eval_group_clubs` / `eval_group_reviewers` 有表無寫入 API)
2. 評審代號 A/B 的匿名映射
3. 跨評審平均、最佳社團獎的 40%/60% 加權、名次

`services/evaluation.py` 目前只有行政分自動計算,完全沒有跨評審彙總這一層。

## 應有規則(尚未實作)

- 成績公布與否依 `eval_settings.comment_released`
- 評語顯示評審代號(評審A/B),依 `eval_group_reviewers.sort` 推導,對社團匿名
- 人工調整(`eval_adjustments`)應蓋過計算值

## 未完成 / 問題

- 整頁硬編假分數,每個社團看到同一份 —— **上線前必須移除本頁入口**
- 分組與評審指派、評審代號、成績總表、本頁,四者屬同一條彙總鏈,應當單一開發段落規劃
