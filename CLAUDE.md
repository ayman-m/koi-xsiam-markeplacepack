# KOI-MP — Marketplace KOI pack content

## Read first

**`SESSION_BRIEF.md` in this directory is the starting point. Read it before doing anything else.**
It contains the verified differences between the two KOI packs, what breaks, and the order of work.

## What this project is

Documentation and content built against the **official Marketplace KOI pack** from `demisto/content`
(`Packs/Koi/`, version 1.2.3, 13 commands, integration only).

**GitHub repository for this work:** <https://github.com/ayman-m/koi-xsiam-markeplacepack>
Commit everything produced here to that repository.

## What this project is NOT

It is not the custom KOI pack. That is a **separate, different implementation** checked out at
`../KOI` (version 1.3.0, 26 commands, plus 10 playbooks, parsing/modeling rules and a dashboard).

`../KOI` is **reference only — never edit it from this project.**

## The trap

Both packs are called `KOI`, both have integration id `KOI`, both are category `Endpoint`, both are
authored by "Cortex XSOAR", and both use `koi-*` commands. They **cannot be installed on the same
tenant** — one overwrites the other.

The Marketplace pack has **13 commands**; the custom pack has **26**. The 13 that exist in the
Marketplace pack are a strict subset. Anything written for the custom pack that touches
`koi-devices-list`, `koi-device-inventory-get`, `koi-koidex-risk-report`, `koi-koidex-search`,
`koi-remediations-list`, `koi-approval-requests-list`, `koi-findings-list`, `koi-users-list`,
`koi-groups-list`, `koi-runtime-policies-list`, `koi-runtime-policy-get`, `koi-fetch-context-get`
or `koi-fetch-context-set` **does not work here.**

There is also no `Koi.Device.*` context prefix in the Marketplace pack — endpoints exist only under
`Koi.Inventory.Endpoint.*`, reached from an item. The data model is item-centric, not device-centric.

## Working rules

- **Verify against source, never from memory.** Command names, arguments and context paths in the
  custom pack are frequently *not* the same here. Read
  `raw.githubusercontent.com/demisto/content/master/Packs/Koi/Integrations/Koi/Koi.yml`.
- **Verify on a live tenant before documenting.** Especially the dataset name — the Marketplace
  pack ships no modeling rules and never declares it. `koi_koi_raw` is inferred from the
  `{vendor}_{product}_raw` convention, not stated.
- **Say which pack, in every document you produce.** Name it and give its version. The two are
  otherwise indistinguishable to a reader.
- Reuse the **generators** from `../KOI/docs/` (they work and share a visual language). Do not
  reuse their **content** without checking each claim.

## Toolchain

The doc generators are Node scripts needing `docx` / `pptxgenjs` via `NODE_PATH`, plus LibreOffice
for PDF conversion. On macOS `soffice` is not on `PATH`:

```bash
export PATH="/Applications/LibreOffice.app/Contents/MacOS:$PATH"
soffice --headless --convert-to pdf <file>.docx
```

For rendering PDFs to images for visual QA, use PyMuPDF — there is no poppler/`pdftoppm` on this
machine. Do not use LibreOffice's `impress_png_Export` with a `PageRange`; the option is silently
ignored and every slide comes out as slide 1.

## Reference material in this directory

| File | What it is |
|---|---|
| `SESSION_BRIEF.md` | **Start here.** Pack comparison, command gap, what breaks, order of work |
| `REFERENCE_custom-pack-playbooks.md` | The custom pack's `Playbooks/README.md`, for context on the Script Runner architecture and List schema |

## One thing that does transfer

The three `Koi Unified - Script Runner` playbooks in the custom pack call **no KOI API command** —
only Cortex-native `core-get-scripts`, `core-get-endpoints` and `core-script-run`. That whole
workflow is portable as-is. It is not part of the Marketplace pack, so if you include it, say
clearly that it is additional content.
