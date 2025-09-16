import os

os.environ.setdefault("CSP_EXTRA_HOSTS", "https://api.getpodcastplus.com")

# Reproduce the middleware's CSP-building logic locally so we can validate
# the exact header string without importing the package (package name and
# path contain hyphens on disk which makes imports brittle here).

extra_hosts = os.getenv("CSP_EXTRA_HOSTS", "")
extra_connect = []
extra_style = []
extra_font = []
for h in [x.strip() for x in extra_hosts.split(",") if x.strip()]:
    extra_connect.append(h)
    extra_style.append(h)
    extra_font.append(h)

extra_style += ["https://fonts.googleapis.com"]
extra_font += ["https://fonts.gstatic.com"]

style_extra = (" " + " ".join(extra_style)) if extra_style else ""
connect_extra = (" " + " ".join(extra_connect)) if extra_connect else ""
font_extra = (" " + " ".join(extra_font)) if extra_font else ""

default_csp = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "img-src 'self' data:; "
    f"style-src 'self' 'unsafe-inline'{style_extra}; "
    "script-src 'self'; "
    f"connect-src 'self'{connect_extra}; "
    f"font-src 'self' data:{font_extra}; "
    "object-src 'none'"
)

print(default_csp)
print('\n--- debug ---')
print(repr(default_csp))
print('\nlength:', len(default_csp))
