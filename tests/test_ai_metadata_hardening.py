import re
import importlib
import asyncio


HEX_RE = re.compile(r"\b[a-f0-9]{16,}\b", re.I)


def test_ai_metadata_sanitizes_filename_noise():
    mod = importlib.import_module('api.routers.ai_metadata')
    AIMetadataRequest = mod.AIMetadataRequest

    noisy = (
        "456779837bc544b099e40d696cf87e1b "
        "5c3483534233349f7b27e9b16b5821ced stereo mix.wav"
    )

    # Call endpoint coroutine directly with a fake user (None is fine, dep not used)
    req = AIMetadataRequest(prompt=None, audio_filename=noisy, current_title=None, current_description=None, max_tags=20)
    # generate_episode_metadata is async; run it
    coro = getattr(mod, 'generate_episode_metadata')
    resp = asyncio.get_event_loop().run_until_complete(coro(req, None))  # type: ignore

    title = resp.title.lower()
    # Title should not include hashes or the phrase 'stereo mix'
    assert 'stereo mix' not in title
    assert HEX_RE.search(title) is None

    # Tags must be clean: no hex-like ids and ascii letters/numbers/spaces only
    for tag in resp.tags:
        assert HEX_RE.search(tag) is None
        assert len(tag) <= 30
        assert re.fullmatch(r"[A-Za-z0-9 ]+", tag) is not None
    # And limit to 20
    assert len(resp.tags) <= 20
