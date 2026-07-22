# KOI Content Extension — Parsing Rule

**Pack:** KoiContentExtension ("KOI Content Extension") v1.0.0.
**Extends:** the official **Marketplace KOI pack v1.2.3** (integration id `KOI`, 13 commands).
This pack ships **no integration** — it only normalizes and models the `koi_koi_raw` dataset that
the installed KOI integration already produces.

## What this rule does

It attaches to the ingest stream by `(vendor, product)`, not by pack:

```
[INGEST:vendor="koi", product="koi", target_dataset="koi_koi_raw", no_hit=keep]
```

The Marketplace integration calls `send_events_to_xsiam(vendor="koi", product="koi")`, so the rule
binds to its events with no change to the integration.

Two statements:

| Statement | Scope | Effect |
|---|---|---|
| A | `filter source_log_type = "Audit"` | `alter _time = created_at`, then promotes **`marketplace_api`** — the audit `marketplace` column mapped into the Koi API vocabulary |
| B | `filter source_log_type = "Alerts"` | promotes **31** flat columns out of the nested OCSF `metadata` / `finding_info` / `observables` / `resources` JSON (plus 2 working intermediates, `resources_str` / `observables_str`, which also persist as columns) |

`no_hit=keep` is required: rows matching neither filter still land in the dataset.

## All figures in this file are dated

Every live figure quoted here was measured on **21 July 2026** against tenant `api-ayman.xdr.eu`
over a 90-day window, and is the canonical snapshot recorded in `VERIFIED_FACTS.md` §7e / §7f.
The dataset grows on every fetch cycle, so a figure without a date is meaningless and an
undated re-measurement will not match. Quote the date with the number, or do not quote the number.

Cohort counts (296 extension / 842 `mcp_server`) and whole-stream counts (1,048 Alert rows) came
from separate queries and do **not** sum exactly. That is the measurement window moving, not an
error.

## 🚨 The Alerts stream is duplicated — a row is a fetch, not an alert

The Marketplace integration re-sends every **still-open** alert on every fetch cycle
(`eventFetchInterval` = 1 minute), so `koi_koi_raw` holds one row per alert **per fetch**.
Measured 21 July 2026:

| Stream | Window | Rows | Distinct notifications | Inflation |
|---|---|---|---|---|
| Alerts | last 24 h | 734 | **3** | **≈245×** |
| Alerts | last 90 d | 1,048 | 317 | ≈3.3× |
| Audit | last 90 d | 20,148 | 20,148 | 1.0 — none |

Audit is unaffected; this is an Alerts-only defect. This rule promotes **`koi_notification_id`**
(from `metadata.notification_event_id`) as the only correct dedupe key — 317 distinct across the
1,048 rows, and a verified 1:1 identity for `(item.id, device.id, finding_info.uid,
finding_info.created_time)`. Every widget, report or playbook that counts alerts must use
`count_distinct(koi_notification_id)`; a plain `count()` is wrong by two orders of magnitude.

Consequence for every population figure below: they are counts of **rows**, not of alerts, and
are only meaningful as ratios.

## The promoted columns

31 flat Alert columns, plus `marketplace_api` on the Audit statement.

| Group | Columns |
|---|---|
| `metadata` | **`koi_notification_id`** (the dedupe key — 317 distinct / 1,048 rows), **`koi_product_version`** (constant `1.7.0`; a change detector, not an analytic dimension) |
| `finding_info` | `finding_uid`, `finding_title`, `finding_created_time`, `alert_type` |
| `observables[]` | `item_id`, `item_type`, `alert_item_version` (empty-string guarded), `item_marketplace`, `device_os_obs`, `device_serial`, `koi_event_id` |
| `resources[type="device"]` | `device_id`, `alert_hostname`, `device_last_seen`, `device_last_user`, `device_status`, `device_registered_at` |
| `resources[type="item"]` | `item_package_name`, `item_risk_level`, `item_criticality` |
| `resources[type="mcp"]` | `mcp_id`, `mcp_package_name`, `mcp_type`, `mcp_transport`, `mcp_url`, `mcp_risk_level`, `mcp_risk_status`, `mcp_criticality` |
| Derived | `item_marketplace_api` (from `item_marketplace`, in a later alter stage) |

`koi_notification_id` and `koi_product_version` are the two columns added by the duplication fix;
they take the count from 29 to 31. `koi_notification_id` **is not redundant with `koi_event_id`** —
the latter is a per-scan-batch UUID with only 20 distinct values across the same 1,048 rows.

Two columns are deliberately **not** the alert identity, and neither should be treated as one:
`finding_uid` is the finding/**policy definition** id (3 distinct values across 1,040 alerts) and
`koi_event_id` is the scan batch. The hierarchy is batch (20) ⊃ notification (317) ⊃ rows (1,048).

## The parsing → modeling dependency

**These two rules must be deployed together.** The modeling rule
(`ModelingRules/KoiContentExtension/`) does not re-walk the JSON — its Alerts block reads nine of
the flat columns this rule creates (`alert_type`, `finding_title`, `device_id`, `alert_hostname`,
`device_os_obs`, `device_last_user`, `item_id`, `item_type`, `item_marketplace_api`), and its
Audit block reads one (`marketplace_api`).

Deploy the modeling rule without this parsing rule and **12 of the Alerts block's 20 mappings
resolve to null with no error**: `xdm.event.type`, `xdm.alert.name`, the entire
`xdm.target.host.*` block (`device_id` / `hostname` / `os` / `os_family`),
`xdm.source.user.username` and the entire `xdm.target.resource.*` block (`id` / `name` / `type` /
`sub_type`). `xdm.alert.risks` degrades silently to `[null, <risk_level>]`.

The 8 that survive without this rule are `xdm.event.id` (= `_id`, an XSIAM-internal column),
`xdm.alert.description`, `xdm.alert.severity`, `xdm.alert.subcategory` and the four-field observer
block. Do not list `xdm.event.id` among the casualties — it has no parsing-rule dependency at all.

The most deceptive failure is `xdm.target.host.os_family`: it does not go null by omission — it
evaluates `if(null = "windows", …)`, falls through the chain, and lands on the explicit
`to_string(null)` default. It looks like a deliberate "unknown", not a missing dependency.

`koi_notification_id` and `koi_product_version` are **not** in the dependency list, deliberately.
Neither has an XDM home: XDM has no "this row is a duplicate" field, so deduplication cannot be
expressed in the modeling rule and has to be done by every consumer at query time. Both remain
queryable raw dataset columns.

### Two mappings were removed on purpose — do not re-add them

Both were removed from the modeling rule on **21 July 2026** after live measurement, and the rule
carries a DO-NOT-RE-ADD comment at each site.

| Removed mapping | Was | Why it is gone |
|---|---|---|
| `xdm.alert.original_alert_id` | `finding_uid` | `finding_uid` is the finding/**policy definition** id, not an alert identity — **3 distinct values across 1,040 alerts** (`20940 "MCP Servers alerts"`, `23300 "NPM Block CS"`, `20907 "yito test"`). Every alert a policy ever raises shares it. Koi supplies no per-alert vendor identifier on this stream, so the field stays empty |
| `xdm.target.host.fqdn` | `alert_hostname` | Hostnames contain a dot on **0 of 1,138 rows** — they are bare names. `xdm.target.host.hostname` already carries them correctly |

`finding_uid` is still promoted by this rule and is still a good column for "which policy is
noisy". What it is not is an identity. The two obvious substitutes for `original_alert_id` were
both rejected: `_id` is the XSIAM row id (XSIAM minted it, Koi never saw it) and
`koi_notification_id` is a notification/delivery id. An empty field is a true statement; a
populated one that is wrong is a silent cross-source join failure.

The Audit block is **very nearly** standalone — it reads raw columns for everything **except**
`xdm.target.resource.sub_type`, which reads `marketplace_api`, a column this rule creates. (An
earlier version of this README claimed the Audit block was fully standalone. That stopped being
true when `sub_type` moved to the API vocabulary; corrected 21 July 2026 to match the modeling
rule's own note at its lines 18-21.) Its other tie to this file is `_time`.

## The two marketplace vocabularies

Koi states the same fact in two different vocabularies, and only one of them is accepted by the
Koi API. This rule therefore promotes **both**, and never conflates them.

| Column | Vocabulary | Use it for |
|---|---|---|
| `item_marketplace` (Alerts) | short **event** form — `chrome`, `vsc`, `software_windows` | display, and matching other raw event data |
| `marketplace` (Audit, raw Koi column — not created here) | short **event** form | display |
| **`item_marketplace_api`** (Alerts) | **API** form — `chrome_web_store`, `vscode`, `windows` | the `marketplace` argument of `koi-inventory-item-get`, `koi-inventory-item-endpoints-list`, `koi-blocklist-items-add` and every other command that takes it |
| **`marketplace_api`** (Audit) | **API** form | same |

Passing a short form to a command returns **HTTP 400**. Only `npm` and `pypi` are spelled the same
in both vocabularies, so almost everything else breaks. Verified 21 July 2026 against
`GET /inventory?marketplace=`.

Three values have **no** API equivalent and are mapped to **NULL**, deliberately: `built_in` and
`side_loaded` are `installation_method` values leaking into the `marketplace` field, and `ollama`
is absent from the API's list entirely (respectively 829, 1 and 5 events across both streams,
21 July 2026 — a moving count, quoted only to show which branches are load-bearing). A null
`*_api` column means "unknown marketplace — cannot call an item-scoped command", **not** "fall
back to the raw value".

The mapping is not guesswork. The alert payload carries the field twice: the observable
`item.marketplace` is the short form while the item resource's `data.marketplace` is already the
API form, and on live rows the two agree with this table on 296 of 296 extension rows (21 July
2026) — Koi itself says `chrome` → `chrome_web_store`.

## Parsing applies AT INGEST ONLY

XSIAM evaluates parsing rules as events arrive. **Rows already in `koi_koi_raw` are never
reprocessed.** On the validation tenant that is roughly 21,200 rows (1,048 Alert rows and 20,148
Audit rows over 90 days, measured 21 July 2026) which will show **null for every promoted column,
permanently.**

Consequences:

1. After deploying, you must **fetch fresh alerts** before anything shows up. Nothing you can do
   to the rule will backfill history.
2. Any dashboard or XQL widget that reads a promoted column needs a **time filter starting at the
   deployment moment**, or it will average real data against a large block of nulls and look
   broken.
3. If the promoted columns are empty right after deployment, that is expected — it is not
   evidence the rule is wrong.

## Validation status

Every extraction expression here was prototyped in plain XQL against the live dataset (90 days,
1,048 Alert rows / 20,148 Audit rows, measured 21 July 2026) before being written into the rule.
That is
possible because the rule deliberately avoids XQLi-only constructs: `arraymap` + `@element` was
rejected in favour of verbose `coalesce` + `if` chains precisely so each expression can be pasted
into a search bar. **Keep that constraint when editing** — the verbosity is the test loop.

Two things cannot be pre-flighted in XQL and are only observable after deployment: the `[INGEST:]`
header itself, and `alter _time = …` (`_time` is reserved and assignable only in a parsing-rule
context).
