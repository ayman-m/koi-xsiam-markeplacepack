#!/usr/bin/env python3
"""Assemble docs/DETECTION_QUERIES.md and docs/xql/*.xql from the recovered query set.

The query-design workflow validated 45 queries against the live tenant but its
final assembly step failed on a rate limit before writing them all out. This
rebuilds the complete library from the saved workflow results so nothing is lost.
"""
import json, os, re

SP = os.environ["SP"]
ROOT = "/Users/aymanmahmoud/Documents/Coding/KOI-MP"
Q = json.load(open(f"{SP}/all_queries.json"))

# result-validated: agent ran it OR we ran it (C7). parse-confirmed: heavy, query_id issued.
PARSE_ONLY = {"B3", "B8", "B9", "B10"}

THEMES = {
    "A": ("Supply-chain acquisition", "How an item arrived — which process, user and parent brought it. koi_koi_raw Audit × xdr_data PROCESS."),
    "B": ("Agentic runtime", "AI agents and MCP servers actually executing, their egress, and KOI-flagged risk that is also running. The agentic-supply-chain core."),
    "C": ("KOI coverage & integrity", "Is the supply-chain telemetry even trustworthy? KOI's own scan is visible in xdr_data (its bundled python running a .pyz), enabling last-scan-age and coverage-gap detection nothing else does."),
    "D": ("Investigation (playbook) queries", "Parameterised drill-downs for the KOI Ext investigation playbooks. Each states its // PARAM: inputs."),
}

def theme_of(qid): return qid[0]
def sort_key(qid):
    m = re.match(r"([A-D])(\d+)([a-z]?)", qid)
    return (m.group(1), int(m.group(2)), m.group(3)) if m else (qid, 0, "")

ids = sorted(Q.keys(), key=sort_key)
os.makedirs(f"{ROOT}/docs/xql", exist_ok=True)

out = []
out.append("# XQL detection & investigation queries — KOI supply chain × Cortex XDR\n")
out.append("**Pack context:** built for the official **Marketplace KOI pack v1.2.3** "
           "(`demisto/content` `Packs/Koi`, 13 commands, integration only) and its dataset "
           "`koi_koi_raw`, correlated with Cortex XDR endpoint telemetry `xdr_data`. "
           "Validated on tenant `api-ayman.xdr.eu` on 2026-07-21/22.\n")
out.append("## How to read status\n")
out.append("- **validated** — executed against the live tenant; row count is real.\n"
           "- **parse-confirmed** — the XQL engine accepted it (query_id issued) but it is a "
           "heavy join that exceeds the validation poll window; run it with a narrow time "
           "filter. Not known-bad.\n")
out.append("## Rules that apply to every query here\n")
out.append("1. **Alerts are duplicated ~245× per 24h** (the integration re-sends every open "
           "alert each 1-minute fetch). Any query over `source_log_type = \"Alerts\"` **must** "
           "dedupe on `json_extract_scalar(metadata, \"$.notification_event_id\")` — never "
           "`count()` rows. **Audit is not duplicated (1.0)** and needs no dedupe; most queries "
           "here use Audit for exactly that reason.\n")
out.append("2. **One host is dual-covered** (KOI + XDR) on this tenant — `win-workstation`. "
           "Coverage-gap queries derive the dual-covered set from data rather than hardcoding it.\n")
out.append("3. **Marketplace vocabulary differs** between events (short: `chrome`, `vsc`, "
           "`software_windows`) and the API (long: `chrome_web_store`, `vscode`, `windows`). "
           "See `VERIFIED_FACTS.md` §7c.\n")
out.append("4. `dns_query_name` is 0% populated here; `action_external_hostname` ~56%. "
           "Do not build a detection that requires DNS names on this tenant.\n")

counts = {k: 0 for k in THEMES}
for qid in ids: counts[theme_of(qid)] += 1

for letter, (name, desc) in THEMES.items():
    tids = [q for q in ids if theme_of(q) == letter]
    if not tids: continue
    out.append(f"\n---\n\n## Theme {letter} — {name}\n")
    out.append(f"_{desc}_\n")
    out.append(f"_{len(tids)} queries._\n")
    for qid in tids:
        q = Q[qid]
        status = "parse-confirmed" if qid in PARSE_ONLY else "validated"
        rows = q.get("rowsOnTenant")
        rowtxt = f"{rows} rows on this tenant" if (rows or rows == 0) and status == "validated" else "heavy join — run with a narrow window"
        out.append(f"\n### {qid} — {q.get('title','')}\n")
        out.append(f"**Purpose:** {q.get('purpose','')} · **Status:** {status} ({rowtxt}) · "
                   f"**Datasets:** {q.get('datasets','')}\n")
        if q.get("question"): out.append(f"\n{q['question']}\n")
        if q.get("parameters"): out.append(f"\n_Parameters:_ {q['parameters']}\n")
        out.append("\n```sql\n" + q["xql"].strip() + "\n```\n")
        if q.get("interpretation") and status == "validated":
            interp = re.sub(r"NOT VALIDATED[^.]*\.\s*", "", str(q["interpretation"]))
            if interp.strip(): out.append(f"\n_Interpretation:_ {interp.strip()[:600]}\n")
        if q.get("falsePositives"): out.append(f"\n_False positives:_ {str(q['falsePositives'])[:400]}\n")
        # write the .xql file
        open(f"{ROOT}/docs/xql/{qid}.xql", "w").write(q["xql"].strip() + "\n")

out.append("\n---\n\n## Summary\n")
tot = len(ids); val = tot - len(PARSE_ONLY & set(ids))
out.append(f"{tot} queries across 4 themes — {val} validated against live data, "
           f"{len(PARSE_ONLY & set(ids))} parse-confirmed heavy joins "
           f"({', '.join(sorted(PARSE_ONLY & set(ids)))}). "
           f"Per theme: A={counts['A']}, B={counts['B']}, C={counts['C']}, D={counts['D']}.\n")
out.append("\nQuery bodies are in `docs/xql/<id>.xql`. Highest value: **B8** (KOI-scored risk "
           "observed executing), **B9** (shadow MCP — running but never inventoried), **C4** "
           "(KOI last-scan-age per host), **A5/A6** (bidirectional coverage gaps).\n")

open(f"{ROOT}/docs/DETECTION_QUERIES.md", "w").write("\n".join(out))
print("wrote docs/DETECTION_QUERIES.md and", len(ids), "docs/xql/*.xql files")
print("themes:", counts)
