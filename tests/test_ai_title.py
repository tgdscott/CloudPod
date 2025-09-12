from typing import List
import importlib
import types


def test_title_series_prefix_detection(monkeypatch):
    mod = importlib.import_module('api.services.ai_content.generators.title')

    # Stub history to simulate existing titles with E### – pattern
    def fake_recent(_podcast_id, n=10) -> List[str]:
        return [
            "E3 – Something Old",
            "E2 – Another",
        ]

    monkeypatch.setattr(mod, 'get_recent_titles', fake_recent)

    # Stub generate() to return a simple base title without prefix
    monkeypatch.setattr(mod, 'generate', lambda prompt, max_tokens=None: "A fresh episode title")

    Inp = importlib.import_module('api.services.ai_content.schemas').SuggestTitleIn
    out = mod.suggest_title(Inp(episode_id='11111111-1111-1111-1111-111111111111', podcast_id='22222222-2222-2222-2222-222222222222', transcript_path=None, extra_instructions=None, base_prompt=None, history_count=5))

    assert out.title.startswith("E") and " – " in out.title
