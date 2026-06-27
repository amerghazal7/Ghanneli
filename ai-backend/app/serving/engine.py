"""Engine protocol — implemented by Task 2.3 (ACE-Step) and fakes in tests."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class Engine(Protocol):
    engine_id: str
    engine_version: str

    def generate(self, req: dict) -> list[dict]:
        """Generate takes from a request dict. Each returned dict has audioUri and durationSec."""
        ...
