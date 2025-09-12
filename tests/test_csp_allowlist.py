import re
from fastapi.testclient import TestClient


def test_csp_allows_core_sources(client: TestClient):
    """CSP should include core-safe sources we rely on:
    - default-src 'self'
    - img-src allows data:
    - media-src allows blob:
    - connect-src allows https:
    The exact policy string can evolve; this test asserts presence of required tokens
    and emits a helpful message if missing.
    """
    r = client.get('/api/health')
    assert r.status_code == 200
    csp = r.headers.get('Content-Security-Policy', '')

    missing = []
    def require(pattern: str, hint: str):
        if not re.search(pattern, csp):
            missing.append(hint)

    # Core requirements matching current middleware defaults
    require(r"default-src\s+'self'", "default-src must include 'self'")
    require(r"img-src[^;]*\sdata:", "img-src must include data:")
    require(r"media-src[^;]*\sblob:", "media-src must include blob:")
    require(r"connect-src[^;]*\shttps:", "connect-src must allow https: for APIs and CDNs")

    # Optional: if your frontend references external fonts/CDNs, assert here. Keep non-fatal to avoid flakes.
    # Example patterns (commented until such CDNs are actually used):
    # require(r"script-src[^;]*\shttps://cdn\.jsdelivr\.net", "script-src should allow jsDelivr if used")
    # require(r"style-src[^;]*\s'https://fonts\.googleapis\.com'", "style-src should allow Google Fonts if used")

    assert not missing, (
        "CSP missing required sources: " + ", ".join(missing) +
        f"\nCurrent CSP: {csp or '(empty)'}\n"
    )
