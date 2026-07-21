# KOI Content Extension

Content that extends the **official Marketplace KOI pack** (pack id `Koi`, display name **KOI**,
integration id `KOI`, **v1.2.3**, 13 commands, integration only) published by Palo Alto Networks in
`demisto/content`.

> **Which KOI pack?** There are two packs in circulation called KOI, both with integration id `KOI`,
> both category `Endpoint`, both using `koi-*` commands. This pack targets the **Marketplace** one
> (v1.2.3, **13 commands**). It does **not** target the custom in-house pack (v1.3.0, 26 commands).
> The two cannot be installed on the same tenant — one overwrites the other.

---

## Prerequisite: install the KOI pack first

**Install and configure the `Koi` pack (v1.2.3 or later) before installing this one.** This pack:

- ships **no integration**,
- adds **no commands**,
- creates **no dataset**.

It only reads the `koi_koi_raw` dataset that the KOI integration's event collector produces, and
calls the KOI integration's own commands. Without the KOI pack installed and an enabled instance
fetching events, every playbook fails at its first command task and every dashboard widget is empty.

Shipping no integration is deliberate: an integration here would collide with the installed pack on
`commonfields.id: KOI` and silently overwrite it.

---

## Minimum server version

**Cortex XSIAM 8.4.0.** This is set explicitly as `serverMinVersion` in `pack_metadata.json`.

The content items carry two different `fromversion` values, and that is correct, not an oversight:

| Content | `fromversion` | Why |
|---|---|---|
| Parsing rule, modeling rule, dashboard | `8.4.0`, `supportedModules: [xsiam]` | XSIAM-only content types |
| The 10 playbooks | `6.10.0` | Genuinely the correct playbook-format floor; the three `Unified *` playbooks in particular are portable XSOAR content that uses no XSIAM-only feature |

The pack as a whole cannot function below **8.4.0**, because the rules and the dashboard cannot be
installed below it, and because the KOI integration's event collector is XSIAM/platform-only (the
KOI YAML sets `isfetchevents: true` and then overrides it with `isfetchevents:xsoar: false`). The
playbooks' `6.10.0` was left alone rather than inflated to match: raising it would assert a false
constraint about the playbooks themselves, and `serverMinVersion` is the field that actually gates
installation.

---

## Operational caveats — read these before you install

These matter more than anything else in this README.

### 1. Parsing rules apply at ingest ONLY

A parsing rule runs as events arrive. **Rows already in `koi_koi_raw` are never reprocessed.**

Consequence: every column this pack's parsing rule promotes (`item_id`, `item_type`,
`item_marketplace`, `item_risk_level`, `item_package_name`, `item_criticality`, `device_id`,
`device_os_obs`, `device_serial`, `device_last_seen`, `device_last_user`, `device_status`,
`device_registered_at`, `alert_hostname`, `alert_type`, `finding_uid`, `finding_title`,
`finding_created_time`, `koi_event_id`, and the `mcp_*` family) stays **null on all historical
data**. Dashboard widgets and modeling-rule mappings that depend on those columns are **empty until
fresh events arrive after installation**. Roughly half the dashboard's widgets (26 of 52) read
promoted columns; the rest read raw OCSF columns and JSON inside `resources` / `observables` and
work against historical rows immediately.

Do not diagnose this as a broken rule. Wait for a fetch cycle, then re-check.

### 2. The parsing rule and the modeling rule must be deployed together

The modeling rule's Alerts block reads columns that exist **only because the parsing rule promoted
them at ingest**. Deployed alone, 16 of its Alerts mappings silently resolve to null — including
`xdm.event.id`, `xdm.alert.name`, the entire host block and the entire resource block. It will not
error; it will map nulls.

(The modeling rule's Audit block reads only raw fields and is standalone.)

### 3. Forward risk that no rename can prevent

Parsing rules bind on the **(vendor, product) pair** — here `vendor="koi", product="koi"` — not on
the pack that ships them. Modeling rules bind on the **dataset name** — here `koi_koi_raw`.

Renaming this pack, its rules or its content items changes none of that. **If Palo Alto Networks
later adds parsing or modeling rules to `Packs/Koi`, both packs will contend for the same `(koi,
koi)` ingest binding and the same `koi_koi_raw` model.** There is no namespacing mechanism that
avoids this. Before upgrading the KOI pack, check its release notes for new `ParsingRules/` or
`ModelingRules/` content, and be prepared to remove this pack's rules if they appear.

### 4. `alert_type` is not a triage discriminator here

Two separate facts, both live-verified over 90 days on a real tenant:

- The **raw** `alert_type` column in `koi_koi_raw` is never populated — `filter alert_type != null`
  returns zero rows.
- The `alert_type` this pack's parsing rule promotes (from `finding_info.types[0]`) has **exactly
  one distinct value across all 314 alert rows: `policy_violation`**.

So nothing in this pack branches on `alert_type`, and neither should anything you build on top of
it. It is promoted and mapped to `xdm.event.type` for completeness only. Content ported from the
custom KOI pack, whose triage keys on `alert_type`, matches nothing here.

### 5. What the ported playbooks CANNOT do

These playbooks were rebuilt against the Marketplace pack's 13 commands. Capabilities that exist in
the custom 26-command pack have **no equivalent** and were removed, not stubbed:

| Missing capability | Custom-pack command that provided it | Status here |
|---|---|---|
| Catalog / vendor-wide risk lookup | `koi-koidex-risk-report`, `koi-koidex-search` | **Not available.** Item risk comes only from the org's own inventory record |
| AI risk summary | `koi-koidex-risk-report` | **Not available** |
| Remediation history | `koi-remediations-list` | **Not available** |
| Approval-request history | `koi-approval-requests-list` | **Not available** |
| Findings catalog | `koi-findings-list` | **Not available** |
| Users / groups enrichment | `koi-users-list`, `koi-groups-list` | **Not available** |
| Runtime (hardening) policy detail | `koi-runtime-policies-list`, `koi-runtime-policy-get` | **Not available** |
| Fetch-state diagnostics | `koi-fetch-context-get`, `koi-fetch-context-set` | **Not available** |

And on devices specifically:

- There is **no `koi-devices-list` and no `koi-device-inventory-get`**.
- There is **no `Koi.Device.*` context prefix.** Endpoints exist only under
  `Koi.Inventory.Endpoint.*`, reached *from an item*.
- A device is addressable only as a **filter on inventory**:
  `!koi-inventory-list device_id=<id>`. `KOI Ext - Investigate Device` is built on exactly that, and
  is therefore an item-centric view of a device, not a device record.

The data model is **item-centric, not device-centric**. Any expectation carried over from the custom
pack that a device is a first-class object will be disappointed.

### 6. Two-step required for endpoint lookups

`koi-inventory-item-endpoints-list` requires `item_id` **plus** `marketplace` **plus** `version`.
Those three are not all present on the alert, so every playbook that calls it first runs
`koi-inventory-list item_id=… limit=1` to recover `marketplace` and `version`. Do not "simplify" that
first call away. `koi-inventory-item-get` is deliberately never called anywhere in this pack.

---

## What this pack ships

### Parsing rule — `KoiContentExtension`

`[INGEST:vendor="koi", product="koi", target_dataset="koi_koi_raw", no_hit=keep]`

Promotes ~29 columns out of the JSON-string `resources` / `observables` / `finding_info` blobs, and
sets `_time` on Audit rows from `created_at` (guarded — `created_at` is null on 100% of alert rows).
Extraction is **coalesce-by-`.type`**, never a fixed array index: `resources[0].type` is `item` on
296 alerts but `mcp` on 18, so a fixed index would misattribute MCP-server values to items.

### Modeling rule — `KoiContentExtension`

`[MODEL: dataset=koi_koi_raw]`, one block for `source_log_type = "Alerts"` and one for `"Audit"`,
mapping to the Cortex Data Model. Requires the parsing rule (see caveat 2).

### Dashboard — `KOI Content Extension - Alerts Dashboard`

52 widgets across 24 layout rows, all on a 30-day relative window. All widgets query `koi_koi_raw`
directly; none reference `xdm.*`, so the dashboard does not depend on the modeling rule.

### Playbooks (10)

| Playbook | Purpose |
|---|---|
| `KOI Ext - Alert Triage` | End-to-end triage of a KOI alert: builds context, scores four signals, reaches a verdict, and either auto-closes or hands off to response. Top-level entry point |
| `KOI Ext - Extract Alert Context` | Sub-playbook. Parses the alert's `finding_info` / `observables` / `resources` into the flat `KoiContext.*` object the rest of the chain consumes |
| `KOI Ext - Investigate Item` | Sub-playbook. Full investigation of one inventory item: org inventory record, the endpoints carrying it, and its allowlist/blocklist standing |
| `KOI Ext - Investigate Device` | Device posture check, expressed as an inventory query filtered by `device_id` (there is no device API here) |
| `KOI Ext - Enrich Item` | Sub-playbook. Lightweight reusable enrichment for a single item — inventory record plus endpoints. A trimmed standalone alternative to `Investigate Item` |
| `KOI Ext - Block and Remediate` | Response: re-checks the item, recovers its `marketplace`, and adds it to the org blocklist |
| `KOI Ext - MCP Server Audit` | Standalone/scheduled audit of MCP servers in the inventory (`koi-inventory-list view=mcp_servers`), reporting risky ones |
| `KOI Ext - Unified Script Runner` | Reads a Script Runner configuration list and dispatches each entry. **Additional content** — see below |
| `KOI Ext - Unified Process Config Entry` | Sub-playbook. Validates one configuration entry, runs it, and mails the result |
| `KOI Ext - Unified Execute Endpoint Script` | Sub-playbook. Resolves the script and target endpoints, runs the script, and polls for its result |

> **The three `Unified *` playbooks are additional content, not part of the Marketplace KOI pack.**
> They call **no KOI command at all** — only the Cortex-native `core-get-scripts`,
> `core-get-endpoints` and `core-script-run`. They are included here because the workflow is useful
> alongside KOI and ports unchanged, not because KOI provides it.

---

## Dependencies

Declared as **mandatory** in `pack_metadata.json`:

| Pack id | Display name | Why |
|---|---|---|
| `Koi` | KOI | The integration, its 13 commands, and the `koi_koi_raw` dataset. **v1.2.3 or later** |
| `CommonScripts` | Common Scripts | `SetAndHandleEmpty` (86 uses), `Set`, `Print`, `PrintErrorEntry`, `DeleteContext`, `GetErrorsFromEntry` |
| `FiltersAndTransformers` | Filters And Transformers | The `ParseJSON`, `JsonToTable`, `SetIfEmpty`, `FormatTemplate` and `LastArrayElement` transformers used in context expressions |
| `Core` | Core | The `Cortex Core - IR` integration, for `core-get-scripts`, `core-get-endpoints` and `core-script-run` in the three `Unified *` playbooks |

### Not declared — a mail-sender integration

`KOI Ext - Unified Process Config Entry` sends its result mail with the generic **`send-mail`**
command. That command is provided by many integrations — `Mail Sender (New)` (`MailSenderNew`),
`Gmail`, `Microsoft Graph Mail`, EWS, and others — and the task selects one at runtime through the
`sendmail_instance.name` node of the configuration entry.

No single pack is therefore correct to declare as a dependency, and declaring one arbitrarily would
force an unwanted install. **Install any mail-sender integration of your choice and name its
instance in the configuration list.** If none is installed, only that one task fails; the rest of
the pack is unaffected.

Server built-ins used and requiring no pack: `setAlert`, `Builtin|||closeInvestigation`, and the
`join` / `uniq` / `count` / `toLowerCase` transformers.

---

## Verification status

Command names, arguments and context paths in this pack were verified against
`demisto/content@master → Packs/Koi/Integrations/Koi/Koi.yml` (v1.2.3), not from memory. The
dataset name `koi_koi_raw`, the array-length bounds in the parsing rule, the
`resources[0].type ∈ {item, mcp}` split, and the `alert_type` cardinality were verified on a live
tenant (`api-ayman.xdr.eu.paloaltonetworks.com`, July 2026) over 314 alert rows and ~20,215 audit
rows across 90 days.
