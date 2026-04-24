from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager

if sys.platform == "win32":
    # Required so KataGo can be launched as an asyncio subprocess.
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .api import analysis, rest, review, ws
from .services.katago import KataGoEngine, get_engine, set_engine

load_dotenv()


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
        await engine.start()
        set_engine(engine)

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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(rest.router)
    app.include_router(analysis.router)
    app.include_router(review.router)
    app.include_router(ws.router)
    return app


app = create_app()
