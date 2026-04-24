from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Any

log = logging.getLogger(__name__)


class EngineDiedError(RuntimeError):
    pass


class KataGoEngine:
    """Persistent KataGo analysis-engine subprocess.

    Per KataGo's analysis protocol, one request with N analyzeTurns produces N
    responses, all sharing the request `id` and tagged with `turnNumber`. We
    correlate by id, accumulate responses keyed by turnNumber, and resolve the
    awaiting future once all expected turns arrive.
    """

    def __init__(self, binary: str, config: str, model: str) -> None:
        self._binary = binary
        self._config = config
        self._model = model
        self._proc: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._stderr_task: asyncio.Task[None] | None = None
        self._pending: dict[str, _Pending] = {}
        self._write_lock = asyncio.Lock()
        self.version: str = "unknown"
        self.model_name: str = os.path.basename(model)

    async def start(self) -> None:
        log.info("starting KataGo: %s", self._binary)
        self._proc = await asyncio.create_subprocess_exec(
            self._binary,
            "analysis",
            "-config",
            self._config,
            "-model",
            self._model,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._reader_task = asyncio.create_task(self._read_loop(), name="katago-stdout")
        self._stderr_task = asyncio.create_task(self._stderr_loop(), name="katago-stderr")

    async def stop(self) -> None:
        if self._proc is None:
            return
        try:
            self._proc.terminate()
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(self._proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            self._proc.kill()
            await self._proc.wait()
        for task in (self._reader_task, self._stderr_task):
            if task and not task.done():
                task.cancel()
        self._proc = None

    def is_alive(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    async def analyze(
        self,
        request: dict[str, Any],
        expected_turns: list[int],
    ) -> dict[int, dict[str, Any]]:
        if not self.is_alive() or self._proc is None or self._proc.stdin is None:
            raise EngineDiedError("KataGo process is not running")

        req_id = uuid.uuid4().hex
        request = {**request, "id": req_id}
        pending = _Pending(expected=set(expected_turns))
        self._pending[req_id] = pending

        line = (json.dumps(request) + "\n").encode("utf-8")
        async with self._write_lock:
            self._proc.stdin.write(line)
            await self._proc.stdin.drain()

        try:
            return await pending.future
        finally:
            self._pending.pop(req_id, None)

    async def _read_loop(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        stdout = self._proc.stdout
        while True:
            raw = await stdout.readline()
            if not raw:
                self._fail_all(EngineDiedError("KataGo stdout closed"))
                return
            try:
                msg = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                log.warning("non-JSON from KataGo: %r", raw[:200])
                continue
            req_id = msg.get("id")
            pending = self._pending.get(req_id) if req_id else None
            if pending is None:
                if "error" in msg or "warning" in msg:
                    log.warning("katago: %s", msg)
                continue
            if "error" in msg:
                pending.future.set_exception(RuntimeError(f"KataGo error: {msg['error']}"))
                continue
            turn = msg.get("turnNumber")
            if turn is None:
                continue
            pending.responses[turn] = msg
            pending.expected.discard(turn)
            if not pending.expected and not pending.future.done():
                pending.future.set_result(pending.responses)

    async def _stderr_loop(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        stderr = self._proc.stderr
        while True:
            raw = await stderr.readline()
            if not raw:
                return
            text = raw.decode("utf-8", errors="replace").rstrip()
            if self.version == "unknown" and "KataGo v" in text:
                # KataGo prints e.g. "KataGo v1.16.4" early in stderr.
                idx = text.find("KataGo v")
                self.version = text[idx:].split()[1] if " " in text[idx:] else text[idx:]
            log.debug("katago stderr: %s", text)

    def _fail_all(self, exc: BaseException) -> None:
        for pending in list(self._pending.values()):
            if not pending.future.done():
                pending.future.set_exception(exc)
        self._pending.clear()


class _Pending:
    __slots__ = ("expected", "responses", "future")

    def __init__(self, expected: set[int]) -> None:
        self.expected = expected
        self.responses: dict[int, dict[str, Any]] = {}
        self.future: asyncio.Future[dict[int, dict[str, Any]]] = (
            asyncio.get_event_loop().create_future()
        )


_engine: KataGoEngine | None = None


def get_engine() -> KataGoEngine | None:
    return _engine


def set_engine(engine: KataGoEngine | None) -> None:
    global _engine
    _engine = engine
