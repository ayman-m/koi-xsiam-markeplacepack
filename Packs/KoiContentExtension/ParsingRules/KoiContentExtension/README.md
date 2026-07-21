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
| B | `filter source_log_type = "Alerts"` | promotes **29** flat columns out of the nested OCSF `finding_info` / `observables` / `resources` JSON (plus 2 working intermediates, `resources_str` / `observables_str`, which also persist as columns) |

`no_hit=keep` is required: rows matching neither filter still land in the dataset.

## The parsing → modeling dependency

**These two rules must be deployed together.** The modeling rule
(`ModelingRules/KoiContentExtension/`) does not re-walk the JSON — its Alerts block reads the flat
columns this rule creates (`item_id`, `item_type`, `item_marketplace_api`, `device_id`,
`alert_hostname`, `device_os_obs`, `device_last_user`, `finding_uid`, `finding_title`,
`alert_type`).

Deploy the modeling rule without this parsing rule and **16 of the Alerts block's 22 mappings
resolve to null with no error**: `xdm.event.type`, `xdm.alert.original_alert_id`,
`xdm.alert.name`, the entire `xdm.target.host.*` block, `xdm.source.user.username` and the entire
`xdm.target.resource.*` block. `xdm.alert.risks` degrades silently to `[null, <risk_level>]`.

The most deceptive failure is `xdm.target.host.os_family`: it does not go null by omission — it
evaluates `if(null = "windows", …)`, falls through the chain, and lands on the explicit
`to_string(null)` default. It looks like a deliberate "unknown", not a missing dependency.

The **Audit block is standalone** — it reads only raw columns and consumes zero parsing-rule
output. Its only tie to this file is `_time`.

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

Three values have **no** API equivalent and are mapped to **NULL**, deliberately: `built_in` (829
events) and `side_loaded` (1) are `installation_method` values leaking into the `marketplace`
field, and `ollama` (5) is absent from the API's list entirely. A null `*_api` column means
"unknown marketplace — cannot call an item-scoped command", **not** "fall back to the raw value".

The mapping is not guesswork. The alert payload carries the field twice: the observable
`item.marketplace` is the short form while the item resource's `data.marketplace` is already the
API form, and on live rows the two agree with this table 296/296 — Koi itself says
`chrome` → `chrome_web_store`.

## Parsing applies AT INGEST ONLY

XSIAM evaluates parsing rules as events arrive. **Rows already in `koi_koi_raw` are never
reprocessed.** On the validation tenant that is roughly 20,500 rows (314 Alerts, ~20,200 Audit,
90 days) which will show **null for every promoted column, permanently.**

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
314 Alerts / ~20,215 Audit rows, 21 July 2026) before being written into the rule. That is
possible because the rule deliberately avoids XQLi-only constructs: `arraymap` + `@element` was
rejected in favour of verbose `coalesce` + `if` chains precisely so each expression can be pasted
into a search bar. **Keep that constraint when editing** — the verbosity is the test loop.

Two things cannot be pre-flighted in XQL and are only observable after deployment: the `[INGEST:]`
header itself, and `alter _time = …` (`_time` is reserved and assignable only in a parsing-rule
context).
