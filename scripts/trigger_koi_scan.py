#!/usr/bin/env python3
"""Trigger a KOI scan on a Cortex-managed endpoint, via the Cortex XDR API.

Why this exists: KOI has **no resident agent on Windows** — it is run-on-demand,
so inventory is only reported when the KOI deployment script actually executes.
Both test hosts stopped producing events on 15 July for exactly that reason.
This is the same mechanism the ported "KOI Ext - Unified Script Runner" playbook
uses (resolve script by name -> uid, then run it on a target endpoint); doing it
over the XDR API here because integration commands cannot be executed on this
tenant (see VERIFIED_FACTS.md section 6).

Read-only by default: --list shows endpoints and scripts and changes nothing.
Running the scan requires an explicit --run, because it executes code on a live
endpoint.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import koi_tenant as t  # noqa: E402

KOI_WINDOWS_SCRIPT = "KOI Deployment Script - Windows"


def get_endpoints():
    s, raw = t.xdr("/endpoints/get_endpoints/", {"request_data": {}})
    d = t.jload(raw) or {}
    return s, (d.get("reply") or [])


def get_scripts():
    s, raw = t.xdr("/scripts/get_scripts/", {"request_data": {}})
    d = t.jload(raw) or {}
    rep = d.get("reply") or {}
    return s, (rep.get("scripts") if isinstance(rep, dict) else rep) or []


def resolve_script(name):
    """Resolve a script name to its uid — the same name->uuid step the playbook does."""
    _, scripts = get_scripts()
    hits = [x for x in scripts if x.get("name") == name]
    if not hits:
        return None, f"script named {name!r} not found in the library"
    if len(hits) > 1:
        return None, f"{len(hits)} scripts named {name!r} — ambiguous, pin the uid"
    return hits[0], None


def run_script(script_uid, agent_ids, timeout=600):
    body = {
        "request_data": {
            "script_uid": script_uid,
            "timeout": timeout,
            "filters": [
                {"field": "endpoint_id_list", "operator": "in", "value": agent_ids}
            ],
            "parameters_values": {},
        }
    }
    s, raw = t.xdr("/scripts/run_script/", body)
    return s, t.jload(raw), raw


def poll_status(action_id, tries=40, delay=15):
    """Poll the action until it leaves PENDING/IN_PROGRESS."""
    for i in range(tries):
        s, raw = t.xdr("/actions/get_action_status/",
                       {"request_data": {"group_action_id": action_id}})
        d = t.jload(raw) or {}
        status = (d.get("reply") or {}).get("data") or {}
        if status:
            vals = set(status.values())
            print(f"   [{i * delay:>4}s] {status}")
            if not (vals & {"PENDING", "IN_PROGRESS", "PENDING_ABORT"}):
                return status
        else:
            print(f"   [{i * delay:>4}s] HTTP {s} {raw[:160]}")
        time.sleep(delay)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="show endpoints and scripts, change nothing")
    ap.add_argument("--run", metavar="HOSTNAME", help="run the KOI scan on this endpoint")
    ap.add_argument("--script", default=KOI_WINDOWS_SCRIPT)
    ap.add_argument("--timeout", type=int, default=600)
    args = ap.parse_args()

    if args.list or not args.run:
        _, eps = get_endpoints()
        print("Endpoints:")
        for e in eps:
            print(f"   {str(e.get('host_name')):32} {str(e.get('agent_status')):12} "
                  f"{str(e.get('operational_status')):20} tags={e.get('tags', {}).get('server_tags')}")
        _, scripts = get_scripts()
        print("\nScripts mentioning KOI:")
        for x in scripts:
            if "koi" in str(x.get("name", "")).lower():
                print(f"   {x.get('name'):36} uid={x.get('script_uid')} "
                      f"win={x.get('windows_supported')} high_risk={x.get('is_high_risk')}")
        if not args.run:
            return

    _, eps = get_endpoints()
    target = [e for e in eps if e.get("host_name") == args.run]
    if not target:
        print(f"no endpoint named {args.run!r}")
        return
    ep = target[0]
    if ep.get("agent_status") != "CONNECTED":
        print(f"{args.run} is {ep.get('agent_status')} — the scan would queue, not run. Aborting.")
        return

    script, err = resolve_script(args.script)
    if err:
        print("ERROR:", err)
        return

    print(f"\nRunning {script['name']!r} (uid {script['script_uid']}) on "
          f"{ep['host_name']} ({ep['agent_id']}) …")
    s, d, raw = run_script(script["script_uid"], [ep["agent_id"]], args.timeout)
    print("run_script HTTP", s)
    if s != 200:
        print(raw[:600])
        return
    action_id = (d.get("reply") or {}).get("action_id")
    print("action_id:", action_id)
    final = poll_status(action_id)
    print("final status:", final)


if __name__ == "__main__":
    main()
