"""Per-GPU worker pool — GPU box only.

Creates one AceStepEngine instance per visible CUDA device and dispatches
generate() calls round-robin across them (thread-safe).  Torch is imported
at module top because this module is only ever loaded on the GPU box.
"""

from __future__ import annotations

import threading
from typing import Callable

import torch

from app.serving.engine import Engine


class GpuEnginePool:
    """Round-robin pool of per-GPU engine instances.

    On a 4× L40S box with 4 visible CUDA devices, this creates 4 engine
    instances (one per ``cuda:N``), each with its own model weights in VRAM,
    and distributes incoming generate() calls evenly.

    Implements the Engine protocol by delegating to the pool members.

    Args:
        engine_factory: A callable that accepts a ``device`` kwarg (e.g.
            ``"cuda:0"``) and returns a fully-initialised Engine instance.
            Typically ``functools.partial(AceStepEngine, num_takes_cap=4)``.

    Example::

        import functools
        from app.serving.acestep_engine import AceStepEngine
        from app.serving.gpu_pool import GpuEnginePool

        pool = GpuEnginePool(
            engine_factory=functools.partial(AceStepEngine, num_takes_cap=4)
        )
        takes = pool.generate(req)
    """

    def __init__(self, engine_factory: Callable[..., Engine]) -> None:
        num_gpus = torch.cuda.device_count()
        if num_gpus == 0:
            raise RuntimeError(
                "GpuEnginePool requires at least one CUDA GPU, but "
                "torch.cuda.device_count() returned 0."
            )

        self._engines: list[Engine] = [
            engine_factory(device=f"cuda:{i}") for i in range(num_gpus)
        ]
        self._num_engines = len(self._engines)
        self._index = 0
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Engine Protocol
    # ------------------------------------------------------------------

    @property
    def engine_id(self) -> str:
        return self._engines[0].engine_id

    @property
    def engine_version(self) -> str:
        return self._engines[0].engine_version

    def generate(self, req: dict) -> list[dict]:
        """Forward *req* to the next engine in the round-robin sequence."""
        engine = self._next_engine()
        return engine.generate(req)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _next_engine(self) -> Engine:
        """Return the next engine index (thread-safe)."""
        with self._lock:
            engine = self._engines[self._index]
            self._index = (self._index + 1) % self._num_engines
        return engine
