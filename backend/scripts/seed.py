"""初始資料:五獎項(含當年 rubric 評分細項)+ 19 處場地主檔 + 最高權限管理員。

用法:
  uv run python scripts/seed.py --admin-username super --admin-password '...'
密碼須符合政策(≥10 碼含大小寫+數字+特殊符號);重跑 idempotent(已存在即跳過)。
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # 讓 scripts/ 可 import app

import sqlalchemy as sa

from app.core.db import async_session_factory
from app.core.security import hash_password, validate_password_strength
from app.models import Award, AwardRubricItem, User, Venue
from app.models.enums import AwardKind, UserRole, VenueCategory
from app.services.evaluation import get_eval_window
from app.services.scoring import AD_MAX, ADMIN_TOTAL_MAX

# 五獎項(原型 AWARDS)。rubric 逐年版本化,但「複製上年再修改」的介面尚未實作:
# 目前只能改 eval_window 年度後重跑 seed,或直接操作 DB。
# 存純資料、Award 列於 seed() 內建構:模組層 ORM 實例會在第一次 seed 後轉 persistent,
# 之後(如測試重跑)再 add 會被當成既有列而靜默跳過 INSERT
# (id, name, kind, has_presentation, is_weighted, sort)
AWARDS: list[tuple[str, str, AwardKind, bool, bool, int]] = [
    ("club", "最佳社團獎", AwardKind.GROUP, False, True, 1),
    ("finance", "最佳財務獎", AwardKind.GROUP, True, False, 2),
    ("activity", "最佳活動獎", AwardKind.GROUP, True, False, 3),
    ("result", "最佳成果發表獎", AwardKind.GROUP, False, False, 4),
    ("leader", "最佳社團負責人獎", AwardKind.INDIVIDUAL, True, False, 5),
]

# ---------------------------------------------------------------------------
# 五獎項評分細項(rubric):一律以各獎項的評分標準 PDF 為準
#
# 逐年版本化(award_rubric_items):此處建立預設評鑑年(services/evaluation.get_eval_window
# 同源,目前 116)的一份;之後年度由行政「複製上年再修改」。
#
# 現場簡報 20 分不建 rubric item(awards.has_presentation=True 的獎項於評審評分時
# 使用 ReviewScore.presentation_score 專欄),對帳如下(依 docs/社團評鑑/ 各 PDF):
#   club     行政資料 100(最佳社團獎-行政資料.pdf;is_admin_item=True,
#            配分=services/scoring.AD_MAX ad1–ad8)+ 社團營運 100(最佳社團獎-社團營運.pdf);
#            行政 40% / 營運 60% 加權(awards.is_weighted)
#   finance  細項合計 100 + 簡報 20 = 120(最佳財務獎評分標準.pdf)
#   activity 細項合計 100 + 簡報 20 = 120(最佳活動獎評分標準_260714.pdf;
#            舊版 90 分與該 PDF 自述「競賽資料 100%」矛盾,新版已對齊,見 decisions.md DEC-10)
#   result   細項合計  95,無簡報專欄(最佳成果發表獎評分標準.pdf;
#            「四、現場發表 15」屬 PDF 細項,建為一般 rubric item)
#   leader   細項合計 100 + 簡報 20 = 120(最佳社團負責人獎評分標準.pdf)
# ---------------------------------------------------------------------------
PRESENTATION_MAX = 20  # 現場簡報滿分(不建 rubric item)

# 各獎項「rubric 合計 + 簡報(如有)」的總分;seed 時 assert 對帳
AWARD_TOTALS: dict[str, float] = {
    "club": 100,  # 營運 group 合計(行政 group 另以 AD_MAX 對帳)
    "finance": 120,
    "activity": 120,
    "result": 95,
    "leader": 120,
}

# {award_id: [(group_label, group_weight, item_key, name, max_score, help, is_admin_item)]}
# 列表順序即 sort
RUBRICS: dict[str, list[tuple[str, float | None, str, str, float, str, bool]]] = {
    "club": [
        # 行政資料 group(系統自動評分;最佳社團獎-行政資料.pdf)
        ("行政資料", 0.4, "ad1", "活動及社課申請", 15,
         "活動及社課以申請次數計算,一次給 1 分;一天最多申請一次;大型活動一次 3 分;結案始算分數。",
         True),
        ("行政資料", 0.4, "ad2", "照/影片", 15,
         "活動結束後上傳活動照片至少 5 張或影片連結,1 個活動 1 分;大型活動一次 3 分,最多 15 分。"
         "採計以承辦於結案審核的繳交確認為準。",
         True),
        ("行政資料", 0.4, "ad3", "成果單", 15,
         "活動結束後上傳成果單,1 個活動 1 分;大型活動一次 3 分,最多 15 分。"
         "採計以承辦於結案審核的繳交確認為準。", True),
        ("行政資料", 0.4, "ad4", "心得回饋", 30,
         "活動結束後上傳心得回饋,1 個活動 2 分;大型活動一次 6 分,最多 30 分。"
         "採計以承辦於結案審核的繳交確認為準。", True),
        ("行政資料", 0.4, "ad5", "社員、幹部名單更新", 10,
         "定期更新社員、幹部名單:9 人以下每學期 2.5 分;10 人以上每學期 5 分,總分 10 分。",
         True),
        ("行政資料", 0.4, "ad6", "社團網頁經營", 5,
         "有連結即 5 分(2026-07-14 需求方簡化,不追蹤更新時間)。", True),
        ("行政資料", 0.4, "ad7", "負責人會議", 5,
         "競賽期間參與社團負責人會議,每場簽到 1.25 分(每學期 2 場、全學年 4 場滿分)。", True),
        ("行政資料", 0.4, "ad8", "幹訓", 5, "派幹部參與幹訓活動且簽到即 5 分。", True),
        # 社團營運 group(委員評分;最佳社團獎-社團營運.pdf)
        ("社團營運", 0.6, "o1", "管理運作", 15,
         "組織運作及財務管理:組織章程明確完整,社員大會與社長幹部選出符合章程;"
         "幹部交接清冊或工作 SOP 詳實、幹訓內容有助提升幹部能力。", False),
        ("社團營運", 0.6, "o2", "規劃管理", 10,
         "組織運作及財務管理:定期召開社員大會與幹部會議;學期行事曆符合成立宗旨;"
         "整體活動計畫與會議紀錄詳實;年度計畫執行成效。", False),
        ("社團營運", 0.6, "o3", "財務管理", 25,
         "組織運作及財務管理:社費收退費、經費支出與解散經費訂有合理規範;"
         "帳戶管理人與印章分開管理;財務報表清楚且受監督;器材保管借用辦法與清冊紀錄清楚。",
         False),
        ("社團營運", 0.6, "o4", "社內活動", 15,
         "社團活動績效:活動檢討確實記錄並提出改善建議;社課教學內容如實紀錄;"
         "參與率與出席人數達預期;心得回饋反映學習狀況;照片反映活動成果。", False),
        ("社團營運", 0.6, "o5", "社團融入 SDGs", 10,
         "社團活動績效:活動融入 SDGs 目標,如教育優先區中小學營隊、帶動中小學社團發展、"
         "社區服務及社會關懷等。", False),
        ("社團營運", 0.6, "o6", "社會實踐", 15,
         "社團活動績效:協助學校或社區(民間)團體活動;參與對象涵蓋社團內外;"
         "跨校合辦活動或參加校際比賽並呈現成果。", False),
        ("社團營運", 0.6, "o7", "活動特色", 10,
         "社團活動績效:特色主題概念清晰,契合社團理念、展現學校文化或社團傳統;"
         "呈現創新或結合社團關注議題。", False),
    ],
    "finance": [
        ("制度", None, "f1", "財務管理制度", 20,
         "訂有財務管理制度(辦法),訂有使用原則及運作情形。", False),
        ("預算", None, "f2", "預算編列、審核", 15,
         "完整且詳細的年度預算表(各活動預算及總預算);召開預算經費審核會議"
         "(開會通知單、簽到表、會議紀錄);合格之預算審核程序、審核單位及審核證明。", False),
        ("預算", None, "f3", "經費應變、開源節流", 15,
         "彈性經費可供運用;經費應變措施;開源節流具體做法。", False),
        ("帳目與支出憑證", None, "f4", "帳目交接", 10,
         "新舊負責人、總務蓋章證明與交接紀錄留存。", False),
        ("帳目與支出憑證", None, "f5", "總帳登記、支出憑證製作", 15,
         "年度經費收支情形詳載於帳冊(編碼、社章、抬頭、用途說明、證明單據、審核證明)。",
         False),
        ("公開徵信", None, "f6", "帳目核對、公開徵信", 25,
         "定期公告收支概況、徵信內容完整(帳目細項、社員簽名);具備完備查帳紀錄;"
         "接受建議及公開回覆管道;設立非私人專戶且存簿印章分別保管;收支差異分析與經費運用成效。",
         False),
    ],
    # 最佳活動獎評分標準_260714.pdf(decisions.md DEC-10:改用此版,競賽資料合計 100)
    "activity": [
        ("活動企劃", None, "ac1", "活動宣傳", 5,
         "依目標對象運用適切且多元的宣傳管道(海報、社群媒體、網頁及實體宣傳等);"
         "宣傳期程、內容發布與資訊更新規劃妥當。", False),
        ("活動企劃", None, "ac2", "活動企畫書", 10,
         "企畫書清楚說明活動目的、目標、對象、內容、期程、場地、資源及執行方式;"
         "整體工作進度與時程安排合理可行,並保留必要調整空間;活動主題與特色明確、內容具體呈現。",
         False),
        ("活動企劃", None, "ac3", "活動會議", 5,
         "依活動規模與需求召開活動討論及籌備會議,形成明確決議、分工與追蹤事項"
         "(或有工作群組摘要、任務表或其他紀錄佐證);會議決議與工作分配確實執行並適時追蹤。",
         False),
        ("活動執行", None, "ac4", "活動前", 5,
         "工作人員之招募、參與、分工及事前說明或訓練妥適;場地、報到、指引及現場視覺布置"
         "符合活動主題、動線與安全需求;完成活動、場地及其他必要申請或核准程序。", False),
        ("活動執行", None, "ac5", "活動中", 15,
         "活動器材、道具、場地之準備與運用妥善;依活動流程及動線規劃確實執行、時間掌控得宜;"
         "工作人員職責分工明確,現場調度與相互支援良好;遇突發狀況即時應變並妥善處理"
         "(如無突發狀況,因已有評估預防及備援措施)。", False),
        ("活動執行", None, "ac6", "活動後", 5,
         "器材、道具歸還以及活動場地復原情形。", False),
        ("活動執行", None, "ac7", "經費運用", 5,
         "活動經費運作情形與使用原則,依財務管理辦法規定執行;經費收支核實記錄、單據完備"
         "並依規定核銷;經費與資源投入與活動規模及成果相稱;預算與實際支應差異分析。", False),
        ("活動結案", None, "ac8", "活動成果報告書", 25,
         "活動結束後撰寫活動成果報告書,說明活動辦理情形及成果;對照活動企畫書說明活動規劃"
         "與實際執行之差異(內容、流程、參與人數、經費)及原因;針對執行落差、優缺點及突發狀況"
         "提出具體改善措施與後續追蹤;說明參與者及工作人員之收穫與活動效益"
         "(問卷回饋、心得或照片,擇一佐證即可)。", False),
        ("活動結案", None, "ac9", "活動保存", 5,
         "企劃、核准、會議通知、議程、簽到、紀錄、活動成果、財務及檢討資料分類完整、"
         "數位化且可追溯。", False),
        ("活動價值與影響", None, "ac10", "宗旨契合", 5,
         "活動目的與成果能對應社團宗旨或發展計畫,並於企畫書及成果報告中具體說明關聯。",
         False),
        ("活動價值與影響", None, "ac11", "對人的影響", 10,
         "就成員學習成長、文化或技能傳承、團隊凝聚、校園參與、社區服務或社會關懷等面向,"
         "至少擇一項深入呈現,並提出具體佐證(問卷數據及回饋摘錄、培訓或心得紀錄、"
         "社內外參與人數及比例、服務對象回饋)。", False),
        ("活動價值與影響", None, "ac12", "延續與擴散", 5,
         "活動成果具後續延伸(擇一即可):成果發表、媒體或社群報導、他單位邀請合作、"
         "列入傳承資料或下屆續辦規劃,並附相關佐證。", False),
    ],
    "result": [
        ("活動影響力", None, "r1", "活動效益與參與多元性", 7,
         "參與人數與活動性質相符、發揮預期效益;參與者來源多元;活動設計觸及目標族群核心需求。",
         False),
        ("活動影響力", None, "r2", "參與者學習成效", 7,
         "參與者確實學會新技能、獲得新知識或改變觀念;內容對學習、生活或未來發展有實際幫助。",
         False),
        ("活動影響力", None, "r3", "持續效應與延續性", 6,
         "活動的持續效應或延續性;活動經驗被推廣或複製;參與者在活動後持續相關行動。", False),
        ("執行完整度", None, "r4", "企劃規劃合理性", 10,
         "活動企畫書規劃合理;目標明確;籌備過程合理;分工清楚;活動當日流程合理。", False),
        ("執行完整度", None, "r5", "現場執行流暢度", 10, "現場執行流暢,活動進行順利。", False),
        ("執行完整度", None, "r6", "執行紀錄完整性", 10,
         "活動確實執行與紀錄;提供活動照片證明活動確實舉辦,紀錄完整且品質良好。", False),
        ("執行完整度", None, "r7", "問題解決與應變", 10, "遇到突發狀況能妥善處理。", False),
        ("學習與成長", None, "r8", "團隊學習收穫", 10,
         "團隊從活動中學到什麼(技能、經驗、反思)。", False),
        ("學習與成長", None, "r9", "改進計畫", 10,
         "下次會怎麼做得更好(具體可行的改善方向)。", False),
        ("現場發表", None, "r10", "現場發表", 15,
         "到場進行 7 分鐘成果發表(方式不拘:簡報、影片、表演皆可),"
         "展現團隊投入程度、表達清晰度、真誠度與熱情。", False),
    ],
    "leader": [
        ("自我介紹", None, "l1", "自我介紹", 10,
         "基本資料、簡短履歷、自傳、優缺點分析、受推薦原因。", False),
        ("自我介紹", None, "l2", "人生規劃", 5, "短、中、長期目標與未來規劃。", False),
        ("自我介紹", None, "l3", "個人特色", 10, "人格特質與自身獨特性。", False),
        ("社團經歷", None, "l4", "社團經歷", 20, "負責工作經驗與感想。", False),
        ("社團經歷", None, "l5", "社團事蹟以及貢獻", 25,
         "社團事蹟、貢獻;寒暑假服務隊之相關貢獻。", False),
        ("個人事蹟", None, "l6", "個人目標", 10, "個人目標是否達成,請詳述。", False),
        ("個人事蹟", None, "l7", "活動經歷", 15, "負責工作經驗與感想。", False),
        ("個人事蹟", None, "l8", "人際經歷", 5, "社團內人際交往情況與感想。", False),
    ],
}


def verify_rubrics() -> None:
    """rubric 與 PDF/scoring 對帳:配分錯誤直接擋下 seed(tests 也呼叫)。"""
    presentation_awards = {aid for aid, _, _, has_presentation, _, _ in AWARDS if has_presentation}
    assert presentation_awards == {"finance", "activity", "leader"}
    for award_id, items in RUBRICS.items():
        manual_sum = sum(i[4] for i in items if not i[6])
        admin_sum = sum(i[4] for i in items if i[6])
        presentation = PRESENTATION_MAX if award_id in presentation_awards else 0
        # 有簡報的獎 rubric 合計=總分−20;無簡報獎=總分(club 為營運 group 合計)
        assert manual_sum + presentation == AWARD_TOTALS[award_id], award_id
        if award_id == "club":
            # 行政資料 group 與自動評分引擎同一套配分(合計 100,=行政分上限)
            assert admin_sum == ADMIN_TOTAL_MAX
            for _, _, key, _, max_score, _, is_admin in items:
                if is_admin:
                    assert AD_MAX[key] == max_score, key
        else:
            assert admin_sum == 0, award_id  # 行政資料項僅存在於最佳社團獎


# 場地主檔 19 處,與 frontend/src/features/bookings/mock.ts VENUES 對齊;
# 場地主檔 CRUD 尚未實作(審查報告 GAP-04),異動目前只能改此處或直接操作 DB
# (名稱, 類別, 容納人數, allow_fixed, allow_temp)
VENUES: list[tuple[str, VenueCategory, int, bool, bool]] = [
    ("S204 共享食堂", VenueCategory.CLASSROOM, 60, True, True),
    ("S207", VenueCategory.CLASSROOM, 60, True, True),
    ("S209", VenueCategory.CLASSROOM, 60, True, True),
    ("S301", VenueCategory.CLASSROOM, 50, True, True),
    ("S302/S303", VenueCategory.CLASSROOM, 90, True, True),
    ("S304 音樂教室", VenueCategory.CLASSROOM, 50, True, True),
    ("S311", VenueCategory.CLASSROOM, 50, True, True),
    ("S312/S313", VenueCategory.CLASSROOM, 90, True, True),
    ("S314", VenueCategory.CLASSROOM, 50, True, True),
    ("練團室", VenueCategory.PRACTICE, 15, True, True),
    ("T4 舞蹈區", VenueCategory.PRACTICE, 15, True, True),
    ("3F 戶外廣場", VenueCategory.OUTDOOR, 200, False, True),
    ("戶外精誠廣場 1", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 2", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 3", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 4", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 5", VenueCategory.OUTDOOR, 150, False, True),
    ("一宿 B2 樓梯", VenueCategory.DORM, 120, False, True),
    ("一宿 B2 白板", VenueCategory.DORM, 120, False, True),
]


async def seed(admin_username: str | None, admin_password: str | None) -> None:
    verify_rubrics()
    async with async_session_factory() as db:
        for award_id, name, kind, has_presentation, is_weighted, sort in AWARDS:
            if await db.get(Award, award_id) is None:
                db.add(
                    Award(
                        id=award_id,
                        name=name,
                        kind=kind,
                        has_presentation=has_presentation,
                        is_weighted=is_weighted,
                        sort=sort,
                    )
                )
                print(f"award created: {award_id}")

        # rubric:當年評鑑視窗的評分細項(idempotent:同 (award, year, item_key) 跳過)
        window = await get_eval_window(db)
        for award_id, items in RUBRICS.items():
            for sort, (group_label, weight, key, name, max_score, help_text, is_admin) in (
                enumerate(items, 1)
            ):
                exists = await db.scalar(
                    sa.select(AwardRubricItem.id).where(
                        AwardRubricItem.award_id == award_id,
                        AwardRubricItem.year == window.year,
                        AwardRubricItem.item_key == key,
                    )
                )
                if exists is None:
                    db.add(
                        AwardRubricItem(
                            award_id=award_id,
                            year=window.year,
                            group_label=group_label,
                            group_weight=weight,
                            item_key=key,
                            name=name,
                            max_score=max_score,
                            help=help_text,
                            is_admin_item=is_admin,
                            sort=sort,
                        )
                    )
                    print(f"rubric created: {award_id}/{key}({window.year})")

        for sort, (name, category, capacity, allow_fixed, allow_temp) in enumerate(VENUES, 1):
            exists = await db.scalar(sa.select(Venue.id).where(Venue.name == name))
            if exists is None:
                db.add(
                    Venue(
                        name=name,
                        category=category,
                        capacity=capacity,
                        allow_fixed=allow_fixed,
                        allow_temp=allow_temp,
                        sort=sort,
                    )
                )
                print(f"venue created: {name}")

        if admin_username and admin_password:
            exists = await db.scalar(sa.select(User.id).where(User.username == admin_username))
            if exists:
                print(f"admin exists: {admin_username}")
            else:
                validate_password_strength(admin_password)
                db.add(
                    User(
                        role=UserRole.ADMIN,
                        username=admin_username,
                        password_hash=hash_password(admin_password),
                        name="系統管理員",
                        is_super=True,
                        must_change_password=True,
                    )
                )
                print(f"super admin created: {admin_username}(首登需改密)")
        await db.commit()
    print("seed done")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-username")
    parser.add_argument("--admin-password")
    args = parser.parse_args()
    asyncio.run(seed(args.admin_username, args.admin_password))
