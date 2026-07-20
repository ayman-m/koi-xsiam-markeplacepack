#!/usr/bin/env python3
"""Record the follow-up probes run after the first sweep, so every claim in the
documents has a matching evidence entry.

The first sweep (sweep_commands.py) left gaps that the fact-check caught: two `view`
values were never probed, the search failure modes were only partly exercised, and
no authentication failure had been observed. This closes those gaps and writes
evidence/followup-probes.json.

Read-only. The invalid-key probe deliberately uses a junk token and can only fail.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from koi_api import API, KEYS, get, jload  # noqa: E402
from sweep_commands import post  # noqa: E402

ALL_VIEWS = [
    "agentic_ai", "ai_models", "all_items", "code_packages", "extensions",
    "mcp_servers", "os_packages", "repositories", "software",   # API-declared valid
    "browser_extensions", "ide_extensions", "packages",         # expected invalid
]

GOOD_FILTER = {"combinator": "and",
               "rules": [{"field": "risk_level", "operator": "=", "value": "high"}]}


def main():
    out = {"purpose": "Follow-up probes closing the gaps the adversarial fact-check "
                      "identified in the first sweep.",
           "date": "2026-07-20", "views": [], "search_failure_modes": [], "auth": [],
           "unfiltered_inventory": []}

    for inst, key in KEYS.items():
        if not key:
            continue

        # --- bare inventory total, twice, to evidence the drift -------------
        # command-sweep.json holds the earlier reading; these are the later ones.
        # Probed twice in-run to show the counts are stable within a run and only
        # move between runs (i.e. real inventory growth, not API instability).
        for attempt in (1, 2):
            s, raw = get(f"{API}/inventory", key, {"page": 1, "page_size": 1})
            d = jload(raw)
            out["unfiltered_inventory"].append({
                "instance": inst, "attempt_within_run": attempt, "status": s,
                "total_count": d.get("total_count") if isinstance(d, dict) else None,
            })
            print(f"  [{inst}] inventory (no view) attempt {attempt}: HTTP {s} "
                  f"total={out['unfiltered_inventory'][-1]['total_count']}")

        # --- every view value, probed individually -------------------------
        for v in ALL_VIEWS:
            s, raw = get(f"{API}/inventory", key, {"page": 1, "page_size": 1, "view": v})
            d = jload(raw)
            rec = {"instance": inst, "view": v, "status": s}
            if s == 200 and isinstance(d, dict):
                rec["total_count"] = d.get("total_count")
            else:
                rec["error"] = (raw or "")[:300]
            out["views"].append(rec)
            print(f"  [{inst}] view={v:20} HTTP {s} "
                  f"total={rec.get('total_count', '-')}")

        # --- the three search failure modes --------------------------------
        for label, body in [
            ("filter key omitted from request", {"page": 1, "page_size": 2}),
            ("empty filter object", {"page": 1, "page_size": 2, "filter": {}}),
            ("well-formed filter", {"page": 1, "page_size": 2, "filter": GOOD_FILTER}),
        ]:
            s, raw = post(f"{API}/inventory/search", key, body)
            d = jload(raw)
            out["search_failure_modes"].append({
                "instance": inst, "case": label, "request_body": body, "status": s,
                "total_count": d.get("total_count") if isinstance(d, dict) and s == 200 else None,
                "response": (raw or "")[:400],
            })
            print(f"  [{inst}] search: {label:32} HTTP {s}")

    # --- authentication failure --------------------------------------------
    s, raw = get(f"{API}/policies", "deliberately-invalid-key-for-documentation",
                 {"page": 1, "page_size": 1})
    out["auth"].append({"case": "invalid bearer token", "status": s,
                        "response": (raw or "")[:300]})
    print(f"  invalid bearer -> HTTP {s}")
    out["auth"].append({"case": "403 / blocked egress", "status": None,
                        "response": "NEVER OBSERVED from this machine. Any statement about "
                                    "403 semantics is unverified."})

    # The integration-side guard is a code fact, not an observed HTTP response.
    out["search_failure_modes"].append({
        "instance": None,
        "case": "command run with neither filter_json nor filter_raw_json_entry_id",
        "status": "no API call made",
        "response": "Koi.py raises DemistoException(\"Either 'filter_json' or "
                    "'filter_raw_json_entry_id' must be provided.\") before any request. "
                    "Source: Koi.py line 468. NOT executed through XSIAM — read from code.",
    })

    path = os.path.join(ROOT, "evidence", "followup-probes.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
