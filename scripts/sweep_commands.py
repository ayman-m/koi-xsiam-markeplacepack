#!/usr/bin/env python3
"""Sweep every read-only endpoint behind the Marketplace pack's 13 commands.

Writes full raw responses to evidence/raw/ (git-ignored — they contain real
hostnames and installed-software inventory) and a structural, non-identifying
summary to evidence/command-sweep.json, which is safe to commit.

GET/POST-search only. No endpoint here mutates KOI state.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from koi_api import API, KEYS, get, jload, shape  # noqa: E402
from koi_api import BASE_URL, CTX  # noqa: E402

import ssl  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402

RAW_DIR = os.path.join(ROOT, "evidence", "raw")
os.makedirs(RAW_DIR, exist_ok=True)


def post(path, key, body, timeout=90):
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def record(results, inst, command, method, path, params, status, raw, note=""):
    doc = jload(raw)
    entry = {
        "command": command,
        "instance": inst,
        "http": f"{method} {path}",
        "params": params,
        "status": status,
        "note": note,
    }
    if status == 200 and doc is not None:
        entry["response_shape"] = shape(doc)
        entry["top_level_keys"] = sorted(doc.keys()) if isinstance(doc, dict) else None
        for k in ("total_count", "total", "count"):
            if isinstance(doc, dict) and k in doc:
                entry["total_count"] = doc[k]
        # record the field names of the first record, never the values
        for k in ("policies", "items", "endpoints", "alerts", "data", "results"):
            if isinstance(doc, dict) and isinstance(doc.get(k), list) and doc[k]:
                entry["collection_key"] = k
                entry["returned"] = len(doc[k])
                if isinstance(doc[k][0], dict):
                    entry["record_fields"] = sorted(doc[k][0].keys())
                break
        fn = f"{inst}__{command}.json"
        with open(os.path.join(RAW_DIR, fn), "w") as fh:
            json.dump(doc, fh, indent=1, default=str)
        entry["raw_evidence"] = f"evidence/raw/{fn}"
    else:
        entry["error_body"] = raw[:600]
    results.append(entry)
    flag = "ok " if status == 200 else "ERR"
    extra = entry.get("total_count", entry.get("returned", ""))
    print(f"  [{flag}] {command:34} HTTP {status:<4} total={extra}")
    return doc


def main():
    results = []
    for inst, key in KEYS.items():
        if not key:
            print(f"{inst}: no API key in .env — skipped")
            continue
        print(f"\n=== {inst} ===")

        # --- policies -----------------------------------------------------
        record(results, inst, "koi-policy-list", "GET", f"{API}/policies",
               {"page": 1, "page_size": 50},
               *get(f"{API}/policies", key, {"page": 1, "page_size": 50}))

        # koi-policy-status-update is PUT /policies/{id} — mutating, not swept.
        results.append({"command": "koi-policy-status-update", "instance": inst,
                        "http": f"PUT {API}/policies/{{id}}", "status": "NOT RUN",
                        "note": "Mutating (PUT enabled=true|false). Deliberately not "
                                "executed against a live tenant."})

        # --- allowlist / blocklist ----------------------------------------
        record(results, inst, "koi-allowlist-get", "GET", f"{API}/policies/allowlist",
               None, *get(f"{API}/policies/allowlist", key))
        record(results, inst, "koi-blocklist-get", "GET", f"{API}/policies/blocklist",
               None, *get(f"{API}/policies/blocklist", key))
        for c in ("koi-allowlist-items-add", "koi-allowlist-items-remove",
                  "koi-blocklist-items-add", "koi-blocklist-items-remove"):
            results.append({"command": c, "instance": inst, "status": "NOT RUN",
                            "note": "Mutating governance write. Deliberately not executed."})

        # --- inventory ----------------------------------------------------
        inv = record(results, inst, "koi-inventory-list", "GET", f"{API}/inventory",
                     {"page": 1, "page_size": 50},
                     *get(f"{API}/inventory", key, {"page": 1, "page_size": 50}))

        # the documented 'view' values, to find out which are real
        for view in ("browser_extensions", "ide_extensions", "mcp_servers",
                     "software", "packages"):
            s, raw = get(f"{API}/inventory", key, {"page": 1, "page_size": 1, "view": view})
            d = jload(raw)
            tot = d.get("total_count") if isinstance(d, dict) else None
            results.append({"command": "koi-inventory-list", "instance": inst,
                            "http": f"GET {API}/inventory", "params": {"view": view},
                            "status": s, "total_count": tot,
                            "note": f"view={view} probe"})
            print(f"  [{'ok ' if s == 200 else 'ERR'}] view={view:20} HTTP {s} total={tot}")

        # --- inventory search (POST) --------------------------------------
        body = {"page": 1, "page_size": 5, "filter": {}}
        record(results, inst, "koi-inventory-search", "POST", f"{API}/inventory/search",
               body, *post(f"{API}/inventory/search", key, body))

        # --- item-scoped commands need a real item triple ------------------
        item = None
        if isinstance(inv, dict):
            for it in (inv.get("items") or []):
                if it.get("item_id") and it.get("marketplace") and (
                        it.get("item_version") or it.get("version")):
                    item = it
                    break
        if item:
            iid = item["item_id"]
            mkt = item["marketplace"]
            ver = item.get("item_version") or item.get("version")
            p = {"marketplace": mkt, "version": ver}
            record(results, inst, "koi-inventory-item-get", "GET",
                   f"{API}/inventory/{{item_id}}", p,
                   *get(f"{API}/inventory/{iid}", key, p),
                   note="item triple taken from the first inventory record")
            p2 = dict(p, page=1, page_size=50)
            record(results, inst, "koi-inventory-item-endpoints-list", "GET",
                   f"{API}/inventory/{{item_id}}/endpoints", p2,
                   *get(f"{API}/inventory/{iid}/endpoints", key, p2))
        else:
            for c in ("koi-inventory-item-get", "koi-inventory-item-endpoints-list"):
                results.append({"command": c, "instance": inst, "status": "SKIPPED",
                                "note": "no inventory record carried a full "
                                        "(item_id, marketplace, version) triple"})
                print(f"  [--] {c:34} skipped — no usable item triple")

        # --- events --------------------------------------------------------
        record(results, inst, "koi-get-events (Alerts)", "GET", f"{API}/alerts",
               {"page": 1, "page_size": 10},
               *get(f"{API}/alerts", key, {"page": 1, "page_size": 10}))
        record(results, inst, "koi-get-events (Audit)", "GET", f"{API}/audit-logs",
               {"page": 1, "page_size": 10},
               *get(f"{API}/audit-logs", key, {"page": 1, "page_size": 10}))

    out = os.path.join(ROOT, "evidence", "command-sweep.json")
    with open(out, "w") as fh:
        json.dump(results, fh, indent=1, default=str)
    print(f"\nwrote {out} ({len(results)} records)")


if __name__ == "__main__":
    main()
