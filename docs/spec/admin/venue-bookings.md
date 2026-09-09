# 所有場地借用

`/admin/venue-bookings` · `admin` · 權限鍵 `avenuelist` · `features/admin/AdminBookingListPage.tsx`(`kind="venue"`)+ `BookingReviewModal.tsx`

## 用途

全校臨時場地借用的查閱頁:一個學期、所有社團、所有狀態(待審核、已核准、已退回、已取消)攤在同一張表,回答「那張借用單後來怎麼了」。不是待辦入口 —— 審核在 [bookings.md](bookings.md)。與 [activities.md](activities.md) 同一種頁。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 學期下拉 | `GET /admin/venue-bookings/semesters`(有借用的學期,新到舊) |
| 主列表 | `GET /admin/venue-bookings?semester=&status=&club_id=&sort=&page=`(伺服器端分頁,每頁筆數依視窗高;`status` 與 `club_id` 可重複帶) |
| 社團選項 | `GET /admin/clubs/options` |
| 核准 / 退回 / 撤銷 | 與審核頁同一組 `POST /admin/venue-bookings/{id}/{approve,reject,revoke}`,**只有另持 `abooking` 才接得上** |

## 畫面

頁首:標題 + 件數 + 學期下拉(含**全部學期**,預設最新學期)。

表格六欄,依序:狀態、日期、社團、場地、時段與用途、送件時間。每頁筆數依視窗高(`lib/fitRows.useFitRows`,與所有活動頁同一份)。狀態與社團可多選篩選;除時段用途外皆可多鍵排序,預設 `-date`。社團漏斗是二級選單(`groupActiveClubs`,只列啟用中社團)。

**詳情彈窗**:與審核頁同一支 `BookingReviewModal`。多顯示送件時間;退回件顯示**退回原因、時間與經手人**(舊系統遷入的退回件多半沒留理由,顯示「系統未留下退回原因」);承辦撤銷的顯示撤銷原因,社團自行取消的沒有紀錄、不顯示。動作:持 `abooking` 的承辦在待審單上照樣核准/退回、已核准且未過期的可撤銷;只持 `avenuelist` 一律唯讀(footer 顯示「僅供查看」)。

## 規則

- **看得到與動得了是兩個判定**:`avenuelist` 只開 `GET`,三支 POST 仍限 `abooking`(`tests/test_admin_permissions.LIST_ONLY_WRITES`)。前端據 `canAccessAdminPath(user, '/admin/bookings')` 決定要不要把回呼接進彈窗;彈窗沒收到 `onApprove` 就不畫審核鈕 —— 畫了沒人接,按下去只會得到一句假的「已核准」
- 學期以**借用日**歸屬(`core/semesters.semester_range`),與活動頁以活動日期歸屬同一條規則;下拉**以數字排序**(`semester_sort_key` / 前端 `semesterRank`),字串比大小會把民國 99 年排到 100 年前面
- 遷入資料裡打錯年的借用(2004、0110、2030 這種)會在下拉多出 90-1、-1909-1 這種學期,點下去 422:那是資料不是程式,用 `scripts/fix_booking_dates.py` 修(`DEPLOY_CHECKLIST.md`)
- 「學務處」列(`club_id` NULL,行政手動借用)不在社團漏斗裡,只能在全部社團時看到
- 社團漏斗以名稱對 id:有選社團但主檔未載入或名稱失效時**強制空集**,不可 fail-open 回全部
- 分頁只在查詢成功後 clamp(理由同所有活動頁)
- 與「所有器材借用」共用同一個元件、兩條路由各帶 `key`:互切時整頁重掛,否則排序鍵(`date` / `start_date`)與學期會從上一頁帶過來

## 未完成 / 問題

- 社團漏斗只列啟用中社團(`groupActiveClubs`,`design-guide.md` §6,與所有活動頁同一份):停社的舊單只能在「全部社團」裡翻頁找,純歷史查閱頁上這個代價比活動頁大
- 沒有關鍵字搜尋(用途、場地名)與匯出 CSV
- 固定場地借用(`/admin/rooms`)不在本頁:那是學期制、每週節次的另一種單
