from __future__ import annotations

from app.services.drills.selector import score_candidates


def _p(pid, themes, difficulty=1):
    return {"id": pid, "themes": list(themes), "difficulty": difficulty}


def test_no_weaknesses_returns_zero_scores_but_all_candidates():
    candidates = [_p("a", ["tesuji"]), _p("b", ["counting"])]
    scored = score_candidates([], candidates, recent_problem_ids=set())
    assert len(scored) == 2
    assert all(score == 0.0 for _, score in scored)


def test_matching_theme_wins():
    weaknesses = [
        {"theme": "blunder_middlegame", "severity": 0.8},
        {"theme": "blunder_endgame", "severity": 0.1},
    ]
    candidates = [
        _p("tactics", ["capturing_race"]),     # matches middlegame (0.8)
        _p("endgame", ["endgame_tesuji"]),     # matches endgame (0.1)
        _p("random", ["shape"]),               # no match
    ]
    scored = score_candidates(weaknesses, candidates, recent_problem_ids=set())
    assert scored[0][0]["id"] == "tactics"
    assert scored[0][1] == 0.8
    assert scored[1][0]["id"] == "endgame"


def test_recent_problems_penalized():
    weaknesses = [{"theme": "blunder_middlegame", "severity": 0.5}]
    candidates = [
        _p("fresh", ["capturing_race"]),
        _p("stale", ["capturing_race"]),
    ]
    scored = score_candidates(weaknesses, candidates, recent_problem_ids={"stale"})
    assert scored[0][0]["id"] == "fresh"
    # stale should have been penalized below fresh
    stale_score = next(s for p, s in scored if p["id"] == "stale")
    assert stale_score < scored[0][1]


def test_tie_break_prefers_lower_difficulty_then_id():
    weaknesses = [{"theme": "ignored_top_move", "severity": 0.5}]
    candidates = [
        _p("b_easy", ["tesuji"], difficulty=1),
        _p("a_hard", ["tesuji"], difficulty=5),
        _p("c_easy", ["tesuji"], difficulty=1),
    ]
    scored = score_candidates(weaknesses, candidates, recent_problem_ids=set())
    # All score the same (0.5); difficulty breaks tie, then id alpha.
    assert [p["id"] for p, _ in scored] == ["b_easy", "c_easy", "a_hard"]


def test_zero_severity_weakness_contributes_nothing():
    weaknesses = [{"theme": "blunder_middlegame", "severity": 0.0}]
    candidates = [_p("a", ["capturing_race"])]
    scored = score_candidates(weaknesses, candidates, recent_problem_ids=set())
    assert scored[0][1] == 0.0
