from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def _limit(env_var: str, default: str) -> str:
    return os.environ.get(env_var, default)


limiter = Limiter(key_func=get_remote_address)

ANALYZE_LIMIT = _limit("RATE_LIMIT_ANALYZE", "3/minute")
REVIEW_LIMIT = _limit("RATE_LIMIT_REVIEW", "3/minute")
NEXT_ACTION_LIMIT = _limit("RATE_LIMIT_NEXT_ACTION", "10/minute")
