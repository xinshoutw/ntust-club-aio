# 外殼:側欄、頂欄、通知、蓋板公告、未存檔守衛

全角色 · `components/layout/`、`lib/nav.tsx`、`lib/permissions.ts`、`app/unsaved.tsx`

## 用途

四種角色共用同一個 `AppShell`,差別只在 `nav` 陣列與右上角色徽章(行政後台 / 工讀生 / 評審;社團端無徽章)。

## 頂欄

由左到右:漢堡鈕(手機開 Drawer)、logo + 「臺科大社團管理系統」(點擊回該角色首頁)、手機版顯示目前頁名、角色徽章、通知鈴鐺、帳號選單。

帳號選單:
- `club` — 設定(→ `/club-settings`)、登出
- `admin` 且 super — 稽核紀錄(→ `/admin/audit`)、設定(→ `/admin/settings`)、登出。**這兩頁沒有側欄入口,只能從這裡進**
- 其他 — 只有登出

## 通知鈴鐺

只有社團端有內容:取公告查詢的前 5 筆,`unread` 者右側紅點。開啟面板即呼叫 `POST /club/announcements/read` 把水位線前移(`clubs.announcements_read_at`),紅點熄滅。底部固定寫「沒有更多通知」——惟公告查詢失敗時改為失敗說明與重試,否則紅點不亮、面板又寫「沒有更多通知」,看起來就是真的沒有通知。

行政/工讀生/評審端鈴鐺一定是空的 —— 查詢帶 `enabled: user.role === 'club'`,這三端沒有任何通知來源。

## 側欄

`lib/nav.tsx` 依角色組陣列;群組標題不可點,項目為 icon + 文字。選中 = 淡紅底 + 紅字 + 左側短紅條。

動態行為:
- 社團端與行政端的「固定場地借用」在開放窗外反灰、移到最末「其他」組,Tooltip 顯示受理期間
- 行政端「申請審核」「結案審核」帶待審筆數徽章
- 行政端項目先經 `canAccessAdminPath()` 過濾,空群組整組隱藏

## 權限閘

`lib/permissions.ts` 的 `ROUTE_KEYS` 定義每條 admin 路由需要的權限鍵(any-of;`super` 全通;空陣列 = 僅 super)。`/admin` 總覽對所有管理員開放。無權限時 `AdminPermissionGate` **就地顯示說明**而非導走。後端各 router 另有 `require_permission` / `require_super`,前端過濾只是體驗層。

## 蓋板公告

只有社團端。條件:`takeover_until` 未過期、未勾「不再顯示」、本次登入未關閉。

資料走專用查詢 `GET /club/announcements?takeover=true`(後端只回未過期的蓋板),不從總覽那份「最新 20 筆」裡挑 —— 否則被後續公告擠出第一頁的蓋板會靜默失效。

- AntD Modal 承載,遮罩與 Esc 皆不可關閉
- 右上角圓形進度環倒數 5 秒,轉滿才變成可按的 X
- 勾「不再顯示」→ `POST /club/announcements/{id}/dismiss`,跨裝置永久;未勾 → 只寫 `sessionStorage`,下次登入再出現
- 多筆同時有效時只顯示第一筆,關掉才輪到下一筆

## 未存檔守衛

`app/unsaved.tsx`:頁面以 `useUnsavedGuard(isDirty)` 註冊;側欄/頂欄導航前彈確認,關閉分頁由 `beforeunload` 攔截。

AntD Form 的頁面改掛 `useFormUnsavedGuard()`:把回傳的 `onValuesChange` 接到 `<Form>` 上即可。Form 之外的輸入(時段選取、待上傳附件)以參數傳入 —— 那些才是離開後救不回來的東西。活動結案頁沒有 Form,改以載入時的欄位快照比對。

**只涵蓋 shell 導航與關閉分頁**。頁面內部用 `navigate()` 的跳轉(例如表單頁自己的「取消」鈕)不經過守衛 —— 宣告式 router 不支援 `useBlocker`。

## 未完成 / 問題

- 行政/工讀生/評審端的鈴鐺永遠是空的,卻仍佔頂欄位置
- 稽核紀錄與系統設定只有帳號選單入口,側欄找不到
- 側欄「固定場地借用」在窗外整頁鎖(行政端),是否維持待承辦確認
