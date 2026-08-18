# 空間報修

`/maintenance` · `club` · `features/applications/MaintenancePage.tsx`

## 用途

回報社團空間損壞,附照片或影片佐證。

## 資料來源

| 動作 | 端點 |
|---|---|
| 上傳上限 | `GET /club/config` |
| 列表 | `GET /club/maintenance?status=`(正在申請=未完成全部;最近申請=已完成 `page_size=5`) |
| 送出 | `POST /club/maintenance` |
| 上傳佐證 / 補傳 | `POST /club/maintenance/{id}/evidence` |

## 畫面

表單:地點、損壞項目、佐證照片/影片(`AttachmentArea`,至多 5 檔)。下方兩張表:正在報修(狀態非 `done`,全部列出)、最近報修(`done` 近 5 筆)。兩表都會顯示行政填的「處理備註」。

正在報修表多一欄「佐證」:有檔案顯示份數,**0 份顯示紅色的「補傳佐證」**,點開彈窗補上(`AttachmentRetryModal`,與送出表單同一套驗證與上限)。

## 規則

- 上傳上限由 `/club/config` 供給,載入完成前整頁不開放操作,不放前端 fallback 常數
- 佐證每筆至多 5 檔、加總 100MB(`system_settings.maintenance_total_mb`);單檔上界依型別(圖 10MB / 影片 200MB)
- 副檔名決定套用影片或圖片政策,兩者都經魔術位元組驗證
- 送出流程:先 `POST` 主體,再逐檔上傳。佐證失敗時錯誤訊息明說「報修單已建立」,避免重送
- **佐證必附**在兩段式流程下由列表收口(decisions.md D-06):後端 `POST` 不可能檢查還沒上傳的檔案,所以列表逐列回 `attachment_count`,0 份的單直接把補傳入口攤在畫面上 —— 少了它社團只能再送一張新單,系統累積無佐證的重複單
- 已 `done` 的報修單不再收佐證(補傳是給第二步失敗的單用的)
- 狀態:`pending` → `in_progress` → `done`,無退回

