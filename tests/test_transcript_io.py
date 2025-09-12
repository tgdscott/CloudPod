from pathlib import Path
import json

from api.services.audio.transcript_io import (
    write_working_json,
    write_nopunct_sidecar,
    load_transcript_json,
)


def test_transcript_io_writes_and_loads(tmp_path):
    transcripts_dir: Path = tmp_path / "transcripts"
    words = [
        {"start": 0.0, "end": 0.5, "word": "Hello,"},
        {"start": 0.5, "end": 1.0, "word": "world!"},
    ]
    log: list[str] = []

    # Act
    working_path = write_working_json(words, "sample_stem", transcripts_dir, log)
    nopunct_path = write_nopunct_sidecar(words, "sample_stem", transcripts_dir, log)

    # Assert: files exist
    assert working_path.exists()
    assert nopunct_path.exists()

    # working JSON length == 2 and contains punctuation
    with open(working_path, "r", encoding="utf-8") as fh:
        data_working = json.load(fh)
    assert isinstance(data_working, list)
    assert len(data_working) == 2
    assert data_working[0]["word"] == "Hello,"
    assert data_working[1]["word"] == "world!"

    # nopunct JSON length == 2 and words sanitized
    with open(nopunct_path, "r", encoding="utf-8") as fh:
        data_nopunct = json.load(fh)
    assert isinstance(data_nopunct, list)
    assert len(data_nopunct) == 2
    assert [w["word"] for w in data_nopunct] == ["Hello", "world"]

    # load_transcript_json returns list of dicts
    loaded = load_transcript_json(working_path)
    assert isinstance(loaded, list)
    assert isinstance(loaded[0], dict)
