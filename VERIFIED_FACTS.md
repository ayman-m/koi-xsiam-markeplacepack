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
| Real behaviour of each command | **[LIVE] partially resolved** | The **API behind** all 13 commands was exercised read-only. The commands themselves could **not** be executed through XSIAM — see §6 |

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
**67 arguments**, **131 output declarations** spanning **68 distinct context paths**. The gap
between 131 and 68 is real and worth knowing: 36 paths are declared by more than one command —
all nine `Koi.Policy.*` paths appear in both `koi-policy-list` and `koi-policy-status-update`, and
the 27 `Koi.Inventory.*` paths are declared identically by `koi-inventory-list`,
`koi-inventory-item-get` and `koi-inventory-search`. Three commands writing the same context
prefix means **the last command to run overwrites the previous one's context**.

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

## 5. Two defects in the pack as shipped **[LIVE]**

Both were found by exercising the live API and comparing it with what the pack declares.

### 5.1 The `view` dropdown omits three valid values

The API states its own contract in its 400 response:

> `view must be one of the following values: agentic_ai, ai_models, all_items, code_packages,
> extensions, mcp_servers, os_packages, repositories, software`

The YAML's `predefined` list for `view` offers only six. Missing: **`all_items`**,
**`mcp_servers`**, **`repositories`**. Nothing in the YAML is *invalid* — the list is incomplete.

This matters most for **`mcp_servers`**, the MCP-server audit case. It works when typed by hand
(`view=mcp_servers` returned HTTP 200, `total_count` 21 on `KOI_PAET` and 42 on `KOI_PLTS`), but
the XSOAR argument dropdown will never offer it.

### 5.2 The pack's own command example is broken

`Packs/Koi/Integrations/Koi/command_examples.txt` contains `view=browser_extensions`.
That value is in **neither** the YAML `predefined` list **nor** the API's accepted set; the live
API rejects it with **HTTP 400**. Anyone copying the shipped example gets an error.

`ide_extensions` and `packages` likewise return HTTP 400.

### 5.3 `koi-inventory-search` needs a structured filter

An empty filter is rejected. The API requires the query-builder shape:

```json
{"combinator": "and", "rules": [{"field": "risk_level", "operator": "=", "value": "high"}]}
```

Verified working: that exact filter returned `total_count` 145 on `KOI_PAET`.
The `filter_json` argument is documented as "query builder syntax" but the pack gives no example
of the shape, and the failure mode is a bare HTTP 400.

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

| | `KOI_PAET` | `KOI_PLTS` |
|---|---|---|
| Inventory items | 3,447 | 5,644 |
| Policies | 32 | 28 |
| Allowlist entries | 0 (empty) | 5 |
| Blocklist entries | 0 (empty) | 17 |
| `view=mcp_servers` | 21 | 42 |
| `view=software` | 406 | 1,044 |
| Alerts available via API | 296 | 48,526 |
| Audit records available via API | 8,789 | 96,196 |

The two tenants hold **very different** data volumes. Any test guide that quotes an expected row
count must name the tenant it was measured on.

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
