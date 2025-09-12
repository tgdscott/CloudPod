from typing import List

from api.services.ai_content.generators.tags import _post_process


def test_tags_postprocess_constraints():
    always = [
        "AI ",  # case + trailing space -> lower, trim
        "very-very-very-very-very-very-long-tag-name-that-should-be-truncated",
        "ai",  # duplicate after sanitize; should be deduped
    ]
    raw: List[str] = [
        "  Cloud  AI  Tools  ",  # whitespace collapse
        "AI",  # duplicate
        "python", "python",  # dupes
        "data engineering",
        "MACHINE   LEARNING",
        "nlp/nlu",  # punctuation removed
        " edge-cases   and   stuff  ",
        "#hashtag",  # hash removed
    ] + [f"tag{i}" for i in range(1, 50)]  # overflow beyond 20

    out = _post_process(raw, always)

    # always include are first (after sanitize)
    assert out[0] == "ai"
    # truncation to 30 chars applied
    assert all(len(t) <= 30 for t in out)
    # dedupe preserving order and no empties
    assert len(out) == len(list(dict.fromkeys(out)))
    assert all(t.strip() for t in out)
    # cap at 20 tags
    assert len(out) <= 20
