"""One-off: turn the dish photos already on disk into 512 px WebP.

Photos drawn before shrinking existed are 1024 px (~700 KB). Each is rewritten as
`<key>.webp` and the original removed; `photo_for` looks a key up in any format,
so cards pick the new file up on their next request.

    docker exec prixes-platform-api-1 python scripts/shrink_meal_images.py
"""
from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.domains.mealplan.images import FORMATS, shrink

LIMIT = 100_000  # a stored 512 px WebP is ~35 KB; anything bigger predates shrinking


def main() -> None:
    before = after = 0
    for path in sorted(Path(settings.meal_image_dir).iterdir()):
        ext = path.suffix.lstrip(".")
        if ext not in FORMATS or path.stat().st_size <= LIMIT:
            continue
        small = shrink(path.read_bytes())
        if small is None:
            print(f"skipped {path.name}: unreadable")
            continue
        target = path.with_suffix(".webp")
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(small)
        before += path.stat().st_size
        after += len(small)
        tmp.replace(target)
        if target != path:
            path.unlink()
        print(f"{path.name} -> {target.name}: {len(small) // 1024} KB")
    print(f"total: {before // 1024} KB -> {after // 1024} KB")


if __name__ == "__main__":
    main()
