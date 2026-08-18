# migration/ — 舊系統資料遷移

舊系統(legacy/ClubManagementSystem,Django)→ club-aio 的客製遷移 scripts。
idempotent:以 `legacy_id_map`(system=cms)記錄舊 id → 新 id,重跑跳過已遷移列,
切換前可反覆演練。

## 前置

1. 舊系統 DB dump 還原到 club-aio 的 pg 容器內獨立庫(預設庫名 `legacy_clubs`):

   ```bash
   docker exec club-aio-db-1 psql -U club -d postgres -c "CREATE DATABASE legacy_clubs"
   docker exec -i club-aio-db-1 pg_restore -U club -d legacy_clubs --no-owner --no-privileges < ntust_clubs_YYYY-MM-DD.dump
   ```

2. 目標庫已 `uv run python scripts/reset_db.py --yes`(schema head + 基礎 seed + superadmin)。

## 執行

```bash
cd backend
uv run python ../migration/cms_import.py           # 全部匯入
LEGACY_DB=legacy_clubs uv run python ../migration/cms_import.py  # 指定舊庫名
```

- 一次性密碼輸出到 `migration/out/one_time_passwords_*.csv`(**含明碼,不入版控**,
  交承辦發放後銷毀);所有帳號 `must_change_password=True`
- 檔案實體(企劃書/活動照片/附件)另需舊機 media 目錄,本輪未匯入(見 TODO)

## 範圍與對映(2026-07-21 需求方拍板)

| 舊 | 新 | 說明 |
|---|---|---|
| Club_club + clubcontent + clubproperty | clubs + users(club) | 性質=停社 → is_active=false、attribute=NULL;kind 依名稱結尾推導,特例見 `KIND_OVERRIDES`;「國際事務處」「testclub」「學務處就輔組」不遷 |
| Club_student | club_members | Semester「104 1」→「104-1」;社長/會長→負責人、副社長/副會長→副負責人;Phone/Date→phone/updated_at;同學期同學號取 id 最大者 |
| Club_teacher | clubs.advisor_* / advisor_out_* | 校內/校外各取最新一位 |
| Club_activity(+fund/staff/meta) | activities(+budget_items/reports) | type:course/conference→社課或會議、extra→活動;status 對映見 `STATUS_MAP`;結案資料寬鬆匯入(缺欄留空) |
| Club_news | announcements | 內容=原始連結(markdown) |
| Club_staff | users | position admin→admin(權限鍵之後由承辦配)、observer→viewer |

**不遷**(dump 留檔備查):club token/session、密碼歷史、Django 內建表、
稽核 staffactivitylog、審核歷程 auditactivityrecord、行事曆、歷年評鑑期間、
社團評鑑檔案庫 clubfiles(TODO:待決議)、行政歷史文件 clubrecordfromstaff(TODO)。

## clubclass(cc_import.py,2026-07-21)

前置:cms_import 已跑完(club=CMS Username、activity 走 legacy_id_map 對照)。
來源=本機拋棄式 MySQL(起法見 cc_import.py docstring)。

| 舊 | 新 | 說明 |
|---|---|---|
| Classroom(22) | venues 對照表 `VENUE_MAP` | 一舍 B2 一律拆 樓梯+白板 兩筆;新版已無的 4 處建 inactive 承接 |
| Device(25) | equipment(含 max_lease_count) | 名稱正規化 `DEVICE_RENAME`;停用 8 項建 inactive |
| Apply(15,021) | venue_bookings | status 0/1/4/2→pending/approved/rejected/cancelled;phone 保留、其餘申請人明細丟棄 |
| DeviceApply+DeviceLog | equipment_loans(一品項一筆) | 已核准且區間已過→returned;活動已刪→activity_id NULL |
| 認不出借用單位的單(空字串 / admin / 8 開頭偽帳號 / 未知) | club_id NULL(顯示「學務處」) | 舊系統有 960 筆 `club_id` 是空字串,**不丟掉**(decisions.md MIG-03);認不出來的帳號身分待承辦辨識(MIG-06) |
| ClassroomRule(2,848)、Admin、Notice | 不遷 | 場地封鎖=新 Rule Page 功能;未過期封鎖上線時人工重建 |

## 注意

- `import_teachers` 非 id-map 型:每次重跑**覆寫** clubs 的指導老師欄位。
  正式切換後若社團已在新系統改過指導老師,勿再重跑遷移。

## TODO

- [ ] 舊機 media 目錄抓回後匯入檔案實體(PlanFile/activityfiles/activityimages),
      並回填 files 列 + 活動附件關聯
- [ ] 評鑑檔案庫(Club_clubfiles,12,752 檔、14 分類)是否歸檔匯入待需求方決議
- [ ] 行政歷史文件(clubrecordfromstaff,7 筆停社/成立/改名申請)同上
