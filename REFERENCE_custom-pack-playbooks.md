# Koi Unified Script Runner — Playbooks

A unified, job-driven playbook set for periodically executing the KOI deployment
script on Cortex-Agent endpoints. It merges four independently-built playbooks
(NE, the per-OS "Cortex - Trigger Koi Scan" pair, and the MMAA runner bundle)
into one architecture.

## Architecture

```
Job (time-triggered)
 └─ Koi Unified - Script Runner            (main; reads the "Koi Script Runner" List)
     └─ loop: for each configuration entry (separate context per entry)
         └─ Koi Unified - Process Config Entry   (validate, notify, cleanup)
             └─ Koi Unified - Execute Endpoint Script  (resolve UUID, target, run, ScriptResult)
```

## Configuration — the `Koi Script Runner` List (JSON array)

```json
[
  {
    "disabled": false,
    "script": {
      "name": "KOI Deployment Script - Windows",
      "uuid": "",
      "polling_interval_in_seconds": 60,
      "timeout_in_seconds": 1800
    },
    "target": {
      "endpoint_groups": ["KOI Endpoints"],
      "endpoint_hostnames": [],
      "endpoint_os": "Windows"
    },
    "notification": {
      "sendmail_instance": { "name": "internal-smtp" },
      "recipients": ["ops@example.com"]
    }
  }
]
```

Required per entry: `script.name` **or** `script.uuid`, `target.endpoint_os`,
and at least one of `target.endpoint_groups` / `target.endpoint_hostnames`.
Everything else is optional.

## What was taken from each source

| Source | Kept |
|---|---|
| MMAA bundle | 3-tier architecture, List-driven config, per-entry loop with separate context, script name→UUID resolution, `ScriptResult{ok, reason}` contract, per-entry `disabled` flag, context cleanup |
| Cortex per-OS pair | Configurable `polling_interval_in_seconds` / `timeout` on `core-script-run`, error-path discipline (`continueonerrortype: errorPath`), success/failure email content |
| NE - RunKoi | Connected-only + unisolated endpoint filtering before execution |

## Improvements over all four

- One playbook set for every OS — `endpoint_os` is data, not playbook identity
  (kills the Windows/macOS clone pair).
- Invalid config entries are **reported** (`PrintErrorEntry` with the offending
  entry) instead of silently filtered out.
- `script.uuid` supported as an alternative to `script.name` (skips library
  lookup; also disambiguates duplicate names).
- Script-resolution failures return distinct reasons: not found / multiple
  matches / library query failed.
- Notifications are brand-agnostic (`|||send-mail` + optional `using` instance)
  instead of hard-binding one mail integration.
- Per-entry polling/timeout overrides with sane defaults (60 s / 1800 s).
- Three-state result per entry: `ok` (script ran), `skipped` (valid entry but
  no connected endpoints currently match — logged as info, **no failure
  email**), and failed (real error — failure email sent). Keeps recurring
  jobs quiet for not-yet-populated OS scopes without hiding real failures.

## Alert triage playbooks

A second, independent playbook set triages KOI **alerts** ingested into Cortex XSIAM.

| Playbook | Role |
|---|---|
| `KOI - Alert Triage` | Main. Extracts context → runs the **full item investigation** (`KOI - Investigate Item`) → runs the **device investigation** (`KOI - Investigate Device`, when the alert carries a device) → enriches via `koi-koidex-risk-report` → computes a verdict → posts a summary → routes (auto-close / escalate / leave open). |
| `KOI - Extract Alert Context` | Sub. Parses the `koi_context={...}` JSON the collector embeds in the alert description into the `KoiContext` object (collapsing it to a single object so `KoiContext.<field>` resolves as a scalar, not a 1-element array). |
| `KOI - Investigate Item` | Sub. Given an item + marketplace, gathers a **comprehensive item investigation** into a `KoiInvestigation` object + war-room summary: catalog risk & AI risk summary (`koi-koidex-risk-report`), the org's inventory record (installs / signing / endpoint count / org risk), exposed endpoints & users (`koi-inventory-item-endpoints-list`, only when the installed version is known), governance state (`koi-blocklist-get`), and remediation & approval history filtered to the item. Best-effort; reusable outside triage. |
| `KOI - Investigate Device` | Sub. Given a device id (+ optional hostname), lists everything installed on the host (`koi-device-inventory-get`), flags items at/above the configured risk level (`risk_levels`, default `high,critical`), pulls host remediations (`koi-remediations-list hostname=…`), and posts a **device posture summary + a risky-items table**. Reusable standalone (pass a device id) or from triage (`KoiContext.device_id` / `alert_hostname`). Best-effort. |

**Verdict logic** (keyed on KOI's own `alert_type` and `risk_level`, with the catalog risk level as a bonus signal):

| Verdict | Condition | Action |
|---|---|---|
| **Malicious** | `alert_type` ∈ {Removed from Marketplace, Publisher Compromised, Unvetted MCP Server}, or `risk_level` High/Critical, or catalog risk high/critical | Raise severity, then — when the item is identifiable — open an **analyst-gated block** via `KOI - Block and Remediate` (`auto_block` forced `false`, so the blocklist write never fires without human approval) |
| **Benign** | `alert_type` = New Item **and** `risk_level` = Low | Auto-close (Resolved) |
| **Suspicious** | anything else (safe default) | Keep open for analyst |

Attach `KOI - Alert Triage` to KOI alerts (source `koi`). It reads the alert description from `${incident.details}`; if your alert generation maps the KOI payload to a different field, adjust the `alert_description` input on the extract sub-playbook.

Validated on-tenant end to end through an **office-egress engine** (so the KOI commands actually return data, not `403`): the triage runs `KOI - Investigate Item`, posts the investigation summary, and the verdict now reflects real catalog data — e.g. a `Vulnerable Dependency` alert on `axios` (whose KOI catalog risk is **High**) escalates to **Malicious**.

> Note: `KOI - Investigate Item` runs as a sub-playbook, where the platform's array/object DT handling differs from the parent; a few investigation-summary fields may render with array brackets (`["high"]`, `[0]`). The values are correct and the analyst-facing triage summary renders as clean scalars.

> The triage playbooks call `koi-koidex-risk-report` through a configured KOI integration instance. Enrichment is best-effort (continue-on-error): if the instance can't reach the KOI API, the verdict still resolves from the alert's own fields.

## Response & hunting playbooks

Built on the read-only + governance commands, these extend triage into response and proactive hunting:

| Playbook | Type | What it does |
|---|---|---|
| `KOI - Enrich Item` | Sub | Given an item + marketplace, gathers catalog risk (`koi-koidex-risk-report`) and endpoint exposure (`koi-inventory-item-endpoints-list`) into a `KoiEnrichment` object. Reusable by triage, block, and hunts. |
| `KOI - Block and Remediate` | Main | Runs the **full investigation** (`KOI - Investigate Item`), short-circuits if the item is **already on the org blocklist**, then presents an **analyst approval gate** showing the complete picture — catalog risk + AI summary, org risk / publisher / signing, installs, endpoints & affected users, remediation and prior-approval history — and only on approval adds it to the blocklist (`koi-blocklist-items-add`). Safe by default: the write never fires without approval unless `auto_block=true`. Analyst-invoked (supply `item_id` / `marketplace`), or callable as a sub-playbook from a Malicious triage verdict. |
| `KOI - MCP Server Audit` | Scheduled | Enumerates MCP-server inventory, flags those at/above a risk threshold, and reports them. Attach to a time-triggered Job for continuous agentic-AI hygiene. |

> **Connectivity requirement.** These playbooks call the KOI integration commands
> (koidex, inventory, blocklist) through a configured KOI instance. The XSIAM
> tenant's outbound path to `api.prod.koi.security` must be reachable for those
> `/api/external/v2/*` command endpoints — if the tenant egress isn't allowlisted
> by KOI, the commands return an edge `403 Forbidden` and enrichment/response
> degrade to best-effort (playbooks still complete; they just can't act on KOI
> data). Verify with `!koi-users-list limit=1`.

> The MCP audit's inventory query uses `koi-inventory-list view=mcp_servers`;
> confirm the `view`/filter matches your tenant's MCP categorization.

## External prerequisites (referenced by name, not shipped in the pack)

| Dependency | Where | Requirement |
|---|---|---|
| KOI script package(s) | Action Center → Scripts Library | Upload manually; Library name must match `script.name` exactly (or pin `script.uuid`) |
| Endpoint group(s) | Endpoints → Endpoint Groups | Groups in `target.endpoint_groups` must exist and contain the intended agents |
| Target agents | Endpoints | Installed, **connected**, unisolated, OS matching `endpoint_os` — otherwise the entry is `skipped` |
| Configuration List | Settings → Object Setup → Lists | JSON List named exactly `Koi Script Runner` |
| Mail-sender instance | Automation & Feed Integrations | Only for notifications; must be enabled and, when `sendmail_instance.name` is set, match that name exactly |

All references bind by name at run time: renaming any of these without updating the
List configuration causes the next run to fail or skip, with the reason recorded in
the war room.

## Known limitation

The main playbook reads the List named **`Koi Script Runner`** (fixed at the
task level — the `${lists.<name>}` accessor cannot be parameterized by a
playbook input). To use a different List name, edit the "Load the …
configuration" task in the main playbook.

## Job setup

Attach **`Koi Unified - Script Runner`** to a time-triggered Job
(Investigation & Response → Automation → Jobs). The playbook closes its own
investigation at the end of every run.
