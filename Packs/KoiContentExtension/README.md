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
`item_marketplace`, `item_marketplace_api`, `item_risk_level`, `item_package_name`,
`item_criticality`, `device_id`, `device_os_obs`, `device_serial`, `device_last_seen`,
`device_last_user`, `device_status`, `device_registered_at`, `alert_hostname`, `alert_type`,
`alert_item_version`, `finding_uid`, `finding_title`, `finding_created_time`, `koi_event_id`,
**`koi_notification_id`**, **`koi_product_version`**, and the `mcp_*` family — 31 Alert columns in
all, plus `marketplace_api` on Audit) stays **null on all historical data**. Modeling-rule mappings
that depend on those columns are **empty until fresh events arrive after installation**.

The dashboard is built not to have that problem. Measured directly from
`XSIAMDashboards/KoiContentExtension_Alerts_Dashboard.json`: of its **53** widgets, **25 never
reference a promoted column at all**, and the other **28 re-derive every promoted column they use
inline** from the raw `resources` / `observables` / `metadata` JSON — usually as
`alter <col> = coalesce(<promoted column>, <guarded raw read>)`. **Zero widgets depend on a
promoted column with no inline fallback**, so all 53 render against historical rows and keep
working after the parsing rule lands. The same reasoning applies to dedupe: 42 widgets read
`notification_event_id` inline out of `metadata` rather than the promoted `koi_notification_id`,
for exactly this reason.

Do not diagnose this as a broken rule. Wait for a fetch cycle, then re-check.

### 2. The parsing rule and the modeling rule must be deployed together

The modeling rule's Alerts block reads columns that exist **only because the parsing rule promoted
them at ingest**. Deployed alone, **12 of its 20 Alerts mappings** silently resolve to null —
`xdm.event.type`, `xdm.alert.name`, the entire host block (`device_id` / `hostname` / `os` /
`os_family`), `xdm.source.user.username` and the entire resource block (`id` / `name` / `type` /
`sub_type`). It will not error; it will map nulls.

The 8 that survive are `xdm.event.id`, `xdm.alert.description`, `xdm.alert.severity`,
`xdm.alert.subcategory` and the observer block. **`xdm.event.id` is not affected** — it maps
`_id`, an XSIAM-internal column that is present whether or not the parsing rule is deployed. (An
earlier version of this README listed it among the casualties and gave the figure as 16; both were
wrong. Corrected 21 July 2026 against the modeling rule's own header.)

The modeling rule's Audit block is **very nearly** standalone, not fully: it reads raw fields for
everything except `xdm.target.resource.sub_type`, which reads `marketplace_api` — a parsing-rule
column. So the Audit block needs the parsing rule too, for that one mapping.

### 3. Forward risk that no rename can prevent

Parsing rules bind on the **(vendor, product) pair** — here `vendor="koi", product="koi"` — not on
the pack that ships them. Modeling rules bind on the **dataset name** — here `koi_koi_raw`.

Renaming this pack, its rules or its content items changes none of that. **If Palo Alto Networks
later adds parsing or modeling rules to `Packs/Koi`, both packs will contend for the same `(koi,
koi)` ingest binding and the same `koi_koi_raw` model.** There is no namespacing mechanism that
avoids this. Before upgrading the KOI pack, check its release notes for new `ParsingRules/` or
`ModelingRules/` content, and be prepared to remove this pack's rules if they appear.

### 4. `alert_type` is not a triage discriminator here

Two separate facts, both live-verified over 90 days on a real tenant (21 July 2026):

- The **raw** `alert_type` column in `koi_koi_raw` is never populated — `filter alert_type != null`
  returns zero rows.
- The `alert_type` this pack's parsing rule promotes (from `finding_info.types[0]`) has **exactly
  one distinct value across all 1,048 alert rows: `policy_violation`**.

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

### 7. The event and API `marketplace` vocabularies are different

A KOI **event** says `software_windows`, `chrome`, `vsc`, `jet`, `npp`, `openvsx`, `edge`, `firefox`,
`github`, `software_mac`. The KOI **API** — and the `predefined` list on every `marketplace` argument
in `Koi.yml` v1.2.3 — wants `windows`, `chrome_web_store`, `vscode`, `jetbrains`, `notepad++`,
`open_vsx_registry`, `edge_add_ons`, `firefox_add_ons`, `github_mcp_registry`, `mac`. Only `npm` and
`pypi` are spelled the same in both. Passing an event value to a command returns **HTTP 400**.

Three event values have **no** API equivalent and are treated as "unknown marketplace": `ollama`
(absent from the API's list) and `built_in` / `side_loaded` (`installation_method` values leaking
into the `marketplace` field).

The pack handles this in two places, both from the same table:

- **Ingestion** — the parsing rule adds `marketplace_api` (Audit) and `item_marketplace_api`
  (Alerts) alongside the untouched verbatim fields, and the modeling rule maps the `_api` form to
  `xdm.target.resource.sub_type`.
- **Playbooks** — `KOI Ext - Extract Alert Context` publishes `KoiContext.marketplace_raw` (verbatim)
  and `KoiContext.marketplace` (API-safe). `KOI Ext - Investigate Item`, `KOI Ext - Enrich Item` and
  `KOI Ext - Block and Remediate` each map their `marketplace` **input** too, so they are safe to
  drive from raw event data — including audit-driven flows, where `software_windows` is the single
  most common value in the dataset. The map contains the 22 API values as identity rows, so it is
  idempotent and a value that is already in API form is unaffected.

A `marketplace` read from `Koi.Inventory.marketplace` is a **command output**, is already
API-canonical, and is deliberately **never** re-mapped — allow-listing a command output against a
static table would silently drop a marketplace KOI adds to the API later. An unmapped value becomes
**empty**, which every playbook recovers from with `koi-inventory-list item_id=… limit=1`; a wrong
value is an unrecoverable 400.

### 8. 🚨 An Alerts row is a fetch, not an alert — always dedupe

The Marketplace integration re-sends every **still-open** alert on every fetch cycle
(`eventFetchInterval` = 1 minute), so `koi_koi_raw` holds one row per alert **per fetch**. Measured
21 July 2026 on the validation tenant:

| Stream | Window | Rows | Distinct notifications | Inflation |
|---|---|---|---|---|
| Alerts | last 24 h | 734 | **3** | **≈245×** |
| Alerts | last 90 d | 1,048 | 317 | ≈3.3× |
| Audit | last 90 d | 20,148 | 20,148 | 1.0 — none |

Audit is unaffected; this is an Alerts-only defect, and it is a property of the integration, not of
this pack. The duplication is also not uniform — over 90 days the 296 `extension` rows carry 296
distinct notifications (no duplication at all) while the `mcp_server` rows carry 21, because those
are the alerts that stay open.

The parsing rule promotes **`koi_notification_id`** from `metadata.notification_event_id` as the
only correct dedupe key: 317 distinct across the 1,048 rows, and a verified 1:1 identity for
`(item.id, device.id, finding_info.uid, finding_info.created_time)`. `koi_event_id` (20 distinct)
is the scan batch and `finding_uid` (3 distinct) is the policy — neither is an alert identity.

Consequences you must handle yourself:

- **Anything counting alerts must use `count_distinct(koi_notification_id)`.** A plain `count()` is
  wrong by two orders of magnitude — 734 versus 3 on a 24-hour window.
- **On historical rows the promoted column is null** (caveat 1), so dedupe there with
  `json_extract_scalar(metadata, "$.notification_event_id")` inline. That is what the dashboard
  widgets do.
- **XDM cannot express this.** There is no "this is a duplicate" field, so the modeling rule cannot
  fix it and every consumer has to.
- `KOI Ext - Alert Triage` carries a duplicate-suppression gate for exactly this reason.

---

## What this pack ships

### Parsing rule — `KoiContentExtension`

`[INGEST:vendor="koi", product="koi", target_dataset="koi_koi_raw", no_hit=keep]`

Promotes **31** columns out of the JSON-string `metadata` / `resources` / `observables` /
`finding_info` blobs (29 plus **`koi_notification_id`** and **`koi_product_version`**, both added
by the duplication fix), and sets `_time` on Audit rows from `created_at` (guarded — `created_at`
is null on 100% of alert rows). Extraction is **coalesce-by-`.type`**, never a fixed array index:
over 90 days `resources[0].type` is `item` on the 296 `extension` rows but `mcp` on the 842
`mcp_server` rows (21 July 2026), so a fixed index would misattribute MCP-server values to items —
and the split moves as the population shifts.

`koi_notification_id` (from `metadata.notification_event_id`) is the dedupe key described in
caveat 8. `koi_product_version` is a change detector, not an analytic dimension: it is the constant
`1.7.0` today, and the day it stops reading `1.7.0` every extraction in the rule is worth
re-validating.

### Modeling rule — `KoiContentExtension`

`[MODEL: dataset=koi_koi_raw]`, one block for `source_log_type = "Alerts"` and one for `"Audit"`,
mapping to the Cortex Data Model. Requires the parsing rule (see caveat 2).

Two fields are deliberately **unmapped**, both removed 21 July 2026 after live measurement, both
carrying a DO-NOT-RE-ADD comment in the rule: `xdm.alert.original_alert_id` (was `finding_uid` — a
policy id, 3 distinct values across 1,040 alerts) and `xdm.target.host.fqdn` (was `alert_hostname`
— contains a dot on 0 of 1,138 rows, so it is a bare name, not an FQDN).

### Dashboard — `KOI Content Extension - Alerts Dashboard`

**53 widgets across 25 layout rows** (counted from the dashboard JSON), all on a 30-day relative
window. The 53rd is the duplication monitor added with the dedupe fix. All widgets query
`koi_koi_raw` directly; none reference `xdm.*`, so the dashboard does not depend on the modeling
rule, and none depends on a promoted column without an inline raw fallback (see caveat 1).

### Playbooks (12)

| Playbook | Purpose |
|---|---|
| `KOI Ext - Hunt Sweep` | **Job-attached, time-triggered** proactive hunt sweep. Runs a configurable set of validated hunting XQL queries, investigates every match, posts a war-room table, and routes confirmed ungoverned known-bad to an analyst-gated block. **Triggered by a Job, not a correlation rule** — see below |
| `KOI Ext - Hunt Match Investigation` | Sub-playbook of Hunt Sweep. Normalizes one hunt match and returns its investigation verdict, reusing `KOI Ext - Investigate Item` for item enrichment and `core-get-endpoints` for host/shadow matches |
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

## Scheduled hunt sweep — `KOI Ext - Hunt Sweep`

`KOI Ext - Hunt Sweep` runs the pack's **proactive hunting queries on a schedule**, investigates
any matches, and posts a war-room summary. It is triggered by a **time-triggered Cortex Job, NOT by
a correlation rule** — this is the deliberate design for this pack. KOI is run-on-demand (there is
no resident agent), so a scheduled Job is the hunt scheduler, exactly as it is for
`KOI Ext - Unified Script Runner`.

### What it does each run

1. Runs the hunts in `hunt_set` in parallel through `xdr-xql-generic-query` (bodies embedded
   **verbatim**, parameterised only by `xql_time_frame`):
   - **H2.1** items carrying compromise-grade KOI findings (malicious / spyware / ransomware /
     exfil / typosquat), deduped on `notification_event_id`;
   - **H2.6** critical/high KOI known-bad that is **not under governance**;
   - **H1.3** install **bursts** (one item across many hosts in a tight window);
   - **H4.2** **shadow agentic software** (MCP / AI agent) executing in `xdr_data` that KOI never
     inventoried.
2. Normalizes every match into a single `KoiHunt.Matches` array, mapping the raw short-form
   marketplace to the API vocabulary.
3. **Zero matches → posts "hunt sweep clean" and closes.**
4. Otherwise investigates each match (bounded by `max_matches_to_investigate`): item matches via
   `KOI Ext - Investigate Item`, host/shadow matches via `core-get-endpoints` (and *recommends*,
   never runs, a `core-script-run` of the KOI deployment script to refresh a stale host).
5. Posts **one war-room markdown table** of every match with its verdict.
6. **Analyst-gated response, never automatic:** a confirmed known-bad, ungoverned item is routed to
   `KOI Ext - Block and Remediate` with **`auto_block=false`** — the blocklist write requires human
   approval. A scheduled hunt never auto-blocks.
7. Closes its own investigation (Job hygiene).

### Inputs

| Input | Default | Meaning |
|---|---|---|
| `hunt_set` | `H2.1,H2.6,H1.3,H4.2` | Which hunts run. A comma-separated set of hunt ids, or a List value (`${lists.<name>}`). Tune it **without editing the playbook** |
| `min_risk` | `high` | Minimum item risk eligible for the analyst-gated response route |
| `xql_time_frame` | `7 days` | Relative time frame for every hunt query |
| `auto_investigate` | `true` | `false` posts the raw matches and closes without investigating or routing |
| `max_matches_to_investigate` | `25` | Per-hunt fan-out cap so a scheduled sweep never runs unbounded (each hunt's XQL `limit` is a hard backstop) |
| `enable_response_gate` | `true` | `false` summarizes only; never routes to response |
| `instance_name` | — | KOI integration instance; empty uses the single configured one |

### Attach it to a Job

Mirror the way `KOI Ext - Unified Script Runner` is scheduled:

1. **Settings → Investigation & Response → Jobs → New Job.**
2. Choose **Scheduled** (time-triggered) and set the cadence (e.g. every 12 or 24 hours, or a cron
   such as daily at 02:00). Do **not** attach a feed or a triggering incident type — this is a
   time trigger, not an event trigger.
3. Set the Job's **Playbook** to **`KOI Ext - Hunt Sweep`**.
4. (Optional) Override inputs on the Job — e.g. narrow `hunt_set`, lengthen `xql_time_frame`, or set
   `enable_response_gate=false` for a report-only cadence while you tune it.
5. Ensure the **Cortex XDR - XQL Query Engine** integration is enabled on the tenant (see the
   dependency note below) and the **KOI** integration instance is configured. Save and enable the Job.

Each run opens its own investigation, does the work above, and closes it — so the Jobs list stays
clean and there is one war-room summary per run.

> **This playbook effectively requires the XQL Query Engine.** Its whole purpose is running XQL, so
> unlike the optional enrichment on the investigation playbooks, `KOI Ext - Hunt Sweep` does nothing
> useful without `xdr-xql-generic-query`. It still **fails gracefully**: every XQL task is
> `continueonerror`, and if the engine is absent the playbook posts *"XQL engine unavailable — hunt
> sweep skipped"* and closes. The pack does **not** hard-depend on the engine — the `CortexXDR`
> dependency stays `mandatory: false` (see below); only this one playbook needs it.

---

## Dependencies

Declared as **mandatory** in `pack_metadata.json`:

| Pack id | Display name | Why |
|---|---|---|
| `Koi` | KOI | The integration, its 13 commands, and the `koi_koi_raw` dataset. **v1.2.3 or later** |
| `CommonScripts` | Common Scripts | `SetAndHandleEmpty` (86 uses), `Set`, `Print`, `PrintErrorEntry`, `DeleteContext`, `GetErrorsFromEntry` |
| `FiltersAndTransformers` | Filters And Transformers | The `ParseJSON`, `JsonToTable`, `SetIfEmpty`, `FormatTemplate` and `LastArrayElement` transformers used in context expressions |
| `Core` | Core | The `Cortex Core - IR` integration, for `core-get-scripts`, `core-get-endpoints` and `core-script-run` in the three `Unified *` playbooks and the host branch of `KOI Ext - Hunt Sweep` |

Declared as **optional** (`mandatory: false`) in `pack_metadata.json`:

| Pack id | Display name | Why |
|---|---|---|
| `CortexXDR` | Cortex XDR by Palo Alto Networks | Provides the **Cortex XDR - XQL Query Engine** integration and its `xdr-xql-generic-query` command, used by the optional XDR-correlation enrichment below **and required in practice by `KOI Ext - Hunt Sweep`** (whose purpose is running XQL — see *Scheduled hunt sweep* above; it still degrades gracefully when the engine is absent). Kept `mandatory: false` so the pack installs and every KOI-command playbook works with no XQL engine present |

### Optional — Cortex XDR × KOI correlation enrichment (XQL)

Three of the investigation playbooks carry a **best-effort XDR enrichment** that correlates the KOI
supply-chain picture with what Cortex XDR endpoint telemetry actually saw. Each runs the validated
Theme-D XQL query for its context through **`xdr-xql-generic-query`** (output on
`PaloAltoNetworksXQL.GenericQuery`):

| Playbook | Query | Answers | Keyed on |
|---|---|---|---|
| `KOI Ext - Investigate Item` | Theme D / **D2** | Did anything from this item's install path actually execute, load, or get written to disk? | `Inv.item_id` (fleet-wide — this playbook is item-centric) |
| `KOI Ext - Investigate Device` | Theme D / **D3c** + **D4** | When did KOI last actually *scan* this host (KOI is run-on-demand on Windows), and what arrived vs which process brought it? | `inputs.hostname` |
| `KOI Ext - Alert Triage` | Theme D / **D5** | The hour either side of this alert on the host — other KOI installs, host process executions, and egress from code-pulling processes | `KoiContext.alert_hostname` + the alert time |

This is where the enrichment sits relative to the governing rule of this pack — *stay within what the
KOI Marketplace integration supplies.* It **introduces a dependency on the Cortex XDR - XQL Query
Engine integration, which is NOT the KOI integration and is NOT part of this pack.** That is
acceptable because it uses platform telemetry rather than a fabricated KOI capability, and it is
engineered to disappear cleanly when the engine is absent:

- **Optional dependency.** Declared `mandatory: false` (`CortexXDR`). The pack installs and every
  KOI-command task works with no XQL engine present. On the Cortex **platform** the same
  `xdr-xql-generic-query` command ships in the already-mandatory **`Core`** pack; on the
  **marketplacev2** marketplace it is the standalone **`CortexXDR`** pack — hence that is the id
  declared optional.
- **Parallel, never in the critical path.** Each enrichment is a separate lane branched off the
  existing flow; it does not sit between existing tasks and does not feed the verdict, the analyst
  approval gate, or the auto-close.
- **Every XQL task is `continueonerror`.** XQL can be slow, rate-limited, or the engine absent — any
  of those errors the lane and the investigation/triage still completes. The war-room note then
  states plainly that the enrichment degraded, so a blank is never mistaken for "nothing found".
- **Tunable.** Each playbook exposes an `xql_time_frame` input (default `7 days` for the
  investigations, `24 hours` for triage).
- **Dedupe rule respected.** The embedded queries read `xdr_data` and `koi_koi_raw`
  `source_log_type = "Audit"` only. None reads `source_log_type = "Alerts"`, so the Alerts
  dedupe-on-`notification_event_id` rule (caveat 8) does not apply to any of them.

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
tenant (`api-ayman.xdr.eu.paloaltonetworks.com`) over **1,048 alert rows and 20,148 audit rows
across 90 days, measured 21 July 2026**.

**Every live figure in this pack carries that measurement date, and it is the same date
everywhere.** The dataset grows on every fetch cycle, so an undated figure is not reproducible and
a re-measurement will not match. Cohort counts (296 `extension` / 842 `mcp_server`) and
whole-stream counts (1,048 rows) came from separate queries minutes apart and do not sum exactly;
that is the window moving, not a contradiction. The canonical set is recorded in
`VERIFIED_FACTS.md` §7e / §7f — quote from there, and do not restate a measurement with a
different value in another file.
