from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager

if sys.platform == "win32":
    # Required so KataGo can be launched as an asyncio subprocess.
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import logging
from dotenv import load_dotenv

# Load .env BEFORE importing any submodule that reads os.environ at import
# time — auth.py evaluates SUPABASE_PROJECT_REF at module scope.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from . import db
from .api import analysis, auth, coach, rest, review, ws
from .rate_limit import limiter
from .services.katago import KataGoEngine, get_engine, set_engine

log = logging.getLogger(__name__)


def _katago_enabled() -> bool:
    return os.environ.get("KATAGO_ENABLED", "false").lower() in ("1", "true", "yes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    dsn = os.environ["DATABASE_URL"]
    await db.connect(dsn)

    if _katago_enabled():
        engine = KataGoEngine(
            binary=os.environ["KATAGO_BIN"],
            config=os.environ["KATAGO_CONFIG"],
            model=os.environ["KATAGO_MODEL"],
        )
        try:
            await engine.start()
            set_engine(engine)
        except Exception:
            log.exception("KataGo failed to start; continuing without KataGo engine")
            set_engine(None)

    try:
        yield
    finally:
        engine = get_engine()
        if engine is not None:
            await engine.stop()
            set_engine(None)
        await db.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Go-senpai", version="0.1.0", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    _default_origins = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )
    _cors_origins = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")
        if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(rest.router)
    app.include_router(analysis.router)
    app.include_router(review.router)
    app.include_router(coach.router)
    app.include_router(ws.router)
    return app


app = create_app()
