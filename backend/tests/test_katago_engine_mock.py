"""Verify KataGoEngine correlates JSONL responses by id and turnNumber."""
import asyncio
import json
from unittest.mock import patch

import pytest

from app.services.katago.engine import KataGoEngine


class _FakeStream:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._closed = False

    def feed(self, data: bytes) -> None:
        self._queue.put_nowait(data)

    def close(self) -> None:
        self._closed = True
        self._queue.put_nowait(b"")

    async def readline(self) -> bytes:
        return await self._queue.get()


class _FakeStdin:
    def __init__(self) -> None:
        self.lines: list[bytes] = []

    def write(self, data: bytes) -> None:
        self.lines.append(data)

    async def drain(self) -> None:
        pass


class _FakeProc:
    def __init__(self) -> None:
        self.stdin = _FakeStdin()
        self.stdout = _FakeStream()
        self.stderr = _FakeStream()
        self.returncode: int | None = None

    def terminate(self) -> None:
        self.returncode = 0
        self.stdout.close()
        self.stderr.close()

    def kill(self) -> None:
        self.terminate()

    async def wait(self) -> int:
        return 0


def test_analyze_correlates_responses():
    async def run():
        proc = _FakeProc()

        async def fake_create(*_a, **_kw):
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=fake_create):
            engine = KataGoEngine("katago", "cfg", "model")
            await engine.start()

            async def feed_when_ready():
                while not proc.stdin.lines:
                    await asyncio.sleep(0)
                req = json.loads(proc.stdin.lines[0])
                req_id = req["id"]
                for turn in (1, 0):  # interleaved order
                    proc.stdout.feed(
                        (
                            json.dumps(
                                {
                                    "id": req_id,
                                    "turnNumber": turn,
                                    "rootInfo": {"winrate": 0.5, "scoreLead": float(turn)},
                                    "moveInfos": [],
                                }
                            )
                            + "\n"
                        ).encode("utf-8")
                    )

            feeder = asyncio.create_task(feed_when_ready())
            result = await engine.analyze({"foo": "bar"}, expected_turns=[0, 1])
            await feeder

            assert set(result.keys()) == {0, 1}
            assert result[0]["rootInfo"]["scoreLead"] == 0.0
            assert result[1]["rootInfo"]["scoreLead"] == 1.0

            await engine.stop()

    asyncio.run(run())


def test_analyze_timeout_raises_without_killing_engine():
    async def run():
        proc = _FakeProc()

        async def fake_create(*_a, **_kw):
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=fake_create):
            engine = KataGoEngine("katago", "cfg", "model")
            await engine.start()

            # No response is ever fed; expect TimeoutError quickly.
            with pytest.raises(TimeoutError):
                await engine.analyze({"foo": "bar"}, expected_turns=[0], timeout=0.1)

            # Engine should still be usable afterwards.
            assert engine.is_alive()
            await engine.stop()

    asyncio.run(run())


def test_analyze_restarts_dead_process():
    async def run():
        first = _FakeProc()
        second = _FakeProc()
        procs = iter([first, second])

        async def fake_create(*_a, **_kw):
            return next(procs)

        with patch("asyncio.create_subprocess_exec", side_effect=fake_create):
            engine = KataGoEngine("katago", "cfg", "model")
            await engine.start()

            # Kill the first process (simulate crash).
            first.returncode = 1
            first.stdout.close()
            first.stderr.close()

            # Wait for the reader loop to observe the closed stdout.
            await asyncio.sleep(0.01)
            assert not engine.is_alive()

            async def feed_when_ready():
                while not second.stdin.lines:
                    await asyncio.sleep(0)
                req_id = json.loads(second.stdin.lines[0])["id"]
                second.stdout.feed(
                    (json.dumps({
                        "id": req_id, "turnNumber": 0,
                        "rootInfo": {"winrate": 0.5}, "moveInfos": [],
                    }) + "\n").encode("utf-8")
                )

            feeder = asyncio.create_task(feed_when_ready())
            # Next analyze() should auto-restart and succeed against `second`.
            result = await engine.analyze({"foo": "bar"}, expected_turns=[0])
            await feeder
            assert 0 in result
            assert engine.is_alive()

            await engine.stop()

    asyncio.run(run())
