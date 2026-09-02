# Session Handoff

> 交接快照:現在到哪、接下來做什麼。永久知識在三層 `AGENTS.md` 與 `docs/`,
> 需求方拍板的規則在 `docs/decisions.md`;本檔過期即刪。

## 現在在哪

開發庫用的是**正式資料 snapshot**,demo 與後續開發都以它為準。
`docs/issues.md` 剩 15 項,`docs/gaps.md` 剩評鑑鏈與幾項延伸。

接下來挑一整條線做(評鑑鏈最大),或先清上線檢查表的阻擋項。

## 接下來做什麼

### 一、評鑑彙總鏈(建議當單一開發段落)

GAP-01 → 02 → 03 → 04,連帶 ISS-04、ISS-20、ISS-12c/GAP-08b、GAP-07、GAP-19。
**不要拆散**:分組與評審指派沒有寫入 API(GAP-01),評審端三頁在正式環境永遠是
「尚未被指派評分」(ISS-04),後面的總表與結果頁都建立在它上面。

DEC-01:這學年評鑑在新系統跑,但學年末才用 —— 不擋上線。

### 二、上線檢查表的阻擋項(`DEPLOY_CHECKLIST.md`)

| 項目 | 現況 |
|---|---|
| 備份排程 | 腳本就緒(`scripts/backup_db.sh`),**cron 未掛** |
| 政府行事曆假日 | 腳本就緒(`scripts/import_holidays.py`),**上線年度未跑** |
| `.env` 正式值 | `MAIL_FROM_ADDRESS` 是個人信箱;Uptime Kuma 兩支 push URL 待填 |
| 借用的遷移範圍 | 活動已依 `SCOPE_FIRST/LAST_SEMESTER` 過濾,借用是否同受此限未定(MIG-10) |
| 行政帳號權限 | 遷移進來的 15 個 admin 權限鍵全空,只有 `super` 看得到東西;分工由承辦決定 |
| 工讀生帳號 | 舊系統沒有這個角色,遷移後 `role=staff` 是 0 筆,上線前要開 |

### 三、下一個 session 一件

**UI 標點全形化**(`design-guide.md` §7):現況待改 —— 句號 2、半形逗號 15、半形括號 23、半形冒號 22。

### 四、其餘單獨排程

| 項目 | 內容 |
|---|---|
| ISS-90 | 併發、權限矩陣、時區邊界測試(前端元件測試環境已建) |
| ISS-94 | 兩處清單無分頁(行政端社團總覽、報名名單;報名那支後端也沒有) |
| ISS-95 / ISS-96 | 徽章與評鑑卡導向的頁面看不到它們數的東西;要先讓 `/club/activities` 收「全部學期」 |
| ISS-67 / GAP-18 | 行政/工讀生/評審端的站內鈴鐺永遠是空的(Discord 事件已補齊) |
| GAP-03 | 全校評分進度總表 —— 行政端「我負責的評分」看的是自己被指派的分組,管理員沒被指派就是空的 |
| GAP-14 / GAP-16 / GAP-17 | 統計與匯出、社團導覽首頁、公開頁 |
| GAP-15 | 待審申請彙整頁(報修/借用/活動併看) |

不排期的方向見 [`improvements.md`](improvements.md)。

## 本批已完成(2026-08-27)

理由與細節在 `decisions.md`,這裡只記做了什麼。

| 決策 | 內容 |
|---|---|
| D-17～D-20 | 結案重點依活動類型改字;經費來源預填「學務處補助」;英文名稱改行政端維護;網頁連結與簡介必填;借用電話限 09 開頭 10 碼或 4 碼分機 |
| D-21～D-22 | 成員與指導老師都不記錄電話 —— 兩支 drop column(`d7b2c85f4a19`、`c9a4f1e72d38`),遷移端也不再讀 |
| D-23～D-25 | 終態顯示詞改「已完成」;結案鎖定預設 30 → 21 天;幹部證明與郵局帳戶異動可跳過「處理中」 |
| D-26 | 工讀生與評審頁面鏡射到行政端(`/admin/pt/*`、`/admin/viewer/*`),`astaff` / `aviewer` 一組一把鍵 |
| D-27 | 負責人與副負責人不寫職稱;舊系統的非標準寫法仍用來認人,原文捨棄 |

**社團評鑑入口反灰**(2026-08-31):社團端「資料總覽」與行政端「行政分審核」不可點,
hover 顯示「目前未開放」(`lib/nav.EVAL_UNBUILT`)。收的**只有側欄入口** —— 路由與頁面都還在,
直接輸入網址進得去;評審端三頁不收(那是評審帳號唯一的工作面)。GAP-01～04 做完就把那兩個常數拿掉。

**活動審核的「備註」**(2026-08-31,D-33/D-34):`activities.admin_note`,承辦人留給社團的話,
**任一關都寫得動**、空字串即清空。與經費來源一起印進申請表的「意見回饋」,
**原本固定接在後面的結報提醒一併移除**(系統自己會催結案,那句樣板還會蓋掉承辦想說的話)。
社團端的活動詳情**改用行政端那支審核彈窗**(`viewer="club"`),`ActivityPreviewModal` 已刪除 ——
章軌、大型認可、繳交確認與關卡說明都收掉,footer 換回繼續編輯/前往結案。

**借用情形色格圖三端共用**(2026-08-31):社團端借用總覽那張圖抽成 `features/bookings/BookingGrid.tsx`,
資料改走免登入的 `/public/*`(節次、場地、場況、器材佔用),社團端、行政端「臨時場地器材借用」
與**未登入首頁**讀同一份。呼叫端只決定點格去哪一頁:社團去申請頁、行政帶參數去手動借用
(`allowPast`,補登照樣點得動)、未登入不給入口即純預覽。
行政端原本那張專用場況圖的能力**疊回共用元件**:每格的 `pending`(該格全部待審單,含被
已核准或不開放蓋掉的)由 `availability_grids(with_pending=)` 一併回傳,**只給持 `abooking`
的承辦**(`api/v1/public._sees_pending`);有可審的格子就地開審核彈窗,多筆出選單。
原本的行政專用端點 `/admin/bookings/availability` 與 `admin_availability_grid` 已刪除。

**未登入的 `/`**(2026-08-31):借用情形的公開預覽,右上角登入鈕進 `/login`;
其餘社團路徑未登入仍轉 `/login`。GAP-16 的社團導覽頁還沒做。
匿名看得到借用社團名與不開放原因 —— 判定為可接受(等同貼在場地門口的資訊),要收就改後端。

**幹部證明可駁回**(2026-09-01,D-37):`/admin/certificates` 的狀態下拉多一個終態「已駁回」
(`ApplicationStatus.DECLINED`),審核中與處理中皆可直接駁回、不附原因,和「已完成」一樣不可再改。
社團端落在「最近申請」那張表;下拉選了駁回會先跳確認(只有這個選項問,損害不對稱)。
**郵局帳戶異動不跟進** —— 值域(CHECK)兩張表一起放寬,狀態機分兩份
(`_CERT_NEXT` / `_ALLOWED_NEXT`),郵局那頁連選項都不列。要跑遷移(`c4e8b17d2f60`)。
順帶把社團端郵局徽章的 `!= COMPLETED` 改成白名單(值域放寬後那寫法會多算)。

**學務長的視野只有第三關**(2026-09-01,D-38):持 `approve_dean` 的帳號在 `/admin/review`
待審佇列只有 `pending_dean`、最近審核只有**簽過第三關**的單(`approval_records` 有 dean 那一列,
核准與退回皆算),側欄徽章數同一個集合。判定不是狀態 —— 核定 0 元當場核准(D-16)的單同樣是
`approved` 卻沒到過他手上。收的是整個行政端活動讀取面(清單、學期下拉、詳情、申請表 PDF 共用
`activity_service.scope_sql`),`super` 與頁面鍵都壓不過這條。

**器材歸還時限與放假日進系統設定頁**(2026-09-02):`equipment_return_time`(HH:MM)與 `holidays`
表都能在 `/admin/settings` 改了 —— 原本前者只能直接動 DB、後者只能進主機跑
`scripts/import_holidays.py`。整年份仍走腳本(一次 20 幾筆),卡片是補漏與臨時放假(颱風假)用;
週六日不收(兩端都擋),刪除要先確認。稽核多 `holiday_created`/`updated`/`deleted` 三個動作。
**留著沒動的一項**:8 個讀取端全匯流到 `booking_service.overdue_deadline_in` 的
`int(x) for x in return_time.split(":")` —— DB 裡若有壞值(手改、`"10:30:00"`)就是全站 500
(側欄徽章、三張點交清單、逾期追蹤、cron 催還一起掛)。寫入端有 pattern 擋,讀取端沒有
`settings_service.get_budget_categories` 那樣的防禦。

**要跑遷移**:D-21/D-22 是 drop column,`alembic upgrade head` 之後舊號碼就沒了。
D-27 的殘留職稱不會被重跑遷移修好(`cms_import` 不更新既有列)—— 走 `--reset` 重灌,
或把該學期匯出再匯入一次。

## 驗證現況

- 後端 `CLUB_AIO_TEST_DB=<name> timeout 900 uv run pytest -q` → **557 passed**;`ruff check .` 全綠
- 前端 `pnpm exec tsc -b --force` 0 錯、`pnpm test` → **238 passed**(52 檔)、
  `pnpm run lint` 8 個既有的 fast-refresh warning
- 新測試逐一做過 mutation 驗證(改回舊寫法會紅);借用色格圖那支另在 `TZ=UTC` 與 `TZ=Pacific/Honolulu` 下各跑過一次

## 開發庫(正式資料 snapshot,2026-08-29 dump)

`legacy_clubs`(pg 容器內)、`legacy/clubclass/cc_2026-08-29.sql`、
`legacy/club_media/`(17 GB)都在本機。**`club_aio` 就是這份 snapshot 本身**
(2026-08-29 整庫重建,舊 demo 資料已全數清掉,以遷移結果為準),數字可以直接對。重建:

```bash
cd backend
uv run python scripts/reset_db.py --yes
rm -rf data/uploads/*                             # reset_db 不動盤上檔案,不清就是孤兒
uv run python ../migration/cms_import.py          # 157 社、30,575 成員、1,551 活動、2,256 簽核、8 公告
docker run -d --name cc-legacy -p 127.0.0.1:3307:3306 \
    -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cc mysql:8.0
docker exec -i cc-legacy mysql --default-character-set=utf8mb4 -uroot -proot cc \
    < ../../legacy/clubclass/cc_2026-08-29.sql
uv run python ../migration/cc_import.py           # 15,152 場地借用、8,154 器材借用、25 器材
uv run python ../migration/media_import.py        # 4,054 張結案照片、4,893 MB
uv run python ../migration/text_fields.py --import ../migration/out/activity_texts_2026-08-29_filled.csv
uv run python scripts/set_passwords.py --all --password 'Demo@12345' --no-change-required --yes
```

端到端實跑(這個庫的實際值):`activities.content` 有值 1,530 / 1,551、`activity_reports` 973、
`activity_reflections` 2,323 篇、`files` 4,054、`approval_records` 2,992
(簽核 2,256 + 活動退件 59 + 借用退件 677)、`club_members` 30,575。

- 照片佔 `backend/data/uploads/` 4.9 GB;`media_import.py --reset` 連盤上檔案一起清,
  **必須跑在 `cms_import.py --reset` 之前**(cms 那支會刪光 system=cms 的 id-map,
  先跑它照片就成了清不掉的孤兒;已加防呆擋下)。整庫重建走 `reset_db` 時 id-map 一起沒了,
  所以要自己 `rm -rf data/uploads/*`
- **別在這個庫跑 `seed_mock.py`** —— 它會 `rmtree` 整個 UPLOAD_DIR
- 查舊 MySQL 一律加 `--default-character-set=utf8mb4`,否則中文顯示成 `????`(資料是好的)
- 帳號密碼分兩批:**93 個啟用帳號**(7 管理員 + 86 社團)已用
  `set_passwords.py --all --random --yes` 換發成一帳號一組的隨機密碼、首登強制改密,
  明碼在 `migration/out/passwords_*.csv`(不入版控,發放後銷毀);
  其餘 76 個停用帳號(停社 73、`_migration`、停用評審 2)還是舊的 `Demo@12345`。
  要整庫回到方便登入的狀態就重跑 `--all --password 'Demo@12345' --no-change-required --yes`
  (`--password` 不跳過停用帳號)。`_migration` 是 `is_active=false`,密碼設了也登不進去

## MIG-13 人工轉錄(2026-08-29 完成)

`migration/out/activity_texts_2026-08-29_filled.csv`,**936/936 列全填**
(另 272 列不派工:活動未結案,成果與心得在 import 端本來就跳過,活動內容已由 `cms_import` 預帶)。
匯入實跑:活動內容 1,194 筆、成果 859 筆、心得 2,323 篇;4 列因活動未結案跳過,屬預期。

```bash
python3 migration/doc_text.py --all                      # 附件 → 純文字(2,713 檔,有快取)
python3 migration/fill_shards.py split --budget 200000   # 依文字量切工作包
python3 migration/fill_shards.py merge                   # *.jsonl → *_filled.csv + 問題報告
```

轉錄規則在 `migration/out/fill/INSTRUCTIONS.md`。merge 是**欄位級疊加**,補某一欄只需另寫
`shard-NN-fix.jsonl`(一行放 `legacy_id` + 那幾欄)。

**換 dump 是增量的,不重跑 split**:`*.jsonl` 以 `legacy_id` 為鍵、與 dump 無關,merge
會拿最新母 CSV 重併,舊 dump 的 924 列原封不動。8/24→8/29 新增的 12 列另收在
`shard-33.jsonl`(桌遊社 7 列、絃韻吉他社、弓道社、機器人研究社、美術社、全校不分系各 1 列)。
其中 `16295`(弓道社幹部交接)來源只有會議紀錄,依 INSTRUCTIONS 只輸出 `_note`、成果與心得全空;
`16378`(新生茶會)的簽到表掃描件與簡報同樣不轉錄,但回饋表單的統計有填進 `填_成果_目標達成`。

**已知未處理** —— 匿名回饋可能漏抄:「無署名的參與者回饋 → `填_成果_目標達成`」這條規則是
第一波 agent 派出**之後**才補進 INSTRUCTIONS.md 的,`shard-01`~`shard-11` 與 `shard-32`
遇到「像心得但沒署名」的段落會整組丟掉(實例 `14856`、`15020`)。待複查 = 那些 shard 裡
沒輸出心得的 **86 列**。2026-08-24 決定不做:漏的是補充性質的回饋,成果三欄與具名心得沒受影響。
(`shard-33` 已照新規則做:`15698` 的無署名助教心得進 `填_成果_目標達成`。)

另有「其他執行狀況與成果:無」的列,有的照抄「無」、有的留空 —— 兩種讀法都成立,不統一。

抽查兩批各 15 列對回原始檔:batch A 全乾淨,batch B 13 乾淨、2 列踩到上述問題。
沒有捏造、沒有姓名系級對調、沒有檢討內容漏進成果三欄。

## 其他待處理

- **D-14 讓遷移件的 ad2 / ad4 往上跳**:評鑑視窗內已結案的遷移活動,照片與心得確認多數是 true
  (來自舊系統旗標)。照片已補遷(MIG-12),心得列仍是 0。學年末跑評鑑前,承辦要知道 ad4
  這批分數來自舊系統旗標,不是庫裡真的有心得
- **`MAIL_FROM_ADDRESS` 是開發者個人信箱**;正式環境要換,且**必須與 `SMTP_USERNAME` 同網域**,
  否則校方 relay 拒收
- **結案退回的自動解鎖是永久的**:`close_unlocked` 沒有地方設回 false,被退回過一次就從此不受期限
  約束(仍在逾期清單裡)。這是 D-05 的字面意思,但等於期限有一條誰都能走的路
- 開機的 `/auth/me` 沒有 timeout:後端連上但不回應時會白畫面到 nginx `proxy_read_timeout`
  (預設 60 秒)。要收得先決定 timeout 值與失敗文案
- **舊系統的長審核意見現在有地方放了**:`cms_import` 把 `Opinions` 的殘留寫進 `fund_source`,超過
  100 字的直接丟掉(`too_long`)。`admin_note` 是 text 且上限 1000,要撈回那批就改寫入端
- `c7e...` migration 的 downgrade 會刪除跨學期重複成員資料,部署前需決定是否接受
- 內層 nginx 信任所有 RFC1918 網段,依賴 GCP firewall;正式部署可收窄至實際來源

## 本機環境(此台 Mac)

- db 預設走 5432;OrbStack VM 佔用該埠時改 55432(`.env` `POSTGRES_PORT` + `compose.override.yml`,
  兩者皆不入版控)。pnpm 走 corepack
- 測試庫可平行:`CLUB_AIO_TEST_DB=<name>` 覆寫(多 worktree 各用一庫)
- 未進版控且刻意不入的檔案:`.env`、`start-dev.sh`、`migration/out/`
