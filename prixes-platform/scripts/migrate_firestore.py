"""Migrate Prixes data from Firestore → PostgreSQL (idempotent).

Usage:
    # 1. Export from Firestore with the Admin SDK (service account JSON):
    GOOGLE_APPLICATION_CREDENTIALS=sa.json python scripts/migrate_firestore.py export --out dump.json
    # 2. Load into Postgres (uses apps/api settings / DATABASE_URL):
    python scripts/migrate_firestore.py load --in dump.json

Field mapping (old Firestore → new schema):
    deals.vOui/vNon          → deals.votes_up/votes_down
    deals.author/ini         → users.username/initials
    users.rep                → users.reputation
    users.dealsCount         → users.deals_count
    users.totalVotes         → users.votes_received
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

# --- Export side (run where firebase-admin + credentials are available) --------


def export_firestore(out: Path) -> None:
    import firebase_admin
    from firebase_admin import firestore

    firebase_admin.initialize_app()
    db = firestore.client()

    def dump(collection: str) -> list[dict[str, Any]]:
        return [{"id": d.id, **d.to_dict()} for d in db.collection(collection).stream()]

    data = {
        "users": dump("users"),
        "deals": dump("deals"),
        "votes": dump("votes"),
    }
    out.write_text(json.dumps(data, default=str, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(data['users'])} users, {len(data['deals'])} deals, "
          f"{len(data['votes'])} votes → {out}")


# --- Load side (uses the API's SQLAlchemy models) ------------------------------


def _to_dt(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / (1000 if value > 1e12 else 1), tz=UTC)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(UTC)


async def load_postgres(path: Path) -> None:
    # Imported lazily so `export` works without the API deps installed.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
    from app.core.db import SessionLocal  # type: ignore
    from app.core.ranking import hot_score  # type: ignore
    from app.domains.deals.models import Deal, Vote  # type: ignore
    from app.domains.users.models import User  # type: ignore

    data = json.loads(path.read_text(encoding="utf-8"))
    fid_to_uuid: dict[str, uuid.UUID] = {}

    async with SessionLocal() as db:
        # Users
        for u in data["users"]:
            uid = uuid.uuid4()
            fid_to_uuid[u["id"]] = uid
            db.add(
                User(
                    id=uid,
                    email=(u.get("email") or f"{u['id']}@migrated.prixes").lower(),
                    username=u.get("username") or u.get("author") or "user",
                    initials=(u.get("ini") or "??")[:4],
                    reputation=int(u.get("rep", 0)),
                    deals_count=int(u.get("dealsCount", 0)),
                    votes_received=int(u.get("totalVotes", 0)),
                    is_verified=True,
                )
            )
        await db.flush()

        # Deals
        for d in data["deals"]:
            author_id = fid_to_uuid.get(d.get("authorId"))
            if author_id is None:  # author missing → create a placeholder user
                author_id = uuid.uuid4()
                fid_to_uuid[d.get("authorId", str(uuid.uuid4()))] = author_id
                db.add(
                    User(
                        id=author_id,
                        email=f"{author_id}@migrated.prixes",
                        username=d.get("author", "user"),
                        initials=(d.get("ini") or "??")[:4],
                        is_verified=True,
                    )
                )
            created = _to_dt(d.get("createdAt"))
            up, down = int(d.get("vOui", 0)), int(d.get("vNon", 0))
            db.add(
                Deal(
                    id=uuid.uuid4(),
                    author_id=author_id,
                    title=d.get("title", "Deal"),
                    store=d.get("store"),
                    price_now=Decimal(str(d.get("priceNow", 0))),
                    price_before=Decimal(str(d.get("priceBefore", 0))),
                    photo_url=d.get("photo"),
                    link=d.get("link"),
                    votes_up=up,
                    votes_down=down,
                    score=hot_score(up, down, created),
                    created_at=created,
                )
            )
        await db.commit()
    print("Load complete. Warm Redis feeds next (zadd from deals.score).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Firestore → Postgres migration")
    sub = parser.add_subparsers(dest="cmd", required=True)
    exp = sub.add_parser("export")
    exp.add_argument("--out", type=Path, default=Path("dump.json"))
    ld = sub.add_parser("load")
    ld.add_argument("--in", dest="inp", type=Path, default=Path("dump.json"))
    args = parser.parse_args()

    if args.cmd == "export":
        export_firestore(args.out)
    else:
        asyncio.run(load_postgres(args.inp))


if __name__ == "__main__":
    main()
