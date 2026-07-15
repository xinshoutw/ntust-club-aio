"""最佳社團獎「行政資料」自動評分引擎(依 docs/社團評鑑/最佳社團獎-行政資料.pdf)。

移植自 frontend/src/features/eval/scoring.ts(該檔為規格的可執行版本,測試逐案對齊);
純函式、無 DB 依賴,資料彙整由 services/evaluation.py 餵入。
"""

from dataclasses import dataclass

AD_KEYS = ("ad1", "ad2", "ad3", "ad4", "ad5", "ad6", "ad7", "ad8", "adj")

MIN_PHOTOS = 5
LARGE_MULTIPLIER = 3
MERIT_MAX = 5
PENALTY_MAX = 10
LEADER_MEETING_POINTS = 1.25  # 負責人會議每場簽到 1.25 分(每學期 2 場、全學年 4 場滿分 5)
ADMIN_TOTAL_MAX = 100  # 行政資料總分上限(2026-07-15 定案:加分後仍以 100 封頂)

AD_MAX: dict[str, float] = {
    "ad1": 15,
    "ad2": 15,
    "ad3": 15,
    "ad4": 30,
    "ad5": 10,
    "ad6": 5,
    "ad7": 5,
    "ad8": 5,
    "adj": 5,
}


@dataclass(frozen=True)
class ClosedActivity:
    id: int
    name: str
    date: str  # YYYY/MM/DD
    large: bool  # 申請大型活動且經管理員認可


@dataclass(frozen=True)
class ActivityResult:
    activity_id: int
    photo_count: int = 0
    has_video_link: bool = False
    has_report: bool = False
    has_feedback: bool = False


@dataclass(frozen=True)
class ScoringInput:
    closed: tuple[ClosedActivity, ...] = ()  # 評分區間內已結案(結案始算)
    results: tuple[ActivityResult, ...] = ()
    roster_by_semester: dict[str, int] | None = None  # 區間內兩學期名單人數
    has_website: bool = False
    leader_meeting_sessions: int = 0  # 負責人會議已簽到場次(管理員活動後登錄)
    cadre_training_attended: bool = False  # 幹訓已簽到(僅報名不計)
    violation_count: int = 0  # 未銷案勸導紀錄數
    merit: int = 0  # 表現優良加分(學務處登錄,0–5)


@dataclass(frozen=True)
class AdScore:
    key: str
    auto: float
    max: float
    note: str


@dataclass(frozen=True)
class FinalScore(AdScore):
    final: float
    overridden: bool


def _semester_score(count: int) -> float:
    return 0 if count <= 0 else 2.5 if count <= 9 else 5


def compute_ad_scores(i: ScoringInput) -> list[AdScore]:
    result_of = {r.activity_id: r for r in i.results}
    larges = sum(1 for a in i.closed if a.large)

    # ad1 活動及社課申請:一次 1 分、大型 3 分;一天最多計一次(取當日最高);上限 15
    best_per_day: dict[str, int] = {}
    for a in i.closed:
        v = LARGE_MULTIPLIER if a.large else 1
        best_per_day[a.date] = max(best_per_day.get(a.date, 0), v)
    ad1 = min(sum(best_per_day.values()), AD_MAX["ad1"])

    # ad2–ad4 活動成果:各活動有給就有分;大型 ×3;各有上限
    photo = report = feedback = 0
    for a in i.closed:
        r = result_of.get(a.id)
        if r is None:
            continue
        w = LARGE_MULTIPLIER if a.large else 1
        if r.photo_count >= MIN_PHOTOS or r.has_video_link:
            photo += 1 * w
        if r.has_report:
            report += 1 * w
        if r.has_feedback:
            feedback += 2 * w
    ad2 = min(photo, AD_MAX["ad2"])
    ad3 = min(report, AD_MAX["ad3"])
    ad4 = min(feedback, AD_MAX["ad4"])

    # ad5 名單更新:每學期 0 人 0 分、1–9 人 2.5 分、10 人以上 5 分;總分 10
    semesters = list((i.roster_by_semester or {}).items())
    ad5 = min(sum(_semester_score(c) for _, c in semesters), AD_MAX["ad5"])

    # ad6 網頁經營:有連結即給滿分(需求方 2026-07-14 簡化,不追蹤更新時間)
    ad6 = AD_MAX["ad6"] if i.has_website else 0

    # ad7/ad8 會議與幹訓:以管理員活動後登錄之簽到為準,僅報名不計分(2026-07-15)
    # ad7 每場 1.25 分(每學期 2 場、全學年 4 場滿分);ad8 簽到即滿分
    ad7 = min(i.leader_meeting_sessions * LEADER_MEETING_POINTS, AD_MAX["ad7"])
    ad8 = AD_MAX["ad8"] if i.cadre_training_attended else 0

    # 加減分:表現優良最多 +5;違規記點一次 −1、最多 −10
    merit = max(0, min(i.merit, MERIT_MAX))
    penalty = min(i.violation_count, PENALTY_MAX)
    adj = merit - penalty

    ad5_note = ";".join(f"{s}:{c} 人 → {_semester_score(c)} 分" for s, c in semesters)
    return [
        AdScore(
            "ad1", ad1, AD_MAX["ad1"], f"結案 {len(i.closed)} 件(大型 {larges});一天至多計 1 件"
        ),
        AdScore(
            "ad2",
            ad2,
            AD_MAX["ad2"],
            f"每活動照片 ≥{MIN_PHOTOS} 張或影片連結;大型 ×{LARGE_MULTIPLIER}",
        ),
        AdScore("ad3", ad3, AD_MAX["ad3"], f"每活動 1 分;大型 ×{LARGE_MULTIPLIER}"),
        AdScore("ad4", ad4, AD_MAX["ad4"], f"每活動 2 分;大型 ×{LARGE_MULTIPLIER}"),
        AdScore("ad5", ad5, AD_MAX["ad5"], ad5_note or "無名單資料"),
        AdScore("ad6", ad6, AD_MAX["ad6"], "已設定網頁連結" if i.has_website else "未設定網頁連結"),
        AdScore(
            "ad7",
            ad7,
            AD_MAX["ad7"],
            (
                f"已簽到 {i.leader_meeting_sessions} 場 × {LEADER_MEETING_POINTS} 分(全學年 4 場)"
                if i.leader_meeting_sessions > 0
                else "無簽到紀錄(以管理員活動後登錄之簽到為準)"
            ),
        ),
        AdScore(
            "ad8",
            ad8,
            AD_MAX["ad8"],
            "幹訓已簽到"
            if i.cadre_training_attended
            else "無簽到紀錄(以管理員活動後登錄之簽到為準)",
        ),
        AdScore(
            "adj",
            adj,
            AD_MAX["adj"],
            f"表現優良 +{merit};違規勸導 {i.violation_count} 筆 −{penalty}(上限 −{PENALTY_MAX})",
        ),
    ]


def apply_overrides(scores: list[AdScore], overrides: dict[str, float | None]) -> list[FinalScore]:
    """管理員調整:override 為 None/缺鍵表示採自動計算。"""
    return [
        FinalScore(
            key=s.key,
            auto=s.auto,
            max=s.max,
            note=s.note,
            final=o if (o := overrides.get(s.key)) is not None else s.auto,
            overridden=overrides.get(s.key) is not None,
        )
        for s in scores
    ]


def total_of(scores: list[FinalScore]) -> float:
    """行政資料總分:各項滿分合計恰為 100,加計表現優良後仍以 100 封頂。"""
    return min(sum(s.final for s in scores), ADMIN_TOTAL_MAX)
