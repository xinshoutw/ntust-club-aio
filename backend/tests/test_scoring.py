"""行政分引擎測試:逐案對齊 frontend/src/features/eval/scoring.test.ts。"""

from app.services.scoring import (
    ActivityResult,
    ClosedActivity,
    ScoringInput,
    apply_overrides,
    compute_ad_scores,
    total_of,
)


def act(id: int, date: str, large: bool = False) -> ClosedActivity:
    return ClosedActivity(id=id, name=str(id), date=date, large=large)


def score(key: str, **kw) -> float:
    scores = compute_ad_scores(ScoringInput(**kw))
    return next(s for s in scores if s.key == key).auto


class TestAd1:
    def test_normal_1_approved_large_3(self):
        closed = (act(1, "2026/03/01"), act(2, "2026/04/01", large=True))
        assert score("ad1", closed=closed) == 4

    def test_one_per_day_takes_daily_max(self):
        closed = (act(1, "2026/03/01"), act(2, "2026/03/01", large=True), act(3, "2026/03/01"))
        assert score("ad1", closed=closed) == 3

    def test_capped_at_15(self):
        closed = tuple(act(i, f"2026/03/{i + 1:02d}", large=True) for i in range(9))
        assert score("ad1", closed=closed) == 15


class TestAd2:
    def test_follows_the_reviewer_confirmation(self):
        """依 D-14 只看承辦的繳交確認,系統不自己數張數(社團可能是交紙本)。"""
        closed = (act(1, "2026/03/01"),)
        assert score("ad2", closed=closed, results=(ActivityResult(1, has_photos=False),)) == 0
        assert score("ad2", closed=closed, results=(ActivityResult(1, has_photos=True),)) == 1

    def test_large_x3_and_unclosed_uploads_ignored(self):
        closed = (act(1, "2026/03/01", large=True),)
        results = (ActivityResult(1, has_photos=True), ActivityResult(999, has_photos=True))
        assert score("ad2", closed=closed, results=results) == 3


class TestAd3Ad4:
    def test_report_and_feedback_scoring(self):
        closed = (act(1, "2026/03/01"), act(2, "2026/03/02", large=True))
        results = (
            ActivityResult(1, has_report=True, has_feedback=True),
            ActivityResult(2, has_feedback=True),
        )
        assert score("ad3", closed=closed, results=results) == 1
        assert score("ad4", closed=closed, results=results) == 8

        # 兩項各自獨立:承辦只確認了報告表,心得那一項就是 0
        report_only = (ActivityResult(1, has_report=True), ActivityResult(2, has_report=True))
        assert score("ad3", closed=closed, results=report_only) == 4
        assert score("ad4", closed=closed, results=report_only) == 0

        many = tuple(act(i, f"2026/04/0{i + 1}", large=True) for i in range(6))
        many_results = tuple(ActivityResult(a.id, has_feedback=True) for a in many)
        assert score("ad4", closed=many, results=many_results) == 30


class TestAd5:
    def test_roster_tiers(self):
        assert score("ad5", roster_by_semester={"114-2": 0, "115-1": 0}) == 0
        assert score("ad5", roster_by_semester={"114-2": 4, "115-1": 0}) == 2.5
        assert score("ad5", roster_by_semester={"114-2": 10, "115-1": 9}) == 7.5
        assert score("ad5", roster_by_semester={"114-2": 10, "115-1": 30}) == 10


class TestAd6ToAdj:
    def test_website_meeting_training(self):
        assert score("ad6", has_website=True) == 5
        # ad7 每場簽到 1.25 分(每學期 2 場、全學年 4 場滿分 5)
        assert score("ad7", leader_meeting_sessions=0) == 0
        assert score("ad7", leader_meeting_sessions=1) == 1.25
        assert score("ad7", leader_meeting_sessions=2) == 2.5
        assert score("ad7", leader_meeting_sessions=4) == 5
        assert score("ad7", leader_meeting_sessions=6) == 5  # 超額封頂
        # ad8 幹訓簽到即滿分(僅報名不計)
        assert score("ad8", cadre_training_attended=True) == 5
        assert score("ad8", cadre_training_attended=False) == 0

    def test_penalty_and_merit_caps(self):
        assert score("adj", violation_count=3) == -3
        assert score("adj", violation_count=14) == -10
        assert score("adj", merit=9, violation_count=0) == 5
        assert score("adj", merit=2, violation_count=4) == -2


class TestOverrides:
    def test_override_and_revert(self):
        scores = compute_ad_scores(ScoringInput(has_website=True))
        with_override = apply_overrides(scores, {"ad6": 2})
        ad6 = next(s for s in with_override if s.key == "ad6")
        assert ad6.final == 2
        assert ad6.overridden is True

        reverted = apply_overrides(scores, {"ad6": None})
        ad6r = next(s for s in reverted if s.key == "ad6")
        assert ad6r.final == 5
        assert ad6r.overridden is False

    def test_total_sums_final_values(self):
        scores = apply_overrides(compute_ad_scores(ScoringInput(has_website=True, merit=3)), {})
        assert total_of(scores) == 8

    def test_total_floored_at_zero(self):
        """違規扣分壓不到負數(decisions.md DEC-08)。

        負分會透過最佳社團獎 40%/60% 的加權把營運分一起吃掉,不是扣分該有的效果。
        """
        heavy = ScoringInput(violation_count=99)
        scores = apply_overrides(compute_ad_scores(heavy), {})
        assert sum(s.final for s in scores) < 0  # 逐項加總確實是負的
        assert total_of(scores) == 0

    def test_total_capped_at_100(self):
        """各項滿分合計恰 100;表現優良加分不破頂(2026-07-15 定案)。"""
        closed = tuple(
            act(i, f"2026/{(i // 27) + 3:02d}/{(i % 27) + 1:02d}", large=True) for i in range(30)
        )
        results = tuple(
            ActivityResult(a.id, has_photos=True, has_report=True, has_feedback=True)
            for a in closed
        )
        full = ScoringInput(
            closed=closed,
            results=results,
            roster_by_semester={"114-2": 30, "115-1": 30},
            has_website=True,
            leader_meeting_sessions=4,
            cadre_training_attended=True,
            merit=5,
        )
        scores = apply_overrides(compute_ad_scores(full), {})
        assert sum(s.final for s in scores) == 105  # 滿分 100 + 表現優良 5
        assert total_of(scores) == 100
