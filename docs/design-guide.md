# club-aio 設計規範

視覺與互動的單一依據。實作為 React + Ant Design 6,設計須落地為 AntD 主題與元件組合,但不得長得像未調校的 AntD 預設模板。

## 1. 使用者與裝置

| 角色 | 場景 | 裝置 |
|------|------|------|
| 社團幹部 | 填申請、傳資料、查進度 | **手機為主**,桌機為輔 |
| 行政承辦 | 整天掛在審核與管理頁 | 桌機大螢幕 |
| 評審老師 | 集中一段時間評分 | 桌機/平板 |
| 工讀生 | 現場點交器材、拍照記違規 | **手機** |

## 2. 設計立場

**「數位公文」美學**:把朱紅印泥與關防章提煉成現代行政工具的視覺語言。整體安靜、精確、可信,唯一的華彩留給「簽核」本身。

## 3. 設計代幣

### 3.1 色彩

| 名稱 | Hex | 用途 |
|------|-----|------|
| 印泥紅 seal | `#9E1B32` | 主色:主要行動按鈕、側欄選中態、簽核章。**每屏至多一個紅色主行動**;側欄選中條、章軌等結構用色不計入。它是用印的儀式色**而非狀態色** |
| 墨 ink | `#1F2430` | 標題與正文 |
| 鋼灰 steel | `#5B6472` | 次要文字、標籤 |
| 界線 line | `#E4E7EC` | 分隔線、表格框 |
| 紙 paper | `#F5F6F8` | 版面底色(**冷灰白**,禁用米黃/奶油色) |
| 卡面 surface | `#FFFFFF` | 卡片、表格底 |

語意色獨立於主色:成功 `#2E7D57`、警示 `#9A6100`、錯誤 `#C13B34`、資訊 `#2F6FBF`。挑選標準是「作為文字時在紙色上仍達 AA(≥4.5:1)」。

### 3.2 狀態 pill

所有單據狀態用同一套 pill(淡底深字,AA 對比)。權威定義在 `lib/status.ts` 的 `STATUS`,新狀態一律加在那裡:

| 狀態 | 前景 | 底色 |
|------|------|------|
| 草稿 / 已取消 | `#5B6472` | `#EEF0F3` |
| 待審核 / 待結案 | `#8A5A00` | `#FFF3D6` |
| 處理中 / 已解鎖 / 已報名 | `#1D5A9E` | `#E8F0FB` |
| 已核准 / 請洽學務處 / 開放中 | `#1F6B45` | `#E3F2E9`(加淡綠描邊) |
| 已結案 | 白 | `#2E7D57`(實心終態) |
| 已退回 | `#B03A2E` | `#FBE9E7` |
| 已逾期 | `#A3341F` | `#F9E4DE` |
| 停權 / 已截止 | `#3A3F4A` | `#E8EAEE` |

**三關審核在社團端一律顯示「待審核」**,不揭露目前卡在哪一關 —— 關卡進度由章軌表達。已逾期**必帶鎖 icon**:前景與「已退回」接近,靠 icon 與底色區分。

### 3.3 字體

**單一字族 Noto Sans TC**(fallback PingFang TC → system-ui),自架、中文子集化(CSP `self`)。

**禁用 monospace 字體**(需求方指定)。會被人工核對的值(學號、金額、日期時間)用 `.num`:同字族 + `font-variant-numeric: tabular-nums`,靠等寬數字對齊,不換字族。

字級階:28 / 24(頁標)、18(區塊標)、16(卡標)、14(正文)、13(密表格/輔助)、12(標籤)、11(側欄群組標題)。

### 3.4 形狀與空間

- 圓角 **6px** 統一;狀態 pill 全圓角,是全系統唯一的全圓角元素
- pill 規格:高 22px、水平內距 10px、字 12px/500、icon 12px 置左間距 4px
- 8pt 間距制;卡片內距 24px;區塊間 32px
- 陰影極輕(`0 1px 2px rgba(31,36,48,.06)`),層級靠界線與底色而非浮起
- 表格不用斑馬紋,用 1px 界線 + hover 淡紅底 `#FBF3F4`
- 表格密度:一般列高 48px(padding 12×16、字 14px);行政審核密表列高 36px(padding 8×12、字 13px)

### 3.5 AntD token

```ts
theme: {
  token: {
    colorPrimary: '#9E1B32', colorSuccess: '#2E7D57', colorWarning: '#9A6100',
    colorError: '#C13B34', colorInfo: '#2F6FBF',
    colorTextBase: '#1F2430', colorBgLayout: '#F5F6F8',
    colorBorder: '#E4E7EC', colorBorderSecondary: '#E4E7EC',
    borderRadius: 6, fontSize: 14, controlHeight: 40, motionUnit: 0.06,
    fontFamily: "'Noto Sans TC', 'PingFang TC', system-ui, sans-serif",
  },
  components: { Button: { controlHeight: 40, fontWeight: 500 } },
}
```

`controlHeight: 40` 偏離 AntD 預設且是 `PageHeader` 標題列等高的依據,改動會牽動全站。

## 4. 版面

### 4.1 外殼

- 側欄 240px **白底**(拒絕深色側欄的預設 admin 感):選中項 = 左緣 3px 印泥紅條 + `#FBF3F4` 淡紅底 + 墨字轉紅字;群組標籤 11px 鋼灰
- topbar 56px 白底、sticky 帶陰影;左側 `logo.svg`(臺科大識別標誌,`#005BAC`)+ 文字 wordmark;右側鈴鐺與帳號選單。**無學年度下拉**
- 帳號處社團端顯示社團名稱;帳號選單含「設定」捷徑與登出,admin 另有稽核軌跡
- 圖示一律 `@ant-design/icons`(SVG),**全系統禁止 emoji**
- 側欄項目與徽章查詢依 `permissions` 過濾,受限管理員看不到無權限的項目;開放窗外的固定借用反灰並移到最末組

### 4.2 內容寬度

**全站內容寬由 shell 統一約束(1200px,`shell.css .shell-main > *`),頁面不得自設 maxWidth。**

雙欄版面的既有配置:活動申請表單 50/50、總覽 `1fr 380px`、報名建構器 `1fr 420px`。

### 4.3 響應式

<992px 側欄收為 Drawer;<1200px 雙欄版面堆疊為單欄;<768px 表格轉卡片列、表單全寬單欄。手機優先頁:社團端全部、工讀生點交與違規。

## 5. 簽核章軌(StampTrail)

用於活動申請審核彈窗(`ActivityReviewModal`),把「承辦人 → 組長 → 學務長」畫成關防章軌:

```
  ●━━━━━━━━◐┈┈┈┈┈┈┈○          ● 已核:實心印泥紅圓章,章內單字(承/組/長),下方核准日+姓名
 [承]     [組]     [長]        ◐ 當前:實線描邊,微弱脈動
                               ○ 未到:灰虛線描邊
  退回:紅描邊紅字章
```

- 章 32px 圓;連線 2px(完成段實線墨色,未完成虛線)
- **無經費活動 = 承辦人單關,不畫章軌**(單章無資訊量)
- 社團端狀態 pill 一律「待審核」,章軌是唯一揭露關卡進度的地方

## 6. 元件與互動慣例

以下為全站強制慣例,新頁面照做,不要自刻替代品。既有頁面仍有未收斂處(`<Spin>`、原生 `<Upload>`),清單在 `HANDOFF.md` 的 debt 段。

**表格**

- 資料表一律 `tb fixed` + `<Cols>` 固定欄寬;`th` 一律 `scope="col"`(全站無列首 `th`)
- 整列可點時 `onClick` 掛在 `<tr>` 上只服務滑鼠,鍵盤入口是主要欄位裡的 `.row-open-btn`(記得 `stopPropagation`);卡片等非表格區塊用 `lib/clickable` 的 `clickableProps`
- 排序一律 `useMultiSort` + `MultiSortButton`(伺服器端以 `sortParam` 帶查詢):至多 3 鍵、無移除態,指示器呈現實際生效的排序鏈。點主鍵=升降互換,點已啟用的次鍵=升為主鍵並保留方向,點新欄=插為主鍵。**僅 sort icon 變色**,不整欄變色
- 篩選用 `FilterButton`,收進表頭,不做一排篩選器牆
- 分頁一律 `Pager`(AntD Pagination `simple`):置中、只有一頁也顯示;禁用數字頁碼鈕
- 行動作放行尾(文字或邊框鈕,主動作紅字)
- **前端不顯示任何單號(ID)**,僅稽核軌跡例外
- 預設排序五準則:佇列公平(送件早在前)/急迫優先(期限近、逾越久在前)/時間就近(新在前)/名冊慣例(身份權重、主檔手動序)/需求方指定

**彈窗**

- 確認彈窗一律 `lib/confirm.ts` 的 `confirmDialog`。AntD `Modal.confirm` 預設 `maskClosable:false`,與全站「點遮罩=取消」慣例相反
- Modal 一律 `open` + `afterClose` 常駐;`{selected && <Modal open>}` 會吃掉退場動畫,是反模式
- 確認型彈窗開啟即聚焦確認鈕、必填輸入型聚焦輸入框(有必填欄就聚焦欄位,不聚焦確認鈕 —— 否則 Enter 只是送出空值換來錯誤)。**輸入欄用原生 `autoFocus`**;**聚焦確認鈕用 `useModalAutoFocus`**(`preventScroll`:原生 `autoFocus` 會把 footer 捲進視野,彈窗高過視窗時標題就被捲走)。AntD 內建 footer 沒有 ref 可掛,只能 `okButtonProps.autoFocus`,僅限內容必定短的彈窗
- 點擊即開、內容以 Skeleton 補齊
- 審核用 popup Modal,不用 Drawer

**表單**

- 區塊化(基本資料/經費明細/附件),區塊標 16px;必填星號,行內驗證
- 送出驗證:errors Set + AntD `status="error"` + 區塊紅框 `.area-error`(常駐透明邊框防位移);修改該欄即解除,並捲動到第一個錯誤
- 被修改但未儲存的欄位以橘黃外框 `.field-dirty` 標示;dirty 時離開頁面須確認
- 動態列(經費明細、工作分配、借用時段)自動增列,尾端保證一列空白;空列於 blur 時移除,打字中不消失
- 上傳一律 `lib/uploads.ts` + `components/ui/AttachmentArea`:魔術位元組驗證、SHA-256 內容去重、單檔與加總容量驗證、顯示「已使用 X/Y MB」。允許圖片處含 HEIC/HEIF/AVIF(評鑑上傳例外,後端只收 jpg/png)
- 上限值讀 `GET /club/config`,前端不放容量常數(郵局與獎項上傳頁仍各自硬編碼 50MB,待收斂)
- 送出動作一律要擋 in-flight,三種寫法各有各的漏法:`htmlType="submit"` 的鈕 `loading` 與 `disabled` 成對(AntD 的 `loading` 只擋 React onClick、不設 DOM `disabled`);**表單一定要有一顆 submit 鈕**,別用 Modal `onOk` + `form.submit()` 代替 —— 沒有 submit 鈕時 Enter 會直接送 form,`confirmLoading` 攔不到;`onPressEnter` 直接接 mutation 的地方自己擋 `isPending`

**其他**

- 可點卡片/列 hover 一律變色(`.click-tint`)
- 空狀態:一句話 + 主動作按鈕,不放插圖
- 載入用 Skeleton,不用整頁 spinner
- 錯誤說發生什麼 + 怎麼辦
- 危險動作(退回、刪除、停權)要填原因

## 7. 文案

繁體中文;按鈕動詞開頭且前後一致(「送出申請」→ toast「已送出」);狀態是名詞;不用驚嘆號、不用表情、不道歉。**說明文字能省則省,版面上不堆說明段落**,欄位說明放 placeholder 或 Tooltip。

**定案詞彙**:功能名與標題一律「場地」,不用「教室」——惟 `VenueCategory.CLASSROOM` 的分類顯示值仍是「教室」。集合名詞一律「時段」,單一項目仍稱「第 1 節」「A 節」(臺科大作息表的名字)。

## 8. 動效與無障礙

- 動效只有章軌當前節點脈動,加上 AntD 自身的過場(`motionUnit: 0.06`);`prefers-reduced-motion` 全關
- 對比 WCAG AA;focus ring 2px `#2F6FBF`;表格可鍵盤導航;所有 icon 按鈕帶 aria-label;可點列須有鍵盤入口

## 9. 禁止

- emoji
- 米黃/奶油底 + 陶土色 + 襯線標題的「AI 預設文青套裝」;近黑底 + 螢光單色的「AI 預設暗黑風」;整頁 hairline 報紙風
- 深色側欄、漸層英雄區、裝飾性插圖、大數字儀表板拼貼
- 版面上的長段說明文字
- 深色模式(先做好唯一的亮色)
- 隨手打的符號當圖示(`<`、`>>>` 之類一律用對應 icon)
- monospace 字體(等寬數字用 `.num` 的 `tabular-nums`)
