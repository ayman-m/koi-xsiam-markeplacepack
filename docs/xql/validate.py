#!/usr/bin/env python3
"""Validate XQL files. usage: run.py <hours> <file...>  -> prints per-file verdict."""
import json, sys, time, random, os
sys.path.insert(0, '/Users/aymanmahmoud/Documents/Coding/KOI-MP/scripts')
import koi_tenant as t

def run(q, hours=24, label=""):
    body = {"request_data": {"query": q, "timeframe": {"relativeTime": int(hours*3600*1000)}}}
    for attempt in range(25):
        st, raw = t.xdr("/xql/start_xql_query/", body)
        if st == 200:
            break
        if 'parallel running queries' in raw or 'quota' in raw.lower():
            if 'quota' in raw.lower() and 'parallel' not in raw:
                return ("QUOTA", raw[:300], None)
            time.sleep(8 + random.random()*8); continue
        return ("PARSE_FAIL", raw[:900], None)
    else:
        return ("CONCURRENCY_GAVEUP", "", None)
    qid = (t.jload(raw) or {}).get("reply")
    for i in range(120):
        st, raw = t.xdr("/xql/get_query_results/", {"request_data": {"query_id": qid, "limit": 20}})
        r = (t.jload(raw) or {}).get("reply", {})
        s = r.get("status")
        if s == "SUCCESS":
            data = (r.get("results") or {}).get("data") or []
            return ("OK", r.get("number_of_results"), data)
        if s in ("FAIL", "FAILED", "CANCELLED"):
            return ("RUN_FAIL", json.dumps(r.get("error"), default=str)[:900], None)
        time.sleep(2)
    return ("TIMEOUT", "", None)

if __name__ == '__main__':
    hours = float(sys.argv[1])
    for f in sys.argv[2:]:
        q = open(f).read()
        verdict, info, data = run(q, hours, f)
        name = os.path.basename(f)
        if verdict == "OK":
            print(f"{name}\tOK\trows={info}")
            if data:
                print("   sample:", json.dumps(data[0], default=str)[:400])
        else:
            print(f"{name}\t{verdict}\t{info}")
        sys.stdout.flush()
