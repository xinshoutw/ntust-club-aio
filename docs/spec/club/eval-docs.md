# 評鑑資料總覽

`/eval` · `club` · `features/eval/EvalDocsPage.tsx`

## 用途

社團看自己的行政資料得分(唯讀)與五個獎項的資料上傳進度。

## 資料來源

`GET /club/eval/overview` — 回年度、採計區間、ad1–ad8 + 加減分、總分、各獎項上傳進度。

## 畫面

頁首:副標「{年度}學年 · 採計期間 {start} – {end}」,右側「行政資料總分 N / 100」。

**行政資料卡片**(9 張,含加減分)— 項目名 + 分數 / 滿分。分數為正綠、負紅、零灰;加減分卡的滿分顯示 `+5`。被學務處人工調整過的卡片右上加「調整」標記,Tooltip 顯示自動計算值。點卡片跳到資料來源頁:

| 項目 | 跳轉 |
|---|---|
| ad1 活動申請 | `/activities` |
| ad2 照片影片 / ad3 成果單 / ad4 心得 | `/activities/close` |
| ad5 名單更新 | `/members` |
| ad6 網頁經營 | `/club-settings` |
| ad7 負責人會議 / ad8 幹訓 | `/signup` |
| 加減分 | `/violations` |

**競賽獎項資料**(5 張)— 獎項名 + 「已上傳 N/M 項」,點進 `/eval/award/{id}`。

## 規則

- 行政分**全部即時彙算不落表**,再套 `eval_adjustments` 的人工調整
- 可執行規格是 `frontend/src/features/eval/scoring.ts`(含 vitest),後端 `services/scoring.py` 依同規則實作,兩份已逐條比對等價
- 進度分母只計 `is_admin_item=false` 的細項(自動採計項不需上傳)
- 總分**上限 100、下限 0**(decisions.md DEC-08):加計表現優良後仍以 100 封頂,勸導扣分也不會讓總分變成負數 —— 負分帶進最佳社團獎的 40%/60% 加權會把營運分一起吃掉。可執行規格 `scoring.ts` 的 `totalOf` 與後端 `total_of` 是同一條夾擠(畫面顯示的是後端回傳值)

## 未完成 / 問題

- **側欄入口目前反灰**(Tooltip「尚未開發完成」):評鑑整條線(GAP-01～04)還沒做完,
  兩端入口一起收。反灰的只有側欄,頁面本身仍在,直接輸入網址進得去
- 錯誤呈現用純文字卡片而非全站共用的 `QueryError`,沒有重試鈕
