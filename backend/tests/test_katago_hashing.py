from app.services.katago.hashing import position_hash


def test_hash_stable():
    a = position_hash(19, 7.5, "chinese", [("B", "D4"), ("W", "Q16")])
    b = position_hash(19, 7.5, "chinese", [("B", "d4"), ("W", "q16")])
    assert a == b
    assert len(a) == 32


def test_hash_order_sensitive():
    a = position_hash(19, 7.5, "chinese", [("B", "D4"), ("W", "Q16")])
    b = position_hash(19, 7.5, "chinese", [("W", "Q16"), ("B", "D4")])
    assert a != b


def test_hash_size_sensitive():
    a = position_hash(19, 7.5, "chinese", [("B", "D4")])
    b = position_hash(13, 7.5, "chinese", [("B", "D4")])
    assert a != b


def test_hash_komi_sensitive():
    a = position_hash(19, 7.5, "chinese", [])
    b = position_hash(19, 6.5, "chinese", [])
    assert a != b
