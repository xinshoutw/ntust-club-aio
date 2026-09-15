# 社團詳細

`/clubs/:id`(免登入) · `features/public/ClubDetailPage.tsx`

> **前端未實作**(GAP-16)。本檔記錄已定案的公開範圍與規則:
> 資料層(`clubs` 公開欄位、形象圖、`files.public`)與社團端填寫介面已完成,缺的是這一頁本身。

## 用途

單一社團的公開頁:介紹、聯絡方式、入社資訊、已核准的活動列表。這是社團對外可分享的那個網址。

## 資料來源

| 區塊 | 端點 |
|---|---|
| 社團資料 | `GET /public/clubs/{id}` |
| 活動列表 | `GET /public/clubs/{id}/activities` |
| 圖片 | `GET /public/files/{id}` |

## 畫面

- 英雄區:橫幅為背景(套 `banner_dim` 黑化與 `banner_blur` 模糊),其上為頭像、社團名稱、英文名稱、一句話介紹、性質 pill、招生狀態 pill、標籤
- 介紹卡:社團簡介全文、成立年份、社辦位置、例行活動時間
- 聯絡卡:社團網頁、社群連結(IG / Facebook / Discord / YouTube / Line / 其他)、對外聯絡信箱
- 入社卡:入社方式與社費說明、報名連結按鈕。三欄皆空時整張卡不出現
- 活動列表:表格,欄位為日期、活動名稱、地點、類型

## 規則

- 社團不存在、`is_active=false` 或 `public_visible=false` 一律 **404**,不是「已停社」頁 —— 對外沒有必要交代某個社團曾經存在
- 公開的活動是**通過審核以後的**:`approved`、`closing_pending_advisor`、`closed` 三個狀態。審核中、退回與草稿一律不回(舊系統的公開月曆沒過濾狀態,把審核中的草稿全放出去了,這是同一個坑)
- 活動**不回 `content`(活動內容)與任何金額**:公開頁回答的是「這個社團在辦什麼」,不是「這張單寫了什麼」。要對外宣傳細節的社團填在社團簡介或社群連結裡
- 活動列表依開始日新到舊,上限 200 筆;帶 `semester` 可指定學期,不帶即全部
- 對外聯絡信箱是 `public_email`,**不是 `contact_emails`** —— 那三組是公告通知的收件人,屬內部設定
- 指導老師(`advisor_*`)、幹部與社員名單、停權狀態、Discord webhook 一律不出現在任何公開端點
- 詳細頁的英雄區是單張大圖,`banner_blur` 在這裡才生效(字卡牆只吃黑化,見 [club-directory.md](club-directory.md))
