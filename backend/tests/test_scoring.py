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
    def test_needs_5_photos_or_video(self):
        closed = (act(1, "2026/03/01"),)
        assert score("ad2", closed=closed, results=(ActivityResult(1, photo_count=4),)) == 0
        assert score("ad2", closed=closed, results=(ActivityResult(1, photo_count=5),)) == 1
        assert score("ad2", closed=closed, results=(ActivityResult(1, has_video_link=True),)) == 1

    def test_large_x3_and_unclosed_uploads_ignored(self):
        closed = (act(1, "2026/03/01", large=True),)
        results = (ActivityResult(1, photo_count=5), ActivityResult(999, photo_count=9))
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
        assert score("ad7", leader_meeting_attended=True) == 5
        assert score("ad8", cadre_training_attended=True) == 5

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
