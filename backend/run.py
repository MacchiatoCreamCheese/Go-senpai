"""Dev launcher that forces the Windows proactor loop before uvicorn starts.

Use this instead of `uvicorn app.main:app --reload` on Windows when KataGo is
enabled — asyncio subprocesses require the proactor loop, and uvicorn's
default selector loop can't spawn them.
"""
from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        loop="asyncio",
    )
