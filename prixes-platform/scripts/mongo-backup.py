"""Export / restore the Prixes document database (MongoDB Atlas).

Atlas's free tier (M0) has no backup of any kind: the weekly menus, imported
recipes and assistant drafts would simply be gone after a mistake. This exports
them alongside the nightly Postgres dumps, so they are also covered by the
DigitalOcean backups of the droplet.

It runs inside the API image, which already has pymongo and the connection
string (MONGO_URL / MONGO_DB) — no credential ever passes through the shell.
Driven by backup-db.sh and restore-mongo.sh; not meant to be run by hand:

    export   writes a .tar.gz to stdout
    restore  reads a .tar.gz from stdin

Archive layout: manifest.json (database, date, document count per collection)
and one <collection>.bson per collection — plain concatenated BSON documents,
so every type (ObjectId, dates, Decimal128) survives the round trip exactly,
which JSON would not guarantee.
"""
from __future__ import annotations

import io
import json
import os
import sys
import tarfile
from datetime import UTC, datetime

import bson
from pymongo import MongoClient


def _client() -> tuple[MongoClient, str]:
    url = os.environ.get("MONGO_URL", "")
    if not url:
        sys.exit("MONGO_URL is not set — nothing to back up.")
    return MongoClient(url, serverSelectionTimeoutMS=15000, tz_aware=True), os.environ.get(
        "MONGO_DB", "prixes"
    )


def export() -> None:
    client, db_name = _client()
    db = client[db_name]
    manifest: dict = {
        "database": db_name,
        "exported_at": datetime.now(UTC).isoformat(),
        "collections": {},
    }
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in sorted(db.list_collection_names()):
            if name.startswith("system."):
                continue
            payload = b"".join(bson.encode(doc) for doc in db[name].find({}).sort("_id", 1))
            count = db[name].count_documents({})
            manifest["collections"][name] = count
            info = tarfile.TarInfo(f"{name}.bson")
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))
        raw = json.dumps(manifest, indent=2).encode()
        info = tarfile.TarInfo("manifest.json")
        info.size = len(raw)
        tar.addfile(info, io.BytesIO(raw))
    client.close()
    sys.stdout.buffer.write(buf.getvalue())


def restore() -> None:
    # Read and decode EVERYTHING before touching the database: a truncated or
    # corrupt archive must fail here, not after half the collections are emptied.
    data = sys.stdin.buffer.read()
    if not data:
        sys.exit("Empty input — nothing to restore.")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        member = tar.extractfile("manifest.json")
        if member is None:
            sys.exit("Not a mongo-backup archive: manifest.json is missing.")
        manifest = json.load(member)
        collections: dict[str, list] = {}
        for name, expected in manifest["collections"].items():
            f = tar.extractfile(f"{name}.bson")
            docs = bson.decode_all(f.read()) if f else []
            if len(docs) != expected:
                sys.exit(f"{name}: archive holds {len(docs)} documents, manifest says {expected}.")
            collections[name] = docs

    client, _ = _client()
    # MONGO_RESTORE_DB lets a restore be rehearsed into a throwaway database.
    target = os.environ.get("MONGO_RESTORE_DB") or manifest["database"]
    db = client[target]
    print(f"Restoring into database « {target} » (export of {manifest['exported_at']})")
    for name, docs in collections.items():
        # delete_many, not drop: the collection keeps its indexes (TTL on the
        # drafts, the one-plan-per-week unique index), so nothing needs rebuilding.
        db[name].delete_many({})
        if docs:
            db[name].insert_many(docs, ordered=True)
        print(f"  {name:<22} {db[name].count_documents({}):>6} documents")
    client.close()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "export":
        export()
    elif mode == "restore":
        restore()
    else:
        sys.exit("usage: mongo-backup.py export|restore")
