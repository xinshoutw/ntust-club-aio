# 社團導覽

`/clubs`(免登入) · `features/public/ClubDirectoryPage.tsx`

> **前端未實作**(GAP-16)。資料層、社團端填寫介面與**下列端點都已完成**,
> 缺的只有這一頁本身。

## 用途

免登入就看得到全校社團:字卡牆 + 篩選,點進去是 [club-detail.md](club-detail.md)。

取代舊系統的 `/Introduction/`(純文字三欄表格)。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 社團字卡 | `GET /public/clubs` |
| 頭像與橫幅圖 | `GET /public/files/{id}`(免登入的獨立檔案通道,見下方規則) |

`ClubCardOut` **只帶畫得出一張卡所需的欄位**:簡介、聯絡方式、入社資訊都不在裡面 ——
六十幾張卡一次回傳,詳細頁才要的長文不該跟著走一遍。`banner_blur` 同樣不在(字卡不套模糊)。

`/public/clubs` **全量回傳**(在校社團約 60 個,導覽頁本質是主檔),不分頁。查詢字串 `q` / `attribute` / `tag` 一律在前端過濾 —— 全量都在手上了,再打一次伺服器只是多一次往返。

## 畫面

外殼與 [public-home.md](public-home.md) 同一套:topbar 有系統名與右上角「登入」鈕,沒有側欄、鈴鐺與帳號選單。

- 頁首一行:標題「社團導覽」+ 社團數
- 篩選列:搜尋框(社團名稱、英文名稱、一句話介紹)、性質(6 類)、標籤(取現有標籤的**出現次數前 12 名**)、招生狀態
- 字卡牆:`grid` 自適應,最小卡寬 260px

**字卡**內容由上而下:橫幅背景(套黑化)、頭像、社團名稱、英文名稱、一句話介紹、性質 pill、招生狀態 pill、標籤。整張卡可點,鍵盤入口走 `lib/clickable` 的 `clickableProps`。

## 規則

- 只列 `is_active` 且 `public_visible` 的社團;停社與行政端下架的社團**一筆都不回**(不是灰掉,是不存在)
- `GET /public/clubs` 帶 `Cache-Control: public, max-age=300`(全域預設是 `no-store`):
  一份幾乎不變的主檔,沒有理由每次進站、每次上一頁都重查
- 預設排序:有橫幅圖的在前,其次社團名稱。名稱排序走的是 DB 的 collation
  (正式庫 `en_US.utf8`,對中文等於碼位序)——要筆畫或注音順序,前端手上就是全量,
  用 `Intl.Collator('zh-Hant')` 重排即可,但**要保住「有橫幅在前」那一段**。**沒有任何一張圖的頁面不會有人看第二次** —— 先讓有備料的社團撐起版面,其餘按名稱
- 字卡**只吃 `banner_dim`(黑化),不吃 `banner_blur`**:模糊只在詳細頁與設定頁預覽用。60 張卡同時跑 CSS `filter: blur()` 在手機上會掉幀,而黑化是一層 `rgba` overlay,零成本
- 沒傳橫幅的社團以 `attribute` 決定預設底色(6 類各一;`attribute` 為 NULL 時走中性灰),不留白卡
- 字色由 `banner_text_mode` 決定:`light` / `dark` 直接用,`auto` 依 `banner_luma`(上傳時算好的橫幅下三分之一平均亮度)推導 —— 亮度 > 128 用深色字。**推導值不入庫**,前端算
- 圖片一律帶明確 `width`/`height`(等比容器 `aspect-ratio`),避免字卡牆載入時整片位移
- 搜尋與篩選不進網址:這頁沒有可分享的中間狀態,能分享的是單一社團(詳細頁有自己的路由)
- 公開檔案走 `GET /public/files/{id}` 而不是在 `can_access` 開一個匿名分支:
  那會變成第五種角色判定混進同一個 match,遲早被下一個新增的 case 漏掉。
  只放行 `files.public`,而且**引用它的社團現在要是公開的**(EXISTS 當場問,不是在社團
  下架時反手關掉 `files.public` —— 那會變成同一份判定的第二份)。形象圖是一個社團最對外的
  一份資料,而下架的理由常常就是那張圖。不公開、已歸檔、社團已下架與不存在**同樣回 404**,
  不讓人靠狀態碼探測 id;`media_type` 另有白名單(只送影像),`inline` 的同源 HTML 即使被
  CSP 擋掉 script,`form-action` 在 CSP3 不 fallback 到 `default-src`,純表單釣魚頁仍成立。
  回應帶 `Cache-Control: public, max-age=3600` 蓋掉全域的 `no-store`。**刻意不用
  `immutable`、也不放到一週**:內容確實不可變(換圖產生的是新的 id),但**授權會變** ——
  已發出的副本是這支端點唯一撤不回來的東西
- 圖片在 nginx 走自己的限流桶(`zone=public_files`,600r/m burst 200):一張字卡兩張圖、
  六十幾個社團,首次進站是一秒內一百多個請求,與其餘公開端點共用 `zone=public`(60r/m)
  會有九成 429、整片破圖
- 匿名可及的整數路徑參數一律限在 int4 範圍內:超界會在 asyncpg 綁參數時 `OverflowError`,
  變成 500 加一份完整 traceback —— 未登入、零成本的 log flood
- 這一頁**不受**台灣 IP 白名單限制(edge 的白名單清單須把 `/clubs`、`/clubs/*` 與 `/api/v1/public/clubs*`、`/api/v1/public/files/*` 排除)。導覽頁一半的價值是給校外看的 —— 新生、家長、交換生、想找社團合作的校外單位

## 未完成 / 問題

- **借用色格圖仍會把下架社團的名字送給匿名**:`/public/bookings/availability{,-range}`
  的 `club` 欄沒有 `public_visible` 過濾,所以一個已下架的社團只要有一張核准的借用單,
  名字照樣出得去。那支端點的「匿名看得到借用單位名稱」是需求方拍板的規則
  ([public-home.md](public-home.md):校內張貼在場地門口的同一件事),與本頁「對外沒有必要
  交代某個社團曾經存在」相衝。**要先定哪一邊才動手** —— `_VISIBLE` 目前不是全站唯一判定
- 活動列表的 200 筆上限沒有「還有更多」的訊號,截掉的是最舊的
- 社團相簿(多張照片)未做:目前公開圖片只有頭像與橫幅各一張
- 全校活動總覽與 `.ics` 訂閱未做(單一社團的活動列表已在詳細頁)
