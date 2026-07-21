# Verified facts — Marketplace KOI pack v1.2.3

**Pack under test:** the official **Marketplace** KOI pack from `demisto/content`
(`Packs/Koi`, `currentVersion` **1.2.3**, 13 commands, integration only).
**Not** the custom in-house pack (v1.3.0, 26 commands) at `../KOI`.

**Verified:** 20 July 2026, on tenant `api-ayman.xdr.eu.paloaltonetworks.com` (EU),
instances `KOI_PAET` and `KOI_PLTS`.

Every claim below is either **[YAML]** (derived at build time from the pinned
`reference/marketplace-Koi.yml`, md5 `5497cdddedeb0c0d7d0b371aa075a64c`, byte-identical to
`demisto/content@master`), **[LIVE]** (observed on the tenant or the KOI API on the date above),
or **[UNVERIFIED]** (stated as such, never asserted).

Nothing in this file may be copied from the custom pack's documentation without re-checking.

---

## 1. Evidence status of the brief's open questions

| Question from `SESSION_BRIEF.md` §5 | Status | Answer |
|---|---|---|
| Which pack is installed | **[LIVE] resolved** | Marketplace pack. Instance brand `KOI`, both instances enabled |
| The dataset name | **[LIVE] resolved** | **`koi_koi_raw`** — no longer an inference |
| Whether `Fetch events` appears | **[LIVE] resolved** | Yes. `isFetchEvents: true` set and enabled on both instances |
| Real behaviour of each command | **[LIVE] partially resolved** | The API behind **8 of the 13** commands was exercised read-only. The 5 state-changing commands were deliberately **not run**, and the commands themselves could **not** be executed through XSIAM — see §6 |

### 1.1 Exactly which commands were exercised

Stating this precisely, because "all 13 were verified" would be false.

**Exercised against the live API (8):** `koi-policy-list`, `koi-allowlist-get`,
`koi-blocklist-get`, `koi-inventory-list`, `koi-inventory-item-get`,
`koi-inventory-item-endpoints-list`, `koi-inventory-search`, `koi-get-events`
(both `/alerts` and `/audit-logs`).

**Deliberately not run (5)** — every one changes tenant state:
`koi-policy-status-update`, `koi-allowlist-items-add`, `koi-allowlist-items-remove`,
`koi-blocklist-items-add`, `koi-blocklist-items-remove`.

> ⚠️ **The pack flags only 2 of those 5 as harmful.** `execution: true` is set on
> `koi-allowlist-items-remove` and `koi-blocklist-items-remove` only. The two **add** commands and
> `koi-policy-status-update` (PUT `/policies/{id}`) mutate governance state with no such flag, so
> they do not get the confirmation treatment that `execution: true` triggers. Treat "not flagged"
> as "not flagged", not as "safe".

> ⚠️ **`koi-get-events` is not safely repeatable either**, despite being a GET. The pack's own
> description says it is "for development and debugging only, as it may produce duplicate events,
> exceed API rate limits, or **disrupt the fetch mechanism**". Its `should_push_events` argument
> (default `false`) **writes events into `koi_koi_raw` when set to `true`**. So of the 8 non-mutating
> commands, 7 are freely repeatable and this one is not. Do not put it in a "safe to repeat" list
> without that caveat.

---

## 2. Integration configuration **[LIVE]**

Both instances are configured identically apart from their API key:

| Parameter | Value on both instances |
|---|---|
| `url` (Server URL) | `https://api.prod.koi.security/` |
| `isFetchEvents` (Fetch events) | `true` |
| `event_types_to_fetch` | `["Alerts", "Audit"]` |
| `audit_types_filter` | `[]` (no filter — all audit types) |
| `max_fetch` | `5000` |
| `eventFetchInterval` | `1` (minute) |
| `insecure` / `proxy` | `false` / `false` |

> ⚠️ **The event collector is disabled on XSOAR.** The YAML sets `isfetchevents: true`
> (line 990) and then overrides it on the very next line with **`isfetchevents:xsoar: false`**
> (line 991). Every Collect-section parameter is likewise `hidden: [xsoar]`. Event collection
> therefore works on **XSIAM / platform only** — on an XSOAR tenant the pack is a command
> integration and nothing else. `pack_metadata.json` still lists `xsoar` among its marketplaces.

**Both instances run through an engine**, not direct tenant egress
(engine `c3664d21-63fb-4b2c-b16c-56cd547a3d79`, `propagationLabels: ["all"]`). This matters: the
tenant's own egress to `api.prod.koi.security` is not the path in use, so a reachability test from
the tenant proves nothing about the path the commands actually take.

> **Caveat worth stating in any guide:** both instances have `isFetchEvents: true` and both fetch
> `Alerts,Audit` into the **same** `koi_koi_raw` dataset. Two collectors, one dataset. The pack
> ships no field identifying which instance produced a row.

---

## 3. Event collection **[LIVE]**

Confirmed by XQL over a 30-day window (20 June – 20 July 2026):

- Dataset **`koi_koi_raw`** exists and is populated: **20,156 events**, **80 distinct hostnames**.
- `_vendor = "koi"`, `_product = "koi"` — consistent with `send_events_to_xsiam(vendor="koi",
  product="koi")` in `Koi.py`.

### 3.1 One dataset, two incompatible schemas

`source_log_type` is the discriminator:

| `source_log_type` | Count (30 d) | Schema |
|---|---|---|
| `Audit` | 19,842 | Flat, KOI-native |
| `Alerts` | 314 | **OCSF** |

**Audit rows** carry `type`, `action`, `category`, `object_name`, `object_type`, `hostname`,
`item_version`. Observed `type` values and counts: `extensions` 16,579 · `devices` 2,971 ·
`remediation` 244 · `policies` 32 · `approval_requests` 8 · `guardrails` 6 · `notifications` 2.
Observed `category`: `system` 16,825 · `user` 3,017.

**Alert rows** are OCSF: `class_uid 2007` ("Application Security Posture Finding"),
`type_uid 200701`, `is_alert: true`, plus `severity_id`, `confidence_id`, `risk_level_id`,
`status_id`.

> ⚠️ **On alert rows, `resources`, `observables` and `metadata` are JSON *strings*, not objects.**
> XQL must `json_extract` them. A query that treats them as structured fields silently returns
> nothing.

> ⚠️ **`alert_type` is never populated** — a `filter alert_type != null` over the full 30 days
> returns zero rows. Any query or playbook keyed on `alert_type` (as the custom pack's triage is)
> matches nothing here.

### 3.2 No normalisation

All OCSF fields are null on Audit rows and all Audit fields are null on Alert rows. **No XDM
fields are populated at all** — the Marketplace pack ships no parsing rule and no modeling rule,
so nothing maps this data to the Cortex Data Model. Queries must target raw fields.

---

## 4. The command surface **[YAML]**

13 commands, verified by machine diff against the pinned YAML — the extraction matched
character-for-character on every command name, every argument (`name`, `required`, `defaultValue`,
`isArray`, `predefined`) and every output context path.

Counts, derived mechanically by `scripts/build_pack_json.py` (not transcribed): **13 commands**,
**67 arguments**, **131 output declarations** spanning **68 distinct context paths**.

The gap between 131 and 68 is 63 *redundant declarations*, arising from **36 distinct paths that
more than one command declares** (do not describe 63 as a number of paths):

- All **9** `Koi.Policy.*` paths are declared by both `koi-policy-list` and
  `koi-policy-status-update`.
- All **27** `Koi.Inventory.*` item paths are declared identically by **three** commands:
  `koi-inventory-list`, `koi-inventory-item-get` and `koi-inventory-search`.

**Those three overwrite each other**: running one after another leaves only the last one's
results in `Koi.Inventory`. Two `koi-inventory-list` calls with different filters in one playbook
branch do not accumulate — the second replaces the first.

`koi-inventory-item-endpoints-list` is **not** part of that collision. It writes only the 10
nested `Koi.Inventory.Endpoint.*` paths and shares no context path with the other three.

Four commands declare **no outputs at all** (`koi-allowlist-items-add` / `-remove`,
`koi-blocklist-items-add` / `-remove`) — they return a war-room message only, so a playbook cannot
branch on their result.

Five context prefixes are declared, and the integration code's `outputs_prefix` values agree:
`KOI.Event`, `Koi.Policy`, `Koi.Allowlist`, `Koi.Blocklist`, `Koi.Inventory`
(with `Koi.Inventory.Endpoint` nested beneath the last).

**`Koi.Device.*` does not exist.** `grep -c 'Koi\.Device\.'` returns **0** in `Koi.yml`, in
`Koi.py`, and in the integration README. The data model is **item-centric**: endpoints are reached
only from an item, via `Koi.Inventory.Endpoint.*`.

Two commands are marked `execution: true` (potentially harmful): `koi-allowlist-items-remove` and
`koi-blocklist-items-remove`.

### 4.1 Endpoint map **[LIVE, from `Koi.py`]**

Base `https://api.prod.koi.security` + `/api/external/v2`. Auth: `Authorization: Bearer <api_key>`.

| Command | Method | Path |
|---|---|---|
| `koi-policy-list` | GET | `/policies` |
| `koi-policy-status-update` | PUT | `/policies/{id}` |
| `koi-allowlist-get` | GET | `/policies/allowlist` |
| `koi-allowlist-items-add` / `-remove` | POST / DELETE | `/policies/allowlist` |
| `koi-blocklist-get` | GET | `/policies/blocklist` |
| `koi-blocklist-items-add` / `-remove` | POST / DELETE | `/policies/blocklist` |
| `koi-inventory-list` | GET | `/inventory` |
| `koi-inventory-search` | POST | `/inventory/search` |
| `koi-inventory-item-get` | GET | `/inventory/{item_id}` |
| `koi-inventory-item-endpoints-list` | GET | `/inventory/{item_id}/endpoints` |
| `koi-get-events` | GET | `/alerts` and `/audit-logs` |

---

## 5. Findings from exercising the live API **[LIVE]**

Five findings, of **three different kinds** — do not describe them all as "defects":

| | Finding | Kind |
|---|---|---|
| 5.1 | The `view` dropdown omits three valid values | **Defect in the shipped pack** |
| 5.2 | `command_examples.txt` ships a value the API rejects | **Defect in the shipped pack** |
| 5.3 | `koi-inventory-search` needs a filter shape the pack never illustrates | Documentation gap |
| 5.4 | Allowlist/blocklist responses carry no `total_count` | API response-shape observation |
| 5.4a | An invalid key returns 401; no 403 was ever seen | Behaviour worth knowing |

Only **5.1 and 5.2 are faults in the pack as published**.

### 5.1 The `view` dropdown omits three valid values

The API states its own contract in its 400 response:

> `view must be one of the following values: agentic_ai, ai_models, all_items, code_packages,
> extensions, mcp_servers, os_packages, repositories, software`

The YAML's `predefined` list for `view` offers only six. Missing: **`all_items`**,
**`mcp_servers`**, **`repositories`**. Nothing in the YAML is *invalid* — the list is incomplete.

**All twelve values were probed individually on both instances** — the nine the API names, plus the
three a reader might plausibly guess. Nothing in this table is inferred; the raw results are in
`evidence/followup-probes.json`.

| `view` value | In YAML dropdown | HTTP | `total_count` `KOI_PAET` | `KOI_PLTS` |
|---|---|---|---|---|
| `agentic_ai` | ✓ | 200 | 226 | 1,342 |
| `ai_models` | ✓ | 200 | 3 | 28 |
| `code_packages` | ✓ | 200 | 2,315 | 2,572 |
| `extensions` | ✓ | 200 | 180 | 417 |
| `os_packages` | ✓ | 200 | 350 | 393 |
| `software` | ✓ | 200 | 406 | 1,046 |
| **`mcp_servers`** | **✗** | 200 | 21 | 42 |
| **`repositories`** | **✗** | 200 | 15 | 77 |
| **`all_items`** | **✗** | 200 | **0** | **0** |
| `browser_extensions` | ✗ | **400** | — | — |
| `ide_extensions` | ✗ | **400** | — | — |
| `packages` | ✗ | **400** | — | — |

This matters most for **`mcp_servers`**, the MCP-server audit case: it works when typed by hand,
but the XSOAR argument dropdown will never offer it. `repositories` is likewise real data (15 / 77
items) that the dropdown hides.

> **`all_items` is accepted but returned zero rows on both tenants**, while every other accepted
> value returned real data. Its name implies "everything" and it delivers nothing. Treat an empty
> result from `view=all_items` as expected behaviour here, not as an empty inventory — and prefer
> omitting `view` entirely, which returned 3,447 / 5,644 items.

### 5.2 The pack's own command example is broken

`Packs/Koi/Integrations/Koi/command_examples.txt` contains **`view=browser_extensions`**.
That value is in **neither** the YAML `predefined` list **nor** the API's accepted set; the live
API rejects it with **HTTP 400**. Anyone copying the shipped example gets an error.

`ide_extensions` and `packages` also return 400, but — unlike `browser_extensions` — **they do not
appear in the shipped example**. They are simply values a reader might guess.

### 5.3 `koi-inventory-search` needs a structured filter

The API requires the query-builder shape:

```json
{"combinator": "and", "rules": [{"field": "risk_level", "operator": "=", "value": "high"}]}
```

Verified working: that exact filter returned `total_count` 145 on `KOI_PAET`.

Three distinct failure modes, all verified — do not conflate them:

| What happens | Result |
|---|---|
| Command run with neither `filter_json` nor `filter_raw_json_entry_id` | The **integration** stops it: `Koi.py` raises "Either 'filter_json' or 'filter_raw_json_entry_id' must be provided." No API call is made |
| Filter present but malformed (e.g. `{}`) | API **400**, and the body names the problem: `filter.combinator must be one of the following values: and, or` … `filter.rules must be an array` |
| `filter` key omitted from the API request entirely | API **500 Internal Server Error** — reachable only by calling the API directly, not through the command |

The 400 is **not** opaque — it tells you exactly which keys are wrong. What the pack lacks is an
*example* of the shape, not a usable error message.

### 5.4a Authentication failure is unambiguous

An invalid bearer token returns **HTTP 401** `{"message":"Unauthorized","statusCode":401}`
(verified with a deliberately invalid key). No 403 was ever observed from this machine, so any
claim that "403 means blocked egress" is **[UNVERIFIED]** here and must not be stated as fact.

### 5.4 Allowlist and blocklist responses carry no total

`/policies/allowlist` and `/policies/blocklist` return **only** an `items` array — no
`total_count`, unlike `/policies` and `/inventory`. A guide that tells a reader to check
`total_count` on these two commands is telling them to read a field that never exists. Both lists
were empty on `KOI_PAET`, which is also the case where an empty `items` array is the correct,
non-error result.

---

## 6. What could **not** be verified, and why **[UNVERIFIED]**

**The 13 commands were not executed through XSIAM.** This is a tenant limitation, not a pack
fault, and it is the one gap in this evidence base:

- `POST /investigations/search` → 303 redirect to `/#/404`. `demisto-sdk run` depends on this
  endpoint and therefore cannot run commands on this tenant at all.
- `POST /incident` → HTTP 200 with an **empty body**; no incident is created. XSIAM does not
  accept incident creation over the XSOAR API.
- An API-key user's playground is auto-created as a malformed stub (`type: 0`,
  `modified: 0001-01-01T00:00:00Z`). Every command run there — including the built-in `!Print` —
  returns `Panic [runtime error: invalid memory address or nil pointer dereference] (56)`.

Command behaviour was therefore verified one layer down, against the same endpoints, with the same
bearer auth and the same API keys the two instances use. What that **does** establish: the
endpoints exist, the parameters are accepted or rejected as described, and the response shapes are
as recorded. What it **does not** establish: the XSOAR-side context mapping and human-readable
output. Those are asserted from the YAML and `Koi.py` and are marked **[YAML]** wherever used.

**To close this gap**, run the command sweep from the XSIAM UI war room (which does not use the
API path that fails) and compare against `evidence/command-sweep.json`.

---

## 7. Live tenant shape at time of check **[LIVE]**

Recorded so later readers can tell whether a difference is a change or an error.

> ⚠️ **These counts drift. Never quote one as an expected result.**
> Two sweeps a few hours apart on 20 July 2026 returned different totals for the same query on
> `KOI_PLTS`: inventory **5,644 → 5,646**, `view=software` **1,044 → 1,046**.
>
> The drift is **per tenant, not universal** — `KOI_PAET` returned 3,447 in both sweeps. And it is
> **between** runs, never within one: probing twice inside a single run returned identical values
> every time (recorded as `attempt_within_run` 1 and 2 in `evidence/followup-probes.json`). So this
> is real inventory growth on one tenant, not instability in the API and not a fault in either sweep.
>
> Where the two evidence files disagree, `evidence/command-sweep.json` is the earlier reading and
> `evidence/followup-probes.json` the later one. Both are correct as of their own run, and both
> drifting pairs are now recoverable from the files themselves.
>
> **Consequence for the test guide:** an expected result must be a *shape* — HTTP 200, a
> `total_count` present and non-zero, the expected fields on the first record — never a specific
> number. A reader whose count differs has not failed a test.

| | `KOI_PAET` | `KOI_PLTS` |
|---|---|---|
| Inventory items | 3,447 | 5,644 (later 5,646 — see drift note) |
| Policies | 32 | 28 |
| Allowlist entries | 0 (empty) | 5 |
| Blocklist entries | 0 (empty) | 17 |
| `view=mcp_servers` | 21 | 42 |
| `view=software` | 406 | 1,044 (later 1,046 — see drift note) |
| Alerts available via API | 296 | 48,526 |
| Audit records available via API | 8,789 | 96,196 |

The two tenants hold **very different** data volumes. Any test guide that quotes an expected row
count must name the tenant it was measured on.

---

## 7a. Portable additional content — the Script Runner playbooks **[LIVE, re-verified]**

Re-checked first-hand in this session against `../KOI/Playbooks/` (read-only). The three
`Koi Unified` playbooks contain **no `koi-*` string whatsoever** — not a command, not a reference:

| Playbook | `koi-*` commands | Cortex-native commands |
|---|---|---|
| `Koi Unified - Script Runner` | none | — (`PrintErrorEntry`, `SetAndHandleEmpty`, `Builtin\|\|\|closeInvestigation`) |
| `Koi Unified - Process Config Entry` | none | — (`Print`, `PrintErrorEntry`, `DeleteContext`, `SetAndHandleEmpty`) |
| `Koi Unified - Execute Endpoint Script` | none | `core-get-scripts`, `core-get-endpoints`, `core-script-run` |

They are therefore **fully portable** to a tenant running the Marketplace pack. They are **not part
of the Marketplace pack** and must be labelled as additional content wherever they appear.

> **Precision, because this is easy to overstate:** they call no **KOI** command. They are not
> command-free. Besides the three `core-*` commands, they use the common automations
> `Print`, `PrintErrorEntry`, `SetAndHandleEmpty`, `DeleteContext`, `GetErrorsFromEntry` and the
> builtin `closeInvestigation`. Write "the only *KOI* commands they invoke: none", never "the only
> commands they invoke are the three `core-*` ones".

For contrast, the remaining custom-pack playbooks depend on commands that do not exist here:
`KOI - Alert Triage` and `KOI - Enrich Item` need `koi-koidex-risk-report`;
`KOI - Investigate Device` needs `koi-device-inventory-get` and `koi-remediations-list`;
`KOI - Investigate Item` needs `koi-approval-requests-list`, `koi-koidex-risk-report` and
`koi-remediations-list`. `KOI - MCP Server Audit` (`koi-inventory-list`) and
`KOI - Block and Remediate` (`koi-blocklist-items-add`) use only commands that **do** exist —
but the latter calls `KOI - Investigate Item` as a sub-playbook, which does not work here.

---

## 7b. End-to-end scan → event test, 21 July 2026 **[LIVE]**

Ran a controlled test: trigger a KOI scan on a Cortex-managed endpoint and watch for the resulting
events. Target `win-workstation` (GCP `agentic-testbed`, 10.10.0.83, Cortex agent
`290c8b85…`, `CONNECTED`, server-tagged `koi`). Driver: `scripts/trigger_koi_scan.py`.

**What was proven:**

1. **KOI is genuinely run-on-demand on Windows.** Both test hosts (`win-workstation`,
   `koi-win-test`) had produced no events since 15 July — six days — while other hosts reported
   continuously. Nothing is wrong with them; nothing had run the scan.
2. **The scan works via `core-script-run`.** `KOI Deployment Script - Windows`
   (uid `1235651ddbe44047a3f7dfe3f3b97003`) returned `COMPLETED_SUCCESSFULLY` in 135 s, then 60 s
   on a second run. This is the same name→uid→run path the Script Runner playbook uses.
3. **The mtime freshness proof works, and is now re-verified first-hand** (it was inherited from
   the custom-pack investigation, §8). After the scan, `C:\ProgramData\Koi\settings.json`
   (mtime 03:35:22) and `agent_policies.json` (mtime 03:35:03) both carried fresh timestamps —
   proving an authenticated backend round trip. `agent_activity.jsonl` and
   `agent_enforcement.log` were 0 bytes at 15 July, matching "zero when idle".
4. **KOI → XSIAM ingestion is near-real-time.** An `mcp-gateway installed` event observed on the
   KOI API at **03:54:59** appeared in `koi_koi_raw` stamped **03:54:59**, fetched within minutes.
   The full pipeline is healthy.

**What did not work, and why it matters:**

5. **KOI events are change-driven, not scan-driven.** A scan of an unchanged host produced no
   events at all. Triggering a scan is not sufficient to generate data — something must change.
6. **A `pip install` from the Cortex agent is not inventoried.** `tabulate==0.9.0` installed
   successfully, but landed in `C:\Windows\system32\config\systemprofile\AppData\Local\Python\…`
   because the Cortex agent runs as **SYSTEM**. KOI never saw it:
   `GET /inventory/tabulate/endpoints?marketplace=pypi&version=0.9.0` → **404**, while
   `version=0.10.0` → 200 with two other hosts. PyPI inventory itself works (1,990 items on
   `KOI_PAET`, 2,169 on `KOI_PLTS`), and `settings.json` shows `pypi.enabled = true`.
   **To generate detectable activity, the change must occur in a user profile the agent scans —
   not in the SYSTEM profile.**
7. **Neither test host appears in `GET /devices`** (51 devices on `KOI_PAET`) despite both having
   events in `koi_koi_raw`. No `devices/archived` event exists for either. Unexplained — treat the
   device list as **not** a complete inventory of hosts that have reported.

**Two API behaviours worth documenting:**

- An unknown `(item_id, marketplace, version)` triple returns **HTTP 404**, not an empty 200. Any
  playbook calling `koi-inventory-item-get` or `koi-inventory-item-endpoints-list` with a version
  that is not in inventory gets an error, not an empty result. Handle it as continue-on-error.
- `GET /devices` **ignores a `hostname` filter parameter** — it returns the full list regardless.
  Filter client-side.

### 7b.1 ⚠️ Tenant attribution has stopped being populated

| Window | Rows | with `koi_tenant_name` | with `koi_customer_id` |
|---|---|---|---|
| Last 90 days | 20,522 | 20,324 | 20,324 |
| **Last 3 hours** | **75** | **0** | **0** |

Every recently-ingested row lacks **both** fields. This directly affects the ported modeling rule,
which maps `xdm.observer.name = coalesce(koi_tenant_name, koi_customer_id)` and
`xdm.observer.unique_identifier = koi_customer_id` — **both resolve to null on current data.**

The mapping is not wrong, and the historical data supports it, but anyone relying on
`xdm.observer.name` to tell two KOI tenants apart will get nothing for events ingested from now
on. Re-check whether this is a transient KOI-side change before removing the mapping.

---

## 7c. ⚠️ The event and API `marketplace` vocabularies are different **[LIVE]**

**This breaks any content that reads `marketplace` from an event and passes it to a command.**
Verified 21 July 2026 by testing every value against `GET /inventory?marketplace=`.

The `marketplace` field in `koi_koi_raw` uses **short forms**; the API (and the pack's YAML
`predefined` list) uses **long forms**. Only `npm` and `pypi` are spelled the same in both.
Everything else returns **HTTP 400** if passed through unchanged.

| Event value (`koi_koi_raw`) | Events | API / YAML value | API items |
|---|---|---|---|
| `software_windows` | 5,301 | `windows` | 214 |
| `pypi` | 4,674 | `pypi` | 1,990 |
| `chrome` | 891 | `chrome_web_store` | 63 |
| `built_in` | 829 | **none — see below** | — |
| `npm` | 775 | `npm` | 325 |
| `software_mac` | 617 | `mac` | 192 |
| `homebrew` | 231 | `homebrew` | 322 |
| `vsc` | 175 | `vscode` | 64 |
| `chocolatey` | 91 | `chocolatey` | 28 |
| `cursor` | 88 | `cursor` | 11 |
| `github` | 65 | `github_mcp_registry` | 0 |
| `edge` | 48 | `edge_add_ons` | 11 |
| `firefox` | 19 | `firefox_add_ons` | 22 |
| `docker` | 15 | `docker` | 5 |
| `npp` | 12 | `notepad++` | 5 |
| `openvsx` | 10 | `open_vsx_registry` | 0 |
| `jet` | 5 | `jetbrains` | 1 |
| `ollama` | 5 | **none** | — |
| `claude_desktop_extensions` | 5 | `claude_desktop_extensions` | 3 |
| `side_loaded` | 1 | **none — see below** | — |

**Three values have no API equivalent.** `ollama` simply is not in the API's list. `built_in`
(829 events) and `side_loaded` are **`installation_method` values leaking into the `marketplace`
field** — the YAML declares `installation_method` as `[marketplace, manual, built_in,
side_loaded]`. Content must treat a `marketplace` of `built_in` / `side_loaded` as "unknown
marketplace", not pass it on.

Also note **15 of the 22 declared values never appear in the data at all**: `chrome_web_store`,
`edge_add_ons`, `firefox_add_ons`, `github_mcp_registry`, `hugging_face`, `jetbrains`, `linux`,
`mac`, `notepad++`, `office_add_ins`, `open_vsx_registry`, `visual_studio`, `vscode`, `windows`,
`windsurf`. They are valid API filters; they are just never what an event says.

> **Consequence for this pack:** `KOI Ext - Extract Alert Context` reads `item.marketplace` from
> the alert payload (`npm` 293, `chrome` 3 of 296) and downstream playbooks pass it to
> `koi-inventory-item-get`, `koi-inventory-item-endpoints-list` and `koi-blocklist-items-add`,
> all of which **require** `marketplace`. Unmapped, the `chrome` rows fail with HTTP 400 — and any
> audit-driven flow using `software_windows` fails on the most common value in the dataset.
> The mapping above must be applied between reading an event and calling a command.

---

## 8. Carried forward from the custom-pack investigation

These are pack-independent (`SESSION_BRIEF.md` §6) and were **not** re-verified in this session.
Mark them as inherited wherever they are used:

- There is no resident KOI agent on Windows — KOI is run-on-demand, so a scheduled Job *is* the
  scan scheduler.
- `C:\ProgramData\Koi\` holds `settings.json`, `agent_policies.json`, `agent_activity.jsonl`,
  `agent_enforcement.log`; `agent_policies.json` carries the `cid` and `deviceId`.
- Only a new mtime on `settings.json` / `agent_policies.json` proves an authenticated backend round
  trip. Reachability alone proves nothing.
- Extension display names come from `_locales\<lang>\messages.json`, not `manifest.json:name`.
- Installed software needs both registry hives (`…\Uninstall\*` and `WOW6432Node\…\Uninstall\*`).
- KOI bundles its own Python, so PyPI inventory appears on hosts where nobody installed Python.
- `powershell -Command -` executes piped stdin line-by-line and breaks multi-line blocks; use
  `-EncodedCommand`.
- Install path decides event collection: a pack zip built for the wrong marketplace target carries
  `isfetchevents: false` and ships no rules.
