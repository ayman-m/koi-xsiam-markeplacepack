#!/usr/bin/env python3
"""Read-only probe of the KOI API, used to verify what the Marketplace pack's
13 commands actually return before any of it is written into a guide.

The XSIAM war-room path is unavailable on this tenant (API-key users get a
malformed playground, and XSIAM refuses incident creation over the XSOAR API),
so command behaviour is verified against the same endpoints Koi.py calls,
with the same Bearer-token auth and the same API keys the two instances use.

GET only. Nothing here writes to the KOI tenant.
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from koi_tenant import ENV  # noqa: E402  (reuses the same .env loader)

try:
    import certifi

    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

BASE_URL = "https://api.prod.koi.security"
API = "/api/external/v2"

# The two API keys behind the two XSIAM instances.
KEYS = {"KOI_PAET": ENV.get("PAET_API_KEY"), "KOI_PLTS": ENV.get("PLTS_API_KEY")}


def get(path, key, params=None, timeout=90):
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def jload(raw):
    try:
        return json.loads(raw)
    except Exception:
        return None


def shape(obj, depth=0, max_depth=2):
    """Describe a JSON value's structure without dumping its content."""
    if isinstance(obj, dict):
        if depth >= max_depth:
            return f"dict({len(obj)} keys)"
        return {k: shape(v, depth + 1, max_depth) for k, v in list(obj.items())[:40]}
    if isinstance(obj, list):
        if not obj:
            return "list(empty)"
        return [shape(obj[0], depth + 1, max_depth), f"...x{len(obj)}"]
    return type(obj).__name__
