# KOI Marketplace pack — documentation set

Documentation built against the **official Marketplace KOI pack** from `demisto/content`
(`Packs/Koi`, **v1.2.3** — 13 commands, integration only).

> ## ⚠️ This is not the custom KOI pack
>
> A separate in-house pack (**v1.3.0**, 26 commands, plus 10 playbooks, parsing and modeling rules
> and a dashboard) is also called **KOI**, also has integration id **`KOI`**, is also category
> **Endpoint**, and also uses `koi-*` commands.
>
> **They cannot coexist on one tenant — installing one overwrites the other.**
>
> The Marketplace pack's 13 commands are a strict subset of the custom pack's 26. Anything written
> for the custom pack that touches `koi-devices-list`, `koi-device-inventory-get`,
> `koi-koidex-risk-report`, `koi-koidex-search`, `koi-remediations-list`,
> `koi-approval-requests-list`, `koi-findings-list`, `koi-users-list`, `koi-groups-list`,
> `koi-runtime-policies-list`, `koi-runtime-policy-get`, `koi-fetch-context-get` or
> `koi-fetch-context-set` **does not work here**. There is also no `Koi.Device.*` context prefix —
> endpoints are reached only from an item, via `Koi.Inventory.Endpoint.*`.
>
> Every document in `docs/` names the pack and version it describes, on its first page and in its
> footer. Keep it that way.

## Deliverables

| File | What it is |
|---|---|
| `docs/KOI_Marketplace_Pack_Customer_Guide_v1.2.3.docx` | Install and usage guide: configuration, the full 13-command reference, the context model, event collection |
| `docs/KOI_Marketplace_Pack_Test_Guide.pptx` | Executable test steps with expected results, scoped to what this pack can actually do |
| `docs/KOI_Marketplace_Pack_Troubleshooting_Guide_v1.0.docx` | Pack-specific troubleshooting plus the carried-forward endpoint findings |
| `docs/KOI_Marketplace_Pack_Overview.pptx` | Short overview deck |

A `.pdf` is generated alongside each.

## How these documents are kept honest

The failure mode for this project is a plausible sentence that is true of the *other* KOI pack.
Two mechanisms guard against it.

**1. Command tables are derived, never typed.** `reference/marketplace-Koi.yml` is pinned from
`demisto/content@master` (md5 `5497cdddedeb0c0d7d0b371aa075a64c`, re-checked byte-identical).
`scripts/build_pack_json.py` parses it into `reference/marketplace-pack.json`, and every generator
builds its command, argument and output tables from that JSON **at build time**. A derived table
cannot drift from its source.

**2. Every claim is sourced.** `VERIFIED_FACTS.md` is the single record of what was checked on a
live tenant on 20 July 2026, what was taken from the pack source, and — importantly — **what could
not be verified and why**. Claims are tagged `[YAML]`, `[LIVE]` or `[UNVERIFIED]`.

Both were tested adversarially: each document was reviewed by a fact-checker whose instruction was
to refute it, not approve it. That pass found 24 issues, including a wrong claim in
`VERIFIED_FACTS.md` itself that had propagated into three documents.

## Regenerating

```bash
npm install --offline --no-audit --no-fund docx pptxgenjs
export NODE_PATH="$PWD/node_modules"

python3 scripts/build_pack_json.py          # refresh the derived pack JSON
node docs/build_guide.js                    # customer guide
node docs/build_test_guide.js               # test guide
node docs/build_troubleshooting.js          # troubleshooting guide
node docs/build_deck.js                     # overview deck

soffice -env:UserInstallation=file:///tmp/loprofile --headless \
        --outdir docs --convert-to pdf docs/<file>
```

`soffice` lives at `/Applications/LibreOffice.app/Contents/MacOS/soffice` on macOS and is not on
`PATH`. **Pass `-env:UserInstallation`** — a plain `soffice` call silently no-ops when another
LibreOffice instance holds the default profile, leaving a stale PDF that looks like your change
did nothing. Render PDF pages to images with PyMuPDF; there is no `pdftoppm` on this machine.

If `build_pack_json.py` warns that the md5 has changed, the upstream pack has been updated —
re-verify before publishing anything.

## Verification scripts

Read-only. They never write to the KOI tenant.

| Script | Purpose |
|---|---|
| `scripts/koi_tenant.py` | Cortex XSIAM API client — lists integration instances, runs XQL |
| `scripts/koi_api.py` | KOI vendor API client (bearer auth) |
| `scripts/sweep_commands.py` | Sweeps the endpoints behind the read-only commands; writes `evidence/` |

Credentials come from a git-ignored `.env`. **Do not `source .env` in zsh** — one value contains
unquoted special characters and the shell echoes a fragment of it before failing. The scripts load
it in Python instead.

The 5 state-changing commands (`koi-policy-status-update`, and the allowlist/blocklist
add/remove pairs) are **deliberately not exercised** by the sweep and are recorded as `NOT RUN`.
Note that the pack flags only 2 of those 5 with `execution: true`.

## Repository layout

```
docs/          the four deliverables and the Node generators that build them
reference/     pinned upstream pack source + the derived JSON
scripts/       verification clients and the pack-JSON builder
evidence/      structural sweep results (raw captures are git-ignored)
VERIFIED_FACTS.md   what was verified, what was not, and how
SESSION_BRIEF.md    the original pack comparison and order of work
```

`evidence/raw/` is excluded from git: live captures carry real hostnames and installed-software
inventory.
