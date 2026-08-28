# 獎項資料上傳

`/eval/award/:award` · `club` · `features/eval/AwardDetailPage.tsx`

## 用途

依該獎項當年度的評分細項逐項上傳佐證資料。

## 資料來源

| 動作 | 端點 |
|---|---|
| 細項與已上傳檔 | `GET /club/eval/awards/{award_id}` |
| 上傳 | `POST /club/eval/awards/{award_id}/items/{item_id}/files` |
| 移除 | `DELETE /club/eval/awards/{award_id}/items/{item_id}/files/{upload_id}` |

## 畫面

頁首:獎項名、右側「上傳進度 N/M」。

細項依 `group_label` 分組成卡片,每列:細項名 + 配分、說明文字、已上傳檔案 chip(檔名可點預覽、× 移除)、右側「上傳」鈕。`is_admin_item` 的細項不給上傳鈕,改標「自動採計」。

該年度尚無 rubric 時顯示「{year} 年度評分項目尚未建立,請待學務處公告」。

載入中鋪 Skeleton;**查詢失敗一律當錯誤處理**(失敗說明 + 重試),不說「找不到此獎項」—— 獎項 id 來自後端自己的清單,真的不存在幾乎不可能。上傳/移除會 invalidate 這支查詢,那次重抓失敗時畫面照舊(手上已有資料),不把已上傳清單一起換掉。

檔案預覽支援 pdf / 圖片 / docx(docx 用 mammoth,伺服器檔先抓回 blob 再轉)。

## 規則

- 收 `pdf/doc/docx/jpg/jpeg/png/zip`,單檔 50MB,**後台調不到**
- 去重範圍是「同一 rubric item」:前端在本次 session 內以 SHA-256 先擋,後端以 partial unique index `uq_files_club_eval_subject_sha` 收口(用 `subject_id` 而非 `item_key`,避免跨年度誤擋)
- `eval_settings.unlocked=false` 時上傳與刪除都回 409;無設定列視為開放。**詳情逐次回 `upload_locked`**,鎖著時上傳鈕反灰附 Tooltip「學務處已關閉本獎項的資料上傳」、檔案 chip 的 × 收掉 —— 不然社團要選完 50MB 的檔才吃 409
- 刪除時會驗證 item 確實屬於路徑上的獎項,防止借道未鎖定的獎項刪除已凍結獎項的檔案

## 未完成 / 問題

- **上傳鎖設不了**:`eval_settings.unlocked` 全後端只有讀,沒有任何寫入端點或 UI,現況只能進 DB 手改。開關要哪一把權限鍵、逐獎項還是全鎖、鎖上後已上傳的檔案能不能刪,與 ISS-20(評分凍結)是同一個題目,併入評鑑鏈一起設計
- 每個細項沒有檔案筆數上限、也沒有加總容量上限,只有單檔 50MB;一個社團可無限上傳
- 前端只在本次 session 記 hash,重整後同一份檔可重按上傳,靠後端 409 才擋,錯誤訊息不夠明確
- 逐年 rubric 與獎項主檔沒有管理介面,117 學年度只能改 code(見 [admin/eval.md](../admin/eval.md))
