"""KoiScanTracker — endpoint scan-coverage ledger for the Koi Script Runner.

Owns a compact CSV List (endpoint_id,last_scan-epoch) and all the date logic, so the
Script Runner playbooks stay thin. Action-dispatched:

  action=refresh  walk the group by first_seen (100/call) and append-only upsert ids
  action=select   return up to `max` due, currently-connected endpoint ids
  action=mark     stamp last_scan=now for the given ids (mark-on-dispatch)

The 100-endpoint cap of core-get-endpoints only bites in `refresh`, handled by a
first_seen cursor loop. `select` reads candidates from the tracker (no re-enumeration)
and only does a targeted connected-check on the <=100 it returns.
"""
import io
import csv
import time
import json
# Self-contained: relies only on the `demisto` global the platform injects at runtime.
# No demistomock / CommonServerPython import, so it runs from a raw pack upload without
# the demisto-sdk prepare-content (unify) step that would otherwise inline those libs.

def _is_error(res):
    return isinstance(res, list) and any(isinstance(e, dict) and e.get("Type") == 4 for e in res)

def _error_text(res):
    return "; ".join(str(e.get("Contents")) for e in res if isinstance(e, dict) and e.get("Type") == 4)

def _arg_list(v):
    if not v:
        return []
    if isinstance(v, list):
        return v
    return [x.strip() for x in str(v).split(",") if x.strip()]

def _md_result(readable, outputs_key, outputs):
    return {"Type": 1, "ContentsFormat": "json", "Contents": outputs,
            "HumanReadable": readable, "EntryContext": {outputs_key: outputs}}

HEADER = ["endpoint_id", "last_scan"]

# ----------------------------- pure logic (unit-tested) -----------------------------

def parse_tracker(text):
    rows = {}
    if not text or not text.strip():
        return rows
    for r in csv.reader(io.StringIO(text.strip())):
        if not r or not r[0].strip() or r[0].strip() == "endpoint_id":
            continue
        eid = r[0].strip()
        ls = 0
        if len(r) > 1 and r[1].strip():
            try:
                ls = int(float(r[1].strip()))
            except ValueError:
                ls = 0
        rows[eid] = ls
    return rows


def emit_tracker(rows):
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(HEADER)
    for eid in sorted(rows):
        w.writerow([eid, rows[eid]])
    return out.getvalue()


def upsert_members(rows, endpoint_ids):
    added = 0
    for eid in endpoint_ids:
        if eid and eid not in rows:
            rows[eid] = 0
            added += 1
    return rows, added


def compute_due(rows, candidate_ids, interval_hours, now_epoch, max_n):
    thresh = now_epoch - int(interval_hours) * 3600
    due = []
    for eid in candidate_ids:
        ls = rows.get(eid)
        if ls is None or ls == 0 or ls <= thresh:
            due.append((ls or 0, eid))
    due.sort()
    return [eid for _, eid in due[:max_n]]


def mark_scanned(rows, endpoint_ids, now_epoch):
    for eid in endpoint_ids:
        if eid:
            rows[eid] = now_epoch
    return rows


# ----------------------------- demisto glue -----------------------------

def get_list(name):
    res = demisto.executeCommand("getList", {"listName": name})
    if not res or _is_error(res):
        return ""
    contents = res[0].get("Contents")
    if not isinstance(contents, str) or contents.startswith("Item not found"):
        return ""
    return contents


def set_list(name, text):
    res = demisto.executeCommand("setList", {"listName": name, "listData": text})
    if _is_error(res):
        err = _error_text(res)
        if "not found" in err.lower():                 # setList can't create — create it
            c = demisto.executeCommand("createList", {"listName": name, "listData": text})
            if _is_error(c):
                raise Exception("createList failed: " + _error_text(c))
        else:
            raise Exception("setList failed: " + err)


def _eid(ep):
    return ep.get("endpoint_id") or ep.get("id") or ep.get("agent_id")


def get_endpoints_cmd(args):
    """Targeted lookup via the core-get-endpoints COMMAND (<=100 ids). Used by `select`
    for the connected-check — NOT for enumeration (the command cannot page past 100)."""
    res = demisto.executeCommand("core-get-endpoints", args)
    if _is_error(res):
        raise Exception("core-get-endpoints failed: " + _error_text(res))
    out = []
    for entry in res:
        c = entry.get("Contents")
        if isinstance(c, dict):
            c = c.get("endpoints") or c.get("data") or [c]
        if isinstance(c, list):
            out.extend(c)
    return out


def enumerate_group(group_name, os_platform):
    """Full roster via the raw endpoints API, paged search_from/search_to in 100-row
    windows (the only mechanism that pages past 100 — the command caps at 100). Bridged
    through the Core REST API integration's core-api-post, which reaches /public_api."""
    filters = []
    if group_name:
        filters.append({"field": "group_name", "operator": "in", "value": [group_name]})
    if os_platform:
        filters.append({"field": "platform", "operator": "in", "value": [os_platform]})

    ids, frm, total = [], 0, None
    while frm < 200000:  # hard backstop
        rd = {"search_from": frm, "search_to": frm + 100,
              "sort": {"field": "first_seen", "keyword": "asc"}}
        if filters:
            rd["filters"] = filters
        res = demisto.executeCommand("core-api-post", {
            "uri": "/public_api/v1/endpoints/get_endpoint/",
            "body": json.dumps({"request_data": rd})})
        if _is_error(res):
            raise Exception("core-api-post failed: " + _error_text(res))
        contents = res[0].get("Contents") if res else {}
        if isinstance(contents, str):
            try:
                contents = json.loads(contents)
            except Exception:
                contents = {}
        reply = ((contents.get("response") or {}).get("reply")) if isinstance(contents, dict) else {}
        reply = reply or {}
        batch = reply.get("endpoints") or []
        total = reply.get("total_count", total)
        ids.extend(_eid(e) for e in batch if _eid(e))
        if len(batch) < 100:
            break
        frm += 100
        if total is not None and frm >= total:
            break
    return ids


# ----------------------------- actions -----------------------------

def action_refresh(a):
    list_name = a["tracker_list"]
    os_platform = str(a["endpoint_os"]).lower() if a.get("endpoint_os") else ""
    rows = parse_tracker(get_list(list_name))
    collected = enumerate_group(a.get("group_name"), os_platform)
    rows, added = upsert_members(rows, collected)
    set_list(list_name, emit_tracker(rows))
    return _md_result(
        f"Refreshed **{list_name}**: {len(collected)} group endpoints seen; "
        f"{added} new added; {len(rows)} total tracked.",
        "KoiScanTracker.Refresh",
        {"tracker_list": list_name, "seen": len(collected), "added": added, "total": len(rows)})


def action_select(a):
    list_name = a["tracker_list"]
    interval_hours = int(a.get("rescan_interval_hours") or 720)
    max_n = int(a.get("max") or 100)
    now = int(time.time())
    rows = parse_tracker(get_list(list_name))

    due = compute_due(rows, list(rows.keys()), interval_hours, now, max_n)
    connected = []
    if due:
        q = {"endpoint_id_list": ",".join(due), "status": "connected", "isolate": "unisolated"}
        present = {_eid(e) for e in get_endpoints_cmd(q)}
        connected = [eid for eid in due if eid in present]

    return _md_result(
        f"**{list_name}**: {len(rows)} tracked, {len(due)} due, "
        f"{len(connected)} due & connected (interval {interval_hours}h).",
        "KoiScanTracker.Select",
        {"tracker_list": list_name, "due_connected": connected,
         "due_count": len(due), "connected_count": len(connected)})


def action_mark(a):
    list_name = a["tracker_list"]
    ids = _arg_list(a.get("endpoint_ids"))
    now = int(time.time())
    rows = parse_tracker(get_list(list_name))
    mark_scanned(rows, ids, now)
    set_list(list_name, emit_tracker(rows))
    return _md_result(
        f"Marked {len(ids)} endpoint(s) scanned at {now} in **{list_name}**.",
        "KoiScanTracker.Mark",
        {"tracker_list": list_name, "marked": len(ids), "at": now})


def main():
    a = demisto.args()
    action = a.get("action")
    try:
        if action == "refresh":
            demisto.results(action_refresh(a))
        elif action == "select":
            demisto.results(action_select(a))
        elif action == "mark":
            demisto.results(action_mark(a))
        else:
            raise ValueError("unknown action: %r (expected refresh|select|mark)" % action)
    except Exception as e:  # noqa
        demisto.results({"Type": 4, "ContentsFormat": "text",
                         "Contents": "KoiScanTracker [%s] failed: %s" % (action, e)})


main()
