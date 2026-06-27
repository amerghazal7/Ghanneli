"""GPU smoke test for AceStepEngine.

On a non-GPU host (CI, dev machine): torch is absent → importorskip skips
the entire module cleanly — no collection error, no failure.

On the L40S (torch + CUDA + ACE-Step installed): the test runs for real.
"""

import pytest

torch = pytest.importorskip("torch")  # whole module SKIPS cleanly if torch absent (CI)

pytestmark = [
    pytest.mark.gpu,
    pytest.mark.skipif(not torch.cuda.is_available(), reason="no GPU"),
]


def test_acestep_smoke():
    from app.serving.acestep_engine import AceStepEngine

    eng = AceStepEngine(num_takes_cap=1)
    takes = eng.generate(
        {
            "taggedLyrics": "[verse] اختبار",
            "transliteration": "ikhtibar",
            "styleTags": ["ballad"],
            "dialect": "egyptian",
            "genre": "ballad",
            "voiceGender": "male",
            "durationSec": 15,
            "numTakes": 1,
        }
    )
    assert takes and takes[0]["audioUri"].endswith(".wav")
