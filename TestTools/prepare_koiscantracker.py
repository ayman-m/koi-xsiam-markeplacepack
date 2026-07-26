#!/usr/bin/env python3
"""Produce the single-file (prepared) KoiScanTracker automation for manual upload.

Why this exists
---------------
The official content layout for a Python automation is TWO files — the YAML holds the
metadata with `script: '-'` as a placeholder, and the code lives beside it in the .py.
That split is correct and must stay:

  https://xsoar.pan.dev/docs/integrations/package-dir

`demisto-sdk upload` assembles them into a unified YAML on the way to the tenant, so a
pack install works from the two-file source with nothing extra to do.

Manual import through the console is the case that needs help: it takes ONE file, and
that file has to be the unified YAML. The supported way to produce it is
`demisto-sdk prepare-content`. This script does the same job in a few lines so someone
without the SDK installed is not blocked — the guide's whole premise is that testing
needs no content development.

Output: dist/automation-KoiScanTracker.yml — generated, never edited by hand.

Usage:  python3 TestTools/prepare_koiscantracker.py [--check]
        --check verifies the prepared file matches the source instead of rewriting it.
"""
import os
import sys
import yaml

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Packs", "KoiContentExtension")
SRC = os.path.join(ROOT, "Scripts", "KoiScanTracker")
OUT = os.path.join(ROOT, "dist", "automation-KoiScanTracker.yml")
BANNER = ("# PREPARED FILE — do not edit. Generated from Scripts/KoiScanTracker/\n"
          "# by TestTools/prepare_koiscantracker.py. Edit the .py/.yml source instead.\n")


def build():
    meta = yaml.safe_load(open(os.path.join(SRC, "KoiScanTracker.yml")))
    code = open(os.path.join(SRC, "KoiScanTracker.py")).read()
    if meta.get("script") != "-":
        raise SystemExit("source yml should carry the '-' placeholder, not code")
    meta["script"] = code
    return BANNER + yaml.dump(meta, sort_keys=False, allow_unicode=True, width=10000)


def main():
    prepared = build()
    if "--check" in sys.argv:
        if not os.path.exists(OUT):
            print("MISSING  dist/automation-KoiScanTracker.yml — run this script")
            return 1
        if open(OUT).read() != prepared:
            print("STALE    dist/automation-KoiScanTracker.yml differs from the source")
            return 1
        print("ok       prepared automation matches Scripts/KoiScanTracker/")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w").write(prepared)
    # the embedded code must still compile, or manual upload ships a broken automation
    compile(yaml.safe_load(prepared)["script"], "KoiScanTracker", "exec")
    print("wrote %s (%d bytes)" % (OUT, len(prepared)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
