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

Why not just call prepare-content
---------------------------------
Its output was diffed against this one: the metadata and the code are identical except
that the SDK wraps the body in

    register_module_line('KoiScanTracker', 'start', __line__())
    ...
    register_module_line('KoiScanTracker', 'end', __line__())

`register_module_line` is defined in CommonServerPython, and the SDK only inlines that
library into scripts that import it. KoiScanTracker deliberately does not — it is
self-contained so it can be uploaded raw — so the SDK's own output would call a name
that does not exist at runtime. Omitting those two lines is correct here, not drift.
Re-run the diff before "fixing" this to match the SDK.

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


class _Literal(str):
    """Marks a string to be emitted as a YAML literal block (|), not a quoted scalar."""


def _literal_representer(dumper, data):
    return dumper.represent_scalar("tag:yaml.org,2002:str", str(data), style="|")


yaml.add_representer(_Literal, _literal_representer)


def build():
    meta = yaml.safe_load(open(os.path.join(SRC, "KoiScanTracker.yml")))
    code = open(os.path.join(SRC, "KoiScanTracker.py")).read()
    if meta.get("script") != "-":
        raise SystemExit("source yml should carry the '-' placeholder, not code")

    # A literal block keeps the Python readable — real indented lines, exactly as in the
    # .py, and the same shape demisto-sdk prepare-content emits. Quoted style would be
    # equally valid YAML but collapses the whole script to one line of \n escapes, so
    # anyone opening the file to check the code is there cannot tell that it is.
    # PyYAML silently falls back to quoted style if any line has trailing whitespace,
    # which would reintroduce exactly that, so strip it and prove the style afterwards.
    code = "\n".join(line.rstrip() for line in code.splitlines()) + "\n"
    meta["script"] = _Literal(code)

    out = BANNER + yaml.dump(meta, sort_keys=False, allow_unicode=True, width=10000)
    if "\nscript: |" not in out:
        raise SystemExit("script was not emitted as a literal block — check for odd whitespace")
    return out


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
