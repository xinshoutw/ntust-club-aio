# 空間報修

`/maintenance` · `club` · `features/applications/MaintenancePage.tsx`

## 用途

回報社團空間損壞,附照片或影片佐證。

## 資料來源

| 動作 | 端點 |
|---|---|
| 上傳上限 | `GET /club/config` |
| 列表 | `GET /club/maintenance`(前端逐頁抓齊) |
| 送出 | `POST /club/maintenance` |
| 上傳佐證 | `POST /club/maintenance/{id}/evidence` |

## 畫面

表單:地點、損壞項目、佐證照片/影片(`AttachmentArea`,至多 5 檔)。下方兩張表:正在報修(狀態非 `done`,全部列出)、最近報修(`done` 近 5 筆)。兩表都會顯示行政填的「處理備註」。

## 規則

- 上傳上限由 `/club/config` 供給,載入完成前整頁不開放操作,不放前端 fallback 常數
- 佐證每筆至多 5 檔、加總 100MB(`system_settings.maintenance_total_mb`);單檔上界依型別(圖 10MB / 影片 200MB)
- 副檔名決定套用影片或圖片政策,兩者都經魔術位元組驗證
- 送出流程:先 `POST` 主體,再逐檔上傳。佐證失敗時錯誤訊息明說「報修單已建立」,避免重送
- 狀態:`pending` → `in_progress` → `done`,無退回

## 未完成 / 問題

- 佐證是必填(前端擋),但後端 `POST /club/maintenance` 允許零附件。且這是兩段式流程:佐證上傳失敗時報修單已經建立,而列表沒有逐列補傳入口,社團只能再送一張新單 → 累積無佐證的重複單
- 列表靠 `fetchAllPages` 全量抓回前端再分「正在/最近」,分頁參數形同虛設
