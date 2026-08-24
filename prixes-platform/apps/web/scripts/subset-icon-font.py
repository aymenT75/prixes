#!/usr/bin/env python
"""Regenerate public/fonts/material-symbols-outlined.woff2.

Every icon in the UI is a ligature in Google's "Material Symbols Outlined"
variable font. Serving it from fonts.googleapis.com made the icon set a network
dependency — on a cold or offline start the Android WebView painted each icon as
its raw ligature text and the layout snapped around once the download landed — so
the font is bundled instead. The full variable font is ~3.8 MB, which is a lot to
ship for ~120 icons, so this script subsets it down to the ligatures the source
actually references (~90 KB).

Run it after adding a new <Icon name="…"> that uses a ligature not already kept:

    pip install fonttools brotli
    python scripts/subset-icon-font.py

The candidate set is "every lowercase_snake_case string literal in src/ that is
also a glyph in the font". That is deliberately a superset — icon names reach
<Icon> through variables and object fields (BottomNav tabs, Thermometer bands,
account rows…), so scanning for `name="…"` alone would miss them.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts" / "material-symbols-outlined.woff2"
CSS_URL = (
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
    ":opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
LITERAL = re.compile(r"""["'`]([a-z][a-z0-9]*(?:_[a-z0-9]+)*)["'`]""")


def fetch(url: str) -> bytes:
    with urlopen(Request(url, headers={"User-Agent": UA})) as r:
        return r.read()


def main() -> int:
    from fontTools.ttLib import TTFont

    css = fetch(CSS_URL).decode()
    m = re.search(r"src: url\((\S+\.woff2)\)", css)
    if not m:
        print("could not find the woff2 URL in Google's stylesheet", file=sys.stderr)
        return 1

    full = ROOT / "public" / "fonts" / ".material-symbols-full.woff2"
    full.write_bytes(fetch(m.group(1)))
    glyphs = set(TTFont(full).getGlyphOrder())

    literals: set[str] = set()
    for path in (ROOT / "src").rglob("*"):
        if path.suffix in {".ts", ".tsx"}:
            literals |= {g.group(1) for g in LITERAL.finditer(path.read_text(encoding="utf-8"))}

    keep = sorted(literals & glyphs)
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(full),
            f"--output-file={OUT}",
            "--flavor=woff2",
            "--glyphs=" + ",".join(keep),
            # The letters the ligatures are built from must survive too.
            "--text=abcdefghijklmnopqrstuvwxyz_0123456789",
            "--layout-features+=liga,dlig,calt,rlig",
            # Without this, the liga lookups reachable from a–z drag every one of
            # the ~6600 icons back in and the subset saves nothing.
            "--no-layout-closure",
            "--no-hinting",
        ],
        check=True,
    )
    full.unlink()
    print(f"{len(keep)} ligatures kept -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
