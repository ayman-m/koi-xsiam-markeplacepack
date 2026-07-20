# Session brief — build the same content against the **Marketplace** KOI pack

**Read this before touching anything.** You are working with the *official* KOI pack from
`demisto/content`, **not** the custom in-house pack at `../KOI`. They share a name, an id and a
command prefix but are different implementations. Mixing them up is the single most likely way
this work goes wrong, which is why it has its own session.

> **Where this work lives.** The GitHub repository for the Marketplace-pack content is
> <https://github.com/ayman-m/koi-xsiam-markeplacepack>. Commit the guides, generators and any
> pack changes there — **not** to the custom-pack repository.
>
> **The custom pack** (reference only, do not edit) is the sibling checkout at `../KOI`, published
> at the team's custom-pack repository.

Every fact below was verified from source on 20 July 2026 — the demisto/content pack at `master`,
and the custom pack at `../KOI`. Where something is inferred rather than read, it says so.

---

## 1. Your goal

Reproduce, for the Marketplace pack, the deliverables that exist here for the custom pack:

| Deliverable | Custom-pack equivalent to model on |
|---|---|
| Customer / install guide | `../KOI/docs/build_guide.js` → `KOI_Integration_Customer_Guide_v1.3.0.docx` |
| Test guide (steps + expected results) | `../KOI/docs/build_test_guide.js` → `KOI_Content_Pack_Test_Guide.pptx` |
| Troubleshooting & data-provenance guide | `../KOI/docs/build_troubleshooting.js` → `KOI_Troubleshooting_Guide_v1.0.docx` |
| Overview deck | `../KOI/docs/build_deck.js` → `KOI_Content_Pack_Overview.pptx` |

Reuse the **generators** (they are self-contained Node scripts with a shared visual language and a
working docx/pptx → PDF path via LibreOffice). Do **not** reuse the **content** — most of it is
false for the Marketplace pack. See §4.

---

## 2. The two packs, side by side

| | **Marketplace pack** | **Custom pack (this repo)** |
|---|---|---|
| Location | `demisto/content` → `Packs/Koi/` | this repository |
| Version | `1.2.3` | `1.3.0` |
| `fromversion` | **6.10.0** | integration `8.2.0`; rules `8.4.0` |
| Commands | **13** | **26** |
| Content items | **integration only** | integration + 10 playbooks + parsing rule + modeling rule + dashboard |
| Parsing / Modeling rules | **none ship** | both ship, `supportedModules: [xsiam]` |
| Dashboard | none | `Koi_Alerts_Dashboard.json` |
| Playbooks | none | 10 |
| Context prefixes | 5 | **17** (226 declared outputs) |
| `isfetchevents` | `true`, with `isfetchevents:xsoar: false` | identical |
| Docker image | `demisto/fastapi:0.125.0.10158186` | `demisto/fastapi:0.125.0.9094740` |
| `supportedModules` | **key absent** | `[agentix, xsiam]` |
| Support / author | `xsoar` / Cortex XSOAR (certified) | `xsoar` / Cortex XSOAR |

Source: <https://github.com/demisto/content/tree/master/Packs/Koi>

### ⚠️ They collide — you cannot install both on one tenant

Both declare:

```
pack name        : KOI
integration id   : KOI      (commonfields.id)
integration name : KOI
category         : Endpoint
```

Installing one over the other **overwrites** it. Whichever tenant you test on, decide which pack
owns it and say so in the doc. If you need both, use separate tenants — do not attempt to rename
one to force coexistence unless that is an explicit, separate decision.

---

## 3. The command gap — 13 commands the Marketplace pack does **not** have

The Marketplace pack's 13 commands are a strict subset of the custom pack's 26.

**Present in both (13):**
`koi-get-events`, `koi-policy-list`, `koi-policy-status-update`, `koi-allowlist-get`,
`koi-allowlist-items-add`, `koi-allowlist-items-remove`, `koi-blocklist-get`,
`koi-blocklist-items-add`, `koi-blocklist-items-remove`, `koi-inventory-list`,
`koi-inventory-item-get`, `koi-inventory-search`, `koi-inventory-item-endpoints-list`

**Custom-only — absent from the Marketplace pack (13):**

| Missing command | What it means for the docs |
|---|---|
| `koi-devices-list` | **No device listing at all.** Any device-centric flow has no entry point |
| `koi-device-inventory-get` | No per-device inventory |
| `koi-koidex-risk-report` | **No catalog risk, no AI risk summary** — the corroborating signal behind the triage verdict |
| `koi-koidex-search` | No catalog search |
| `koi-remediations-list` | No remediation history |
| `koi-approval-requests-list` | No approval history |
| `koi-findings-list` | No findings |
| `koi-users-list` | No user listing — also the egress probe used in the custom test guide |
| `koi-groups-list` | No groups |
| `koi-runtime-policies-list`, `koi-runtime-policy-get` | No runtime policy surface |
| `koi-fetch-context-get`, `koi-fetch-context-set` | **No collector-cursor inspection** — the custom test guide uses this to prove fetch state |

---

## 4. What this breaks in the existing content — do not copy it forward

### 4.1 Playbooks

Verified by parsing each playbook's task scripts against the Marketplace command set:

| Playbook | Status on the Marketplace pack |
|---|---|
| `Koi Unified - Script Runner` | ✅ **Portable** — uses no `koi-*` command |
| `Koi Unified - Process Config Entry` | ✅ **Portable** |
| `Koi Unified - Execute Endpoint Script` | ✅ **Portable** |
| `KOI - Extract Alert Context` | ✅ Portable — parsing only |
| `KOI - Block and Remediate` | ✅ Commands exist — **but** its sub-playbook `KOI - Investigate Item` does not work |
| `KOI - MCP Server Audit` | ✅ Commands exist (`koi-inventory-list view=mcp_servers`) |
| `KOI - Alert Triage` | ❌ needs `koi-koidex-risk-report` |
| `KOI - Enrich Item` | ❌ needs `koi-koidex-risk-report` |
| `KOI - Investigate Device` | ❌ needs `koi-device-inventory-get`, `koi-remediations-list` |
| `KOI - Investigate Item` | ❌ needs `koi-approval-requests-list`, `koi-koidex-risk-report`, `koi-remediations-list` |

**The three Script Runner playbooks are fully portable** — they drive Cortex agents
(`core-get-scripts`, `core-get-endpoints`, `core-script-run`) and call no KOI API at all. That
is the one whole workflow that transfers unchanged.

The triage/investigation/response story does **not** transfer. Do not document it as if it does.

### 4.2 Event collection and the dashboard

The Marketplace pack ships **no parsing rule and no modeling rule**. Events are still sent
(`send_events_to_xsiam`, `vendor="koi"`, `product="koi"`), but nothing normalises them or maps
them to XDM.

- The XQL check in the custom test guide (`dataset = koi_koi_raw | comp count() …`) may still
  return rows, **but XDM fields will be empty** — there is no modeling rule to populate them.
- The bundled dashboard does not exist. Any dashboard test must be dropped or rewritten.
- ⚠️ **Unverified:** the dataset name. `{vendor}_{product}_raw` implies `koi_koi_raw`, but the
  Marketplace pack never declares it. **Confirm on a live tenant before printing it in a guide.**

### 4.3 Field names

The prefixes differ, and one absence is structural:

| Marketplace | Custom |
|---|---|
| `KOI.Event.*` | `KOI.Event.*` (same) |
| `Koi.Policy.*` | `Koi.Policy.*` |
| `Koi.Allowlist.*` / `Koi.Blocklist.*` | same |
| `Koi.Inventory.*` (27 fields) | `Koi.Inventory.*` (91 outputs) |
| `Koi.Inventory.Endpoint.*` | `Koi.Inventory.Endpoint.*` |
| — | `Koi.Device.*`, `Koi.DeviceInventory.*`, `Koi.KoidexRiskReport.*`, `Koi.KoidexItem.*`, `Koi.Remediation.*`, `Koi.ApprovalRequest.*`, `Koi.Finding.*`, `Koi.Group.*`, `Koi.User.*`, `Koi.RuntimePolicy.*`, `KOI.FetchContext.*` |

**There is no `Koi.Device.*` in the Marketplace pack.** Endpoints exist only nested under
`Koi.Inventory.Endpoint.*`, reached from an *item*. The mental model inverts: the Marketplace pack
is item-centric, the custom pack is item- **and** device-centric.

Both packs share the same casing inconsistency — `KOI.` for events, `Koi.` for everything else.
Preserve it in DT paths; do not "fix" it in documentation examples or they will not resolve.

---

## 5. What to verify on a live tenant before writing a word

Assume nothing from this brief that is marked unverified, and re-verify anything time-sensitive.

1. **Which pack is installed** on your test tenant. Both present as `KOI` — check
   `currentVersion` (1.2.3 vs 1.3.0) and count the commands (13 vs 26).
2. **The dataset name** events actually land in (§4.2).
3. **Whether `Fetch events` appears** on the instance — and note the install-path caveat below.
4. **The real behaviour of each command** you intend to document. Do not transcribe argument lists
   from the custom guide; the Marketplace `koi-inventory-list` has its own filter set
   (`brew_category_koi`, `browser_category_koi`, `chocolatey_category_koi`, `ide_category_koi`,
   `software_category_koi`, `installation_method`, `view`, …).

---

## 6. Carry these findings across — they are pack-independent

These came out of live investigation and hold regardless of which pack is installed. Reuse them;
they are the most valuable part of the existing troubleshooting guide.

- **There is no resident KOI agent on Windows.** No service, no process, no scheduled task. KOI is
  run-on-demand, so a scheduled Job *is* the scan scheduler.
- **`C:\ProgramData\Koi\` file map** — `settings.json`, `agent_policies.json`,
  `agent_activity.jsonl`, `agent_enforcement.log`, the versioned `koi_agent_enforcement` symlink.
  `agent_policies.json` carries the `cid` and `deviceId`.
- **Freshness proof:** only a new mtime on `settings.json` / `agent_policies.json` proves the
  authenticated backend round trip. Reachability alone proves nothing.
- **Extension display names** come from `_locales\<lang>\messages.json`, not `manifest.json:name`
  (which usually holds a `__MSG_*` placeholder).
- **Installed software** needs both registry hives — `…\Uninstall\*` and `WOW6432Node\…\Uninstall\*`.
- **KOI bundles its own Python**, so PyPI inventory appears on hosts where nobody installed Python.
- **Tooling traps:** `powershell -Command -` executes piped stdin line-by-line and silently breaks
  multi-line blocks (use `-EncodedCommand`); the XSIAM script channel mangles pipes and nested
  quotes.
- **Install path decides event collection.** A pack zip built for the wrong marketplace target
  carries `isfetchevents: false` and ships no rules — commands work, the dataset stays empty
  forever. Verify what is inside any prebuilt artifact before recommending it.

Full detail: `../KOI/docs/KOI_Troubleshooting_Guide_v1.0.docx`.

---

## 7. Suggested order of work

1. Stand up a tenant with **only** the Marketplace pack installed. Record `currentVersion` and the
   command count as evidence.
2. Sweep all 13 commands; capture real outputs. This is the factual base for everything else.
3. Confirm event collection end to end and settle the dataset-name question.
4. Write the **install/customer guide** first — install paths, the 13 commands, configuration
   parameters. Model the structure on `docs/build_guide.js`.
5. Write the **test guide**, dropping every test that depends on a missing command. Realistically:
   connectivity, event collection, the command surface, and the Script Runner Job. The triage,
   investigation and gated-response tests do not apply.
6. Write the **troubleshooting guide**: reuse §6 wholesale, re-derive the rest.
7. If the Script Runner playbooks are in scope, they transfer unchanged — but they are not part of
   the Marketplace pack, so state clearly that they are additional content.

---

## 8. Reference files in the **custom-pack** repo (`../KOI`)

| Path | Why you care |
|---|---|
| `../KOI/Integrations/Koi/Koi.yml` | Custom integration — the 26 commands and 226 outputs |
| `../KOI/Playbooks/*.yml` | The 10 playbooks; see §4.1 for portability |
| `../KOI/Playbooks/README.md` | Script Runner architecture and the List schema |
| `../KOI/docs/build_guide.js` | Customer-guide generator (docx) |
| `../KOI/docs/build_test_guide.js` | Test-guide generator (pptx) |
| `../KOI/docs/build_troubleshooting.js` | Troubleshooting-guide generator (docx) |
| `../KOI/docs/build_deck.js` | Overview-deck generator (pptx) |
| `../KOI/README.md` | Install paths, the fetch-events caveat, Script-Runner-only install |

**Toolchain note:** the generators need the `docx` / `pptxgenjs` npm packages via `NODE_PATH`, and
LibreOffice for PDF conversion (`soffice --headless --convert-to pdf`). `soffice` is not on `PATH`
by default on macOS — see the project memory note on the Office render toolchain.

---

## 9. Ground rules

- **Do not** edit the custom pack in this repo from that session. It is reference only.
- **Do not** copy command lists, field paths or test steps from the custom docs without checking
  them against the Marketplace pack. Most will be wrong.
- **Do** state plainly, in every document you produce, which pack it describes and its version.
  The two will be confused otherwise — they are both called KOI.
