import json

from app.services.review.prompt import SYSTEM_PROMPT, build_review_prompt
from app.services.review.retriever import RetrievedConcept
from app.services.review.selector import Moment


def _moment(**kw):
    base = dict(
        move_number=47,
        color="B",
        coord="K10",
        top_move="Q5",
        points_lost=8.2,
        winrate_before=0.58,
        winrate_after=0.42,
        score_before=2.0,
        score_after=-6.2,
        phase="middlegame",
        is_blunder=True,
        kind="blunder",
    )
    base.update(kw)
    return Moment(**base)


def test_prompt_contains_every_feature_and_concept():
    moments = [
        _moment(),
        _moment(move_number=63, coord="D17", top_move="C16", points_lost=5.1, is_blunder=False, kind="critical_decision"),
    ]
    concepts = [
        [RetrievedConcept(id="empty_triangle", title="Empty Triangle", body_md="bad shape...")],
        [RetrievedConcept(id="direction_of_play", title="Direction of Play", body_md="...")],
    ]
    system, user = build_review_prompt(
        game={"board_size": 19, "komi": 7.5, "result": "W+4.5"},
        player_color="B",
        moments=moments,
        concepts_per_moment=concepts,
    )
    assert "do not see the board" in system.lower()
    payload = json.loads(user)
    assert payload["game"]["reviewing_color"] == "Black"
    nums = [m["move_number"] for m in payload["moments"]]
    assert nums == [47, 63]
    assert payload["moments"][0]["top_move"] == "Q5"
    assert payload["moments"][0]["points_lost"] == 8.2
    assert "empty_triangle" in payload["concept_library"]
    assert "direction_of_play" in payload["concept_library"]


def test_system_prompt_specifies_json_output():
    assert "JSON" in SYSTEM_PROMPT
    assert "summary_md" in SYSTEM_PROMPT
    assert "concept_ids" in SYSTEM_PROMPT
