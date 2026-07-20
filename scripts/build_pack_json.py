#!/usr/bin/env python3
"""Derive reference/marketplace-pack.json from the pinned upstream YAML.

The doc generators are Node scripts and there is no YAML parser installed for Node,
so the parse happens here once and the generators consume the JSON. Regenerating is
cheap; the point is that no command, argument or context path is ever hand-typed
into a document.
"""

import hashlib
import json
import os

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "reference", "marketplace-Koi.yml")
OUT = os.path.join(ROOT, "reference", "marketplace-pack.json")
META = os.path.join(ROOT, "reference", "marketplace-Koi-pack_metadata.json")

# Confirmed byte-identical to demisto/content@master on 20 July 2026.
EXPECTED_MD5 = "5497cdddedeb0c0d7d0b371aa075a64c"


def main():
    raw = open(SRC, "rb").read()
    md5 = hashlib.md5(raw).hexdigest()
    if md5 != EXPECTED_MD5:
        print(f"WARNING: source YAML md5 {md5} != pinned {EXPECTED_MD5}. "
              f"The upstream pack has changed — re-verify before publishing.")

    y = yaml.safe_load(raw)
    meta = json.load(open(META))
    script = y["script"]

    commands = []
    for c in script["commands"]:
        commands.append({
            "name": c["name"],
            "description": c.get("description", ""),
            "execution": bool(c.get("execution", False)),
            "arguments": [{
                "name": a["name"],
                "required": bool(a.get("required", False)),
                "description": a.get("description", ""),
                "defaultValue": a.get("defaultValue"),
                "predefined": a.get("predefined") or [],
                "isArray": bool(a.get("isArray", False)),
            } for a in (c.get("arguments") or [])],
            "outputs": [{
                "contextPath": o["contextPath"],
                "type": o.get("type", "Unknown"),
                "description": o.get("description", ""),
            } for o in (c.get("outputs") or [])],
        })

    params = [{
        "name": p["name"],
        "display": p.get("display", ""),
        "type": p.get("type"),
        "required": bool(p.get("required", False)),
        "defaultvalue": p.get("defaultvalue"),
        "additionalinfo": p.get("additionalinfo", ""),
        "section": p.get("section", ""),
        "advanced": bool(p.get("advanced", False)),
        "hidden": p.get("hidden"),
    } for p in (y.get("configuration") or [])]

    prefixes = sorted({".".join(o["contextPath"].split(".")[:2])
                       for c in commands for o in c["outputs"]})

    doc = {
        "source": {
            "repo": "demisto/content",
            "path": "Packs/Koi/Integrations/Koi/Koi.yml",
            "md5": md5,
            "verified_against_master": "2026-07-20",
        },
        "pack": {
            "name": meta["name"],
            "currentVersion": meta["currentVersion"],
            "support": meta["support"],
            "author": meta["author"],
            "categories": meta["categories"],
            "marketplaces": meta["marketplaces"],
            "created": meta["created"],
        },
        "integration": {
            "id": y["commonfields"]["id"],
            "name": y["name"],
            "display": y.get("display"),
            "category": y.get("category"),
            "fromversion": y.get("fromversion"),
            "dockerimage": script.get("dockerimage"),
            "isfetchevents": script.get("isfetchevents", False),
            "supportedModules": y.get("supportedModules"),
        },
        "configuration": params,
        "commands": commands,
        "contextPrefixes": prefixes,
        "counts": {
            "commands": len(commands),
            "outputs": sum(len(c["outputs"]) for c in commands),
            "arguments": sum(len(c["arguments"]) for c in commands),
        },
    }

    with open(OUT, "w") as fh:
        json.dump(doc, fh, indent=1)

    print(f"md5 {md5} ({'pinned OK' if md5 == EXPECTED_MD5 else 'CHANGED'})")
    print(f"commands={doc['counts']['commands']} arguments={doc['counts']['arguments']} "
          f"outputs={doc['counts']['outputs']}")
    print(f"prefixes: {prefixes}")
    print(f"fromversion={doc['integration']['fromversion']} "
          f"isfetchevents={doc['integration']['isfetchevents']} "
          f"supportedModules={doc['integration']['supportedModules']}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
