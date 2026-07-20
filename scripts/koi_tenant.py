#!/usr/bin/env python3
"""Read-only client for verifying the Marketplace KOI pack on a live Cortex XSIAM tenant.

Reads credentials from .env (never printed). Two channels:

  * XSOAR-compatible API (/xsoar/public/v1/...) — list integration instances,
    run integration commands synchronously in the playground.
  * XDR public API (/public_api/v1/...) — XQL, to settle the dataset-name question.

Only read-only commands are exposed by default. The four mutating KOI commands
(allowlist/blocklist add/remove) are refused unless --allow-mutating is passed,
because they change a real tenant's security posture.
"""

import hashlib
import json
import os
import secrets
import ssl
import string
import sys
import time
import urllib.error
import urllib.request

# "advanced" (nonce+timestamp+sha256) or "standard" (raw key). Probed at startup.
AUTH_MODE = os.environ.get("CORTEX_AUTH_MODE", "advanced")

ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")

# Commands that write to the KOI tenant. Never run without an explicit opt-in.
MUTATING = {
    "koi-allowlist-items-add",
    "koi-allowlist-items-remove",
    "koi-blocklist-items-add",
    "koi-blocklist-items-remove",
    "koi-policy-status-update",
}


def load_env(path=ENV_PATH):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
BASE = ENV["CORTEX_URL"].rstrip("/")

# This python.org build ships an unpopulated trust store (no Install Certificates.command
# was run), so the default context rejects the tenant's perfectly valid DigiCert chain.
# Verification stays ON — we just point it at a real CA bundle.
try:
    import certifi

    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()


def _request(url, body, headers, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001 - surfaced to caller as a status
        return 0, f"{type(e).__name__}: {e}"


def auth_headers():
    """Build auth headers.

    A Cortex 'Standard' key is sent verbatim. An 'Advanced' key must be proved by
    hashing key+nonce+timestamp — the key itself never goes on the wire. We try
    advanced first and fall back, because the two are indistinguishable by length.
    """
    base = {"x-xdr-auth-id": str(ENV["CORTEX_AUTH_ID"]), "Content-Type": "application/json"}
    if AUTH_MODE == "standard":
        return {**base, "Authorization": ENV["CORTEX_KEY"]}
    nonce = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(64))
    ts = int(time.time()) * 1000
    sig = hashlib.sha256((ENV["CORTEX_KEY"] + nonce + str(ts)).encode("utf-8")).hexdigest()
    return {**base, "Authorization": sig, "x-xdr-nonce": nonce, "x-xdr-timestamp": str(ts)}


def xsoar(path, body=None, timeout=180):
    """Call the XSOAR-compatible API surfaced by XSIAM."""
    return _request(f"{BASE}/xsoar/public/v1{path}", body,
                    {**auth_headers(), "Accept": "application/json"}, timeout)


def xdr(path, body, timeout=180):
    """Call the XDR public API (XQL lives here)."""
    return _request(f"{BASE}/public_api/v1{path}", body, auth_headers(), timeout)


def jload(raw):
    try:
        return json.loads(raw)
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Discovery
# --------------------------------------------------------------------------- #

def list_instances():
    """Return the configured integration instances."""
    status, raw = xsoar("/settings/integration/search", {"size": 500})
    doc = jload(raw)
    if status != 200 or not doc:
        return status, raw, []
    return status, None, doc.get("instances") or []


def playground_id():
    """Find the playground investigation used to run commands."""
    for body in ({"filter": {"type": [9], "size": 10}}, {"filter": {"type": [9]}}, {"filter": {}}):
        status, raw = xsoar("/investigations/search", body)
        doc = jload(raw)
        if status == 200 and doc:
            for inv in doc.get("data") or []:
                if inv.get("type") == 9:
                    return inv.get("id")
    return None


# --------------------------------------------------------------------------- #
# Command execution
# --------------------------------------------------------------------------- #

def run_command(cmdline, inv_id, allow_mutating=False):
    """Run '!command args' synchronously in the playground; return the entries."""
    name = cmdline.lstrip("!").split()[0]
    if name in MUTATING and not allow_mutating:
        return {"refused": f"{name} mutates tenant state; re-run with --allow-mutating"}
    body = {"investigationId": inv_id, "data": cmdline if cmdline.startswith("!") else "!" + cmdline}
    status, raw = xsoar("/entry/execute/sync", body)
    return {"status": status, "raw": raw}


def summarise_entries(entries):
    """Reduce war-room entries to {error, human_readable, context_keys, contents_sample}."""
    out = {"error": None, "human_readable": None, "context_keys": [], "contents": None}
    if not isinstance(entries, list):
        return out
    for e in entries:
        if not isinstance(e, dict):
            continue
        # type 4 = error entry
        if e.get("type") == 4 or (e.get("entryType") == 4):
            out["error"] = str(e.get("contents"))[:4000]
            continue
        hr = e.get("humanReadable") or e.get("HumanReadable")
        if hr and not out["human_readable"]:
            out["human_readable"] = str(hr)[:6000]
        ec = e.get("entryContext") or e.get("EntryContext") or {}
        if isinstance(ec, dict):
            out["context_keys"] = sorted(ec.keys())
            if ec and out["contents"] is None:
                out["contents"] = ec
        if out["contents"] is None and e.get("contents") not in (None, ""):
            out["contents"] = e.get("contents")
    return out


# --------------------------------------------------------------------------- #
# XQL
# --------------------------------------------------------------------------- #

def xql(query, timeframe_ms=7 * 24 * 3600 * 1000, tries=30):
    """Run an XQL query and return its results (or the error)."""
    body = {"request_data": {"query": query, "timeframe": {"relativeTime": timeframe_ms}}}
    status, raw = xdr("/xql/start_xql_query/", body)
    doc = jload(raw)
    if status != 200 or not doc:
        return {"stage": "start", "status": status, "raw": raw[:2000]}
    qid = doc.get("reply")
    for _ in range(tries):
        status, raw = xdr("/xql/get_query_results/", {"request_data": {"query_id": qid, "limit": 100}})
        doc = jload(raw)
        if status != 200 or not doc:
            return {"stage": "results", "status": status, "raw": raw[:2000]}
        reply = doc.get("reply", {})
        if reply.get("status") == "SUCCESS":
            return {"stage": "done", "status": 200, "reply": reply}
        time.sleep(2)
    return {"stage": "timeout", "query_id": qid}


if __name__ == "__main__":
    print(f"tenant   : {BASE}")
    print(f"auth id  : {ENV['CORTEX_AUTH_ID']}")
    st, err, instances = list_instances()
    print(f"instances: HTTP {st}, {len(instances)} configured")
    if err:
        print("  error:", err[:1500])
    for i in instances:
        if "koi" in (i.get("brand", "") + i.get("name", "")).lower():
            print(f"  KOI -> name={i.get('name')} brand={i.get('brand')} "
                  f"enabled={i.get('enabled')} state={i.get('integrationLogLevel', '')} "
                  f"version={i.get('version')} isFetch={i.get('isFetch')} "
                  f"isFetchEvents={i.get('isFetchEvents')}")
    pid = playground_id()
    print(f"playground: {pid}")
