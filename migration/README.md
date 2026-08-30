# migration/ — 舊系統資料遷移

舊系統(legacy/ClubManagementSystem,Django)→ club-aio 的客製遷移 scripts。
idempotent:以 `legacy_id_map`(system=cms)記錄舊 id → 新 id,重跑跳過已遷移列,
切換前可反覆演練。

## 前置

現行 dump:`legacy/ClubManagementSystem/ntust_clubs_2026-08-29.dump`(CMS)、
`legacy/clubclass/cc_2026-08-29.sql`(clubclass)。

1. 舊系統 DB dump 還原到 club-aio 的 pg 容器內獨立庫(預設庫名 `legacy_clubs`):

   ```bash
   docker exec club-aio-db-1 psql -U club -d postgres -c "CREATE DATABASE legacy_clubs"
   docker exec -i club-aio-db-1 pg_restore -U club -d legacy_clubs --no-owner --no-privileges \
       < ../../legacy/ClubManagementSystem/ntust_clubs_2026-08-29.dump
   ```

   `CREATE SCHEMA public` 那一行必定報 `already exists` 並被忽略(pg 18 預建 public),
   `errors ignored on restore: 1` 是正常結果,不是還原失敗。

2. clubclass 的 MySQL dump 還原到本機拋棄式容器(起法見 `cc_import.py` docstring)。

3. 舊機 media 目錄整包抓到 `<workspace>/legacy/club_media`(照片遷移用,見 MIG-12):

   ```bash
   rsync -a --info=progress2 prod:ClubManagementSystem/club_media/ legacy/club_media/
   ```

4. 目標庫已 `uv run python scripts/reset_db.py --yes`(schema head + 基礎 seed + superadmin)。

## 執行

四支腳本有先後:社團/活動 → 借用 → 照片 → 文字。後三支都要靠 `legacy_id_map`
把舊 id 接回新 id,`cms_import` 沒跑完就全都接不上。

```bash
cd backend
uv run python ../migration/cms_import.py            # 1. 社團/成員/活動/公告
uv run python ../migration/cc_import.py             # 2. 場地與器材借用
uv run python ../migration/media_import.py          # 3. 活動照片(MIG-12)
uv run python ../migration/text_fields.py --export  # 4. 產生待人工轉錄的 CSV(MIG-13)
LEGACY_DB=legacy_clubs uv run python ../migration/cms_import.py  # 指定舊庫名
```

**換新 dump 時人工轉錄不必重來**:`out/fill/*.jsonl` 以 `legacy_id` 為鍵、與 dump 無關,
`fill_shards.py merge` 會拿最新一份母 CSV 重併一次,舊 dump 填過的列原封不動帶過來。
只有新增的那幾列要補:`doc_text.py --all` 抽新附件的文字(有快取,只抽新的),再比對
「新母 CSV 裡 `in_scope` 但沒出現在任何 `*.jsonl`」的 `legacy_id`,把那些列補成一支新的
`shard-NN.jsonl` 即可(2026-08-29 這輪是 12 列,收在 `shard-33.jsonl`)。

**換一份新 dump 重跑前先清乾淨**(decisions.md MIG-04):`--reset` 只刪自己
`legacy_id_map` 記過的列,新系統上線後自己產生的資料不受影響。**`--reset` 只清不匯**,
清除順序與匯入順序相反(借用單掛在活動與社團上,外鍵是 NO ACTION;照片對活動是
`subject_id` 弱關聯,沒有外鍵擋著,先清才不會留下指向已刪活動的孤兒列):

```bash
uv run python ../migration/media_import.py --reset  # 1. 先清照片(含盤上檔案)
uv run python ../migration/cc_import.py --reset     # 2. 再清借用
uv run python ../migration/cms_import.py --reset    # 3. 再清社團/活動/公告
# 之後照上面的 1→4 重跑
```

指導老師欄位不還原(非 id-map 型,重跑本來就會覆寫)。

### 名冊修正(`apply_roster_fixes`)

承辦名冊與舊庫 `Club_clubproperty` 不一致的社團,列在 `cms_import.py` 的
`NEW_CLUBS` / `REACTIVATE_CLUBS` / `DEACTIVATE_CLUBS`,由 `import_clubs` 之後那一步套用。
**這些修正一定要走這裡、不能只改 DB**:社團的 `is_active` 與 `attribute` 是從舊庫的
「停社」推出來的,換 dump 重匯就會被打回舊值。

冪等:三種修正都只在狀態還不對時動手,重跑不會二次生效(復社的密碼只在停用→啟用
那一次重設,不會洗掉已發給承辦的密碼)。停用的帳號會從一次性密碼 CSV 裡剔除;
復社的會補進去(`import_clubs` 只在 `not defunct` 時 append,停社社團的密碼從來沒印出來過)。

已在用的庫要單獨套修正,不要跑完整重匯(會覆寫指導老師欄位):

```bash
uv run python ../migration/cms_import.py --fixes-only   # 只跑名冊修正,不連舊庫
```

驗收:`users.role='club'` 且社團與帳號皆 active 的筆數 = 承辦名冊的有效列數(115-1 為 86)。

- 一次性密碼輸出到 `migration/out/one_time_passwords_*.csv`(**含明碼,不入版控**,
  `--fixes-only` 產出的另帶 `_fixes` 字尾,不覆蓋完整重匯那份;
  交承辦發放後銷毀);所有帳號 `must_change_password=True`
- **活動照片遷**(MIG-12,`media_import.py`);**企劃書與結案附件的檔案實體不遷**,
  裡面的文字走 `text_fields.py` 的人工轉錄 CSV(MIG-13)

## 範圍與對映(2026-07-21 需求方拍板)

> **遷移範圍限 114-1 / 114-2 / 115-1 三學期**(decisions.md MIG-08),只套在**活動**上:
> `cms_import.py` 的 `SCOPE_FIRST_SEMESTER` / `SCOPE_LAST_SEMESTER`,換學年只改這兩個常數。
> **社員名單與公告全遷**(MIG-08 / MIG-11 —— 公告的 `create_date` 是貼出來的時刻,不是有效期間)。
> 借用資料是否同受此限制未定,見 `docs/gaps.md` MIG-10。
>
> **範圍外的活動不遷,借用單就接不回去**:`cc_import.py` 的 `act_lookup` 只認範圍內的活動,
> 因此 89% 的場地借用(13,436 / 15,152)與 94% 的器材借用列(7,668 / 8,154)`activity_id` 落 NULL,
> 歷史借用列表的「活動」欄多數為空。欄位可空、查詢是 outerjoin,不會壞,但這是範圍決策的下游效果。

| 舊 | 新 | 說明 |
|---|---|---|
| Club_club + clubcontent + clubproperty | clubs + users(club) | 性質=停社 → is_active=false、attribute=NULL;kind 依名稱結尾推導,特例見 `KIND_OVERRIDES`;`SKIP_CLUBS` 不遷(行政單位 2 個 + 測試社 `testclub`/`Test`/`testtesttest`,後兩者沒標停社,不排掉就是可登入的正式帳號) |
| Club_student | club_members | Semester「104 1」→「104-1」;`Title` 是自由文字,`member_kind` 正規化後判正副負責人(「副社」「系會長」「第十三屆會長」「財務&副社長」都算;「社長組」「秘書」「榮譽社長」不算)——**這些寫法只用來認人,原文一律不留**(D-27:正副社長/會長不寫職稱,屆數與兼任跟著捨棄);幹部與社員的 `Title` 照樣寫入職稱;`Date`→created_at/updated_at(入社時間);**`Phone` 不讀**,新系統不記錄社員電話(2026-08-27 拍板);同(社團,學期,學號)取**身份較高**者、同高再取 id 大的。idempotent 同時看舊列 id 與自然鍵 —— 唯一鍵是自然鍵,只認舊 id 會在換新 dump 重跑時撞唯一鍵並回滾整個交易 |
| Club_teacher | clubs.advisor_* / advisor_out_* | 校內/校外各取最新一位。舊欄位標籤是「職位」,存的是職稱(教授/教官),新系統那格叫「系所 / 職稱」,原樣寫入不裁切。**`Phone` 不讀** —— 新系統不記錄指導老師電話(2026-08-27 拍板) |
| Club_activity(+fund/staff/meta) | activities(+budget_items/reports) | type:course/conference→社課或會議、extra→活動;status 對映見 `STATUS_MAP`;`Review`=申請表的「活動描述」→ `activities.content`(**不是**結案成果,超過 150 字截斷並列印舊 id);結案成果三欄舊制沒有,一律留空待 `text_fields.py` 轉錄 |
| Club_activityfund | activity_budget_items | 科目名經 `BUDGET_CATEGORY_MAP` 對到現行目錄(`指導老師/教練費`→`指導老師、教練費`;目錄沒有的 `演講費/裁判費`→`其他`,原科目名接進說明)。對不到目錄的科目會列印出來 —— 社團一按儲存就 422 |
| Club_news | announcements | 內容=原始連結(markdown) |
| Club_staff | users | position admin→admin(權限鍵之後由承辦配)、observer→viewer。`SKIP_STAFF` 不遷明確的測試登入名;`INACTIVE_STAFF`(`viewer`/`ntustclub`)遷入但 `is_active=False` —— 看不出是不是正式用途,而 observer 會拿到 `can_view_eval`,不擋就是上線第一天能對評鑑打分 |
| Club_auditactivityrecord | approval_records | 舊表只有「誰、何時簽的」,沒有決議欄(退回不入表)—— 每列都是核准,同一活動第 1/2/3 列即 advisor/chief/dean,對應申請表的 初核/複核/決行 |
| Club_auditactivity.Opinions | approval_records.reason(+ activities.fund_source) | 先去掉舊系統自動附的結報提醒(「※」開頭或首行為「活動結報提醒」;新系統由 `pdf._APPLY_NOTE` 自己產,照搬會印兩次)。這一格每一關都被覆寫,留下的是**最後一位**簽核者寫的,所以掛最後一列。只有申請期(`FUND_SOURCE_LEGACY_STATUS`)的殘留才是經費認定會寫進 `fund_source`;已完成件那格早被結案審核覆寫過,只留 `reason` |
| Club_activity.status=1(退回申請) | approval_records(`decision=reject`) | 舊系統退回**不寫**簽核列,理由只剩 Opinions 一格。不補這段的話 59 件退回活動一筆退件紀錄都沒有,社團看得到「已退回」卻讀不到理由。actor 用不能登入的 `_migration`(系統遷移)帳號,沒有理由的填「未提供更多說明」;對照鍵 `Club_activity:reject` 進 id-map,`--reset` 清得掉 |
| Club_activityimages | files(`slot=report_photo`) | `media_import.py`;盤上落 `reports/{原始上傳年}/{月}/{uuid}`,`club_id`/`uploaded_by` 跟著活動走 |
| Club_activity.PlanFile、Club_activityfiles | 只取文字,經 `text_fields.py` 的 CSV 人工轉錄 | 檔案實體不遷(MIG-13) |

**不遷**(dump 留檔備查):club token/session、密碼歷史、Django 內建表、
稽核 staffactivitylog、審核歷程 auditactivityrecord、行事曆、歷年評鑑期間、
社團評鑑檔案庫 clubfiles(MIG-08 定案不遷)、行政歷史文件 clubrecordfromstaff(待決,見 MIG-10)。

## 活動照片(media_import.py,2026-08-29)

前置:`cms_import` 已跑完,且 `legacy/club_media` 已備妥(可用 `CLUB_MEDIA` 指定別的路徑)。
來源只取 `Club_activityimages`(結案照片),範圍同三學期。以 2026-08-29 dump 實跑:

| 項目 | 數 |
|---|---|
| 範圍內照片 | 4,152 張 |
| 實際寫入 | **4,054 張、4,893 MB**(896 個活動) |
| 同社團 sha256 重複而跳過 | 98 張 |
| 盤上缺檔 / 活動未遷 / 副檔名不收 | 0 / 0 / 0 |

- **同社團內不得有兩張相同 sha256 的結案照片**(`uq_files_club_report_photo_sha`),
  這是線上上傳本來就有的規則(重複回 409);遷移在寫入前先比對,撞到就跳過
- 55 張超過 `IMAGE` 政策的 10MB 上限,**照樣寫入** —— 那是上傳閘的限制(後台可調),
  不是庫裡的不變式;擋掉等於平白丟掉舊資料
- **11 個已結案活動的照片加總超過 `close_photo_total_mb`**(D-15 之後預設 50MB,
  最大一個 88MB;上限還是 10MB 時是 167 個)。結案中的活動不能上傳,所以現在不影響任何人;
  但這些活動**一旦結案被退回**(狀態回 `approved`),社團就再也加不了照片,
  只能用既有的重送。要放寬就調 system_settings 的該鍵
- 同社團 sha256 重複的照片一律跳過(與線上上傳同一條規則),**其中有 10 個活動因此
  一張都沒進**(舊 id 14819、15218、15388、15414、15511、15984、16077、16080、16190、16276);
  腳本會單獨列出這些舊 activity id,並把完整跳過清單寫到
  `migration/out/photos_skipped_*.csv`
- MIME 以**實際內容**判定而非副檔名(`files.detect_mime`):這份 dump 有 6 張 `.PNG`
  其實是 JPEG,照副檔名存會讓下載時送出錯的 Content-Type
- `Club_activityfiles` 裡 90 個影像副檔名的檔案不遷(MIG-12:分不出簽到表與活動照)
- 檔名維持社團上傳時的原樣,見 `docs/gaps.md` GAP-20

## 簽核者與審核意見(cms_import.import_approvals,2026-08-29)

申請表要印 初核/複核/決行 三位的姓名,資料來源是舊系統的 `Club_auditactivityrecord`。
以 2026-08-29 dump 實跑:

| 項目 | 數 |
|---|---|
| 簽核列 | **2,256**(advisor 1,475 / chief 396 / dean 385) |
| 去樣板後仍有審核意見 | 66 筆 |
| 其中寫入 `fund_source` | 30 筆(非退回件且 ≤100 字) |
| 超過 100 字只留 `reason` | 1 筆 |
| 掛不上簽核列的退件理由 | 51 筆(沒人簽就退回,舊表沒有 actor);由 `import_rejections` 另行補回 |

- **關卡由列序決定,不是由狀態推導**:`AuditActivity.AllowCode` 就是這張表的列數
- **`Opinions` 不可原文寫進 `fund_source`**:那一欄在行政端是「經費來源」
  (`ApproveActivityIn` 限 100 字),範圍內 1,398 / 1,531 筆原文超過 100 字 ——
  承辦一開審核視窗按儲存就 422 而且自己改不掉。而且其中 1,335 筆的全部內容就是
  「※…結報提醒」那段樣板,新系統本來就會自己產一份
- **狀態停在哪一關由已簽列數決定**:`import_activities` 走 `PENDING_BY_SIGNED[已簽關數]`,
  不是只看 status。這份 dump 範圍內 status=0 的 20 筆全都一列簽核也沒有,
  所以 20 筆全落 `pending_advisor`、`pending_chief`/`pending_dean` 各 0 筆

## 企劃書與結案文字(text_fields.py,2026-08-29)

舊系統只有檔案沒有欄位,靠人工轉錄中轉(MIG-13):

```bash
uv run python ../migration/text_fields.py --export                      # 產生待填 CSV
uv run python ../migration/text_fields.py --import <填好的 CSV>          # 寫回
```

- 匯出 **1,208 列**(範圍內、已遷入、且至少有一個來源檔的活動;343 個沒有來源檔的略過)
- `legacy_id` 是對照鍵不可改;`填_` 開頭的欄位才會寫入,**留白=不動、有值=覆寫**
- `填_活動內容` 預帶舊系統的「活動描述」(`Club_activity.Review`,遷移時已寫進
  `Activity.content`);企劃書寫得更完整就以企劃書為準。**成果三欄舊制完全沒有**,
  只能從結案附件轉錄
- 心得以 `填_心得N_姓名 / _系級 / _內容` 三件一組,要多寫就往後加欄;
  同一活動只要有任一篇填了就**整批取代**該活動既有心得(重跑不會越加越多)
- 匯入可重跑;有問題的列逐列列出並跳過,其餘照常寫入

## clubclass(cc_import.py,2026-08-29)

前置:cms_import 已跑完(club=CMS Username、activity 走 legacy_id_map 對照)。
來源=本機拋棄式 MySQL(起法見 cc_import.py docstring)。

| 舊 | 新 | 說明 |
|---|---|---|
| Classroom(23) | venues 對照表 `VENUE_MAP` | 一舍 B2 在 2026-08-24 那份 dump **由舊系統自己拆成兩間**(22 白板側、23 樓梯側),對照改回一對一;新版已無的 4 處建 inactive 承接 |
| Device(25) | equipment(含 max_lease_count) | 名稱正規化 `DEVICE_RENAME`;停用 8 項建 inactive |
| Apply(15,255) | venue_bookings | status 0/1/4/2→pending/approved/rejected/cancelled;phone 保留、其餘申請人明細丟棄 |
| DeviceApply+DeviceLog | equipment_loans(一品項一筆) | 已核准且區間已過→returned;活動已刪或不在遷移範圍內→activity_id NULL |
| 認不出借用單位的單(空字串 / admin / 8 開頭偽帳號 / 未知) | club_id NULL(顯示「學務處」) | 舊系統的 `DeviceApply` 有 400 張母單 `club_id` 是空字串(展開成 960 筆 DeviceLog),**不丟掉**(decisions.md MIG-03);帳號認得出形狀的那一桶另以 `--unknown-clubs` 導出清單交承辦辨識(MIG-06);欄位空白與 admin 不列入(看不出是誰)|
| `Apply`/`DeviceApply` 的 `reject_info_zh-TW` | approval_records(REJECT) | 只補**真的留了理由**的單(場地 151、器材 236 張申請單→677 列);actor=不能登入的 `_migration`,退回時間取舊系統的 `updated_at`;英譯欄 `reject_info_en-us` 不遷 |
| ClassroomRule(2,948)、Admin、Notice | 不遷 | 場地封鎖=新 Rule Page 功能;未過期封鎖上線時人工重建 |

## 注意

- `import_teachers` 非 id-map 型:每次重跑**覆寫** clubs 的指導老師欄位。
  正式切換後若社團已在新系統改過指導老師,勿再重跑遷移。
- **`seed_mock.py` 會 `rmtree` 整個 UPLOAD_DIR**:開發庫已是正式資料 snapshot,
  手滑跑一次就要重跑 4.9 GB 的照片遷移。要灌 mock 請另開一個庫
- **換新 dump 時要重看主檔有沒有變**:2026-08-24 那份就多了一間教室(一舍 B2 拆成兩間);
  2026-08-29 這份的 `Classroom`(23)與 `Device`(25)與前一份逐字相同,兩個常數不必動。
  `VENUE_MAP` / `DEVICE_RENAME` 沒跟上的話,新的 id 會被當成「未知場地」整批跳過,
  而舊的一拆二規則會憑空生出 734 筆歷史借用 —— 兩種都不會報錯,只會靜靜地數字不對。
  對法:`SELECT id,name FROM Classroom` 與 `Device` 各掃一次,比對兩個常數的鍵

## TODO

- [ ] 行政歷史文件(clubrecordfromstaff,7 筆停社/成立/改名申請)如何處理(MIG-10)
