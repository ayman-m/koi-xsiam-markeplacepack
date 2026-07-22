# XQL detection and investigation queries — KOI supply chain × Cortex XDR

**Pack under test:** the official **Marketplace KOI pack**, `demisto/content` `Packs/Koi` **v1.2.3**
(integration only, 13 commands). This is *not* the 26-command custom pack at `../KOI`. The
Marketplace pack ships **no modeling rules**, so it never declares a dataset name — `koi_koi_raw`
is the `{vendor}_{product}_raw` convention, confirmed by query against the live tenant.

**Tenant:** `api-ayman.xdr.eu.paloaltonetworks.com`
**Datasets:** `koi_koi_raw` (KOI supply-chain inventory and alerts), `xdr_data` (Cortex XDR endpoint
telemetry).

**Scope of this document:** queries only. No pack content, playbook, rule or dashboard was modified.

---

## 1. Validation status — read this before using anything here

Four agents designed these queries and each ran theirs against the live tenant. This document is the
curation pass: re-run everything, enforce the Alerts dedupe rule, merge duplicates, rank, and
parameterise.

**The re-run could not be performed.** The tenant's daily XQL Compute Unit quota was exhausted before
this pass began:

```
"err_msg": "query usage exceeded max daily quota",
"quota_info": {"used_quota": 1.0, "max_quota": 1.0, "error_type": "QUOTA_EXCEEDED",
               "message": "The daily number of remaining Compute Units (0.0) is insufficient"},
"total_daily_running_queries": 2264,
"total_daily_concurrent_rejected_queries": 47
```

2,264 queries were charged to this tenant on 2026-07-21 across four parallel agents. Reset is
00:00 UTC. **Zero queries were re-executed in this pass**, so every row count below is the
originating agent's, not mine. Each entry states its provenance explicitly.

What *was* done instead is a static audit against the syntax facts the four agents verified
independently, which found two queries that reference joined columns in a form another agent proved
fails. Those are corrected here and moved to the pending appendix.

### How to re-validate — one command, after 00:00 UTC

```bash
cd /Users/aymanmahmoud/Documents/Coding/KOI-MP/docs/xql
python3 validate.py 24 A1.xql A2.xql A3.xql A4.xql A5.xql A6.xql A7.xql A8.xql \
                       B1.xql B3.xql B5.xql B6.xql B10.xql B11.xql \
                       C2.xql C3.xql C5.xql C6.xql D1.xql D1b.xql D2.xql D3.xql D3b.xql
# MCP queries are bursty on this tenant - run these over 7d, not 24h:
python3 validate.py 168 B0.xql B2.xql B7.xql B8.xql B9.xql
```

`validate.py` distinguishes a parse failure, an asynchronous run failure, a concurrency rejection
and a quota rejection. The naive poller in `scripts/koi_tenant.py` waits only for `SUCCESS` and
therefore **hangs forever on a failing query instead of reporting the error** — do not use it to
validate.

### Provenance labels used below

| Label | Meaning |
|---|---|
| `VALIDATED (agent), N rows` | Executed on this tenant by the originating agent, row count recorded. Not re-run in this pass. |
| `VALIDATED (agent), row count lost` | The agent states it ran and parsed; the count did not survive into the curation brief. |
| `CORRECTED — needs re-run` | A defect was found by static audit and fixed here. The fixed text has never been executed. |
| `RECONSTRUCTED — needs re-run` | The originating agent's exact text was not persisted; rebuilt from its description. Never executed in this form. |

---

## 2. What this pass changed

**Dropped (3), all as duplicates:**

| Dropped | Superseded by | Why |
|---|---|---|
| `B12` KOI-side agentic inventory | `B11` | Same dataset, same filter intent. B11 has a classifier and per-item aggregation; B12 is a bare `comp count() by marketplace, object_name, action`. |
| `C1` broad `contains "Koi"` hunt | `C2` | C1 returns 15 ungrouped rows of the same thing C2 groups and counts. The originating agent labelled C1 orientation-only itself. |
| `C4` KOI scan cadence | `C3` + `A7` | C4 differs from C3 only in grouping. Its `koi_launch_kind` classifier — the genuinely useful part — has been folded into C3, and its cadence finding is recorded in A7's interpretation. |

**Corrected (3):**

- **B8, B9** referenced joined columns as `koi.koi_risk`, `koi.koi_audit_events` etc. in `alter` and
  `fields` clauses. Theme A verified by testing that after `| join (...) as koi`, joined columns must
  be referenced by their **bare** name; the alias-prefixed form produces `unknown field koi.<x>` and
  the query **fails asynchronously**, which is why a poller that only waits for `SUCCESS` never
  surfaces it. Both queries were shipped unvalidated by their author, so this was never caught. The
  alias prefix has been stripped from all body references (it is correct and required in the join
  *condition*, which is unchanged).
- **B7, B8** used `to_json_string(resources)` and the JSONPath form `$.0.type`. `resources` is
  already a JSON string, so the wrapper double-encodes it and every `json_extract_scalar` silently
  returns null. Separately, Theme D established by testing that array indexing must be written
  `$[0].data.hostname`. Both normalised. This contradicts Theme B's claim that B7 validated —
  resolve it by running B7 both ways after quota reset.
- **A7** filtered on `action_process_image_path ~= "(?i)\\AppData\\Local\\Koi\\Python\\"`. Theme A's
  own finding #1 is that `\\` in an XQL string literal reaches the regex engine as **one** literal
  backslash — which makes this `\A` (start-of-text anchor), `\L`, `\K`, `\P`. Theme C independently
  proved the working form is `"(?i)AppData.Local.Koi.Python"`, using `.` as a wildcard for the
  separator, and got rows from it. A7 now uses the proven form.

**Not recoverable (14):** Theme C queries C7–C13 and Theme D queries D4–D12 were described in the
curation brief but their exact XQL was neither persisted to disk nor recoverable from the session
transcript. Only truncated prose survives. They are **not included** — publishing query text I do not
have would violate the rule that nothing ships unvalidated. Notably this loses **D7**, the worked
Alerts-dedupe query that turns 734 raw rows into 3 real alerts; a reconstruction is offered in the
appendix but is unvalidated.

---

## 3. The Alerts duplication rule — audit result

> The integration re-sends every still-open alert on every 1-minute fetch cycle. Over 24 hours,
> 734 rows = **3 real alerts** (~245×). Every query touching `source_log_type = "Alerts"` must dedupe
> on `json_extract_scalar(metadata, "$.notification_event_id")`. Never `count()` rows. Never `_id`.
> `finding_info.uid` is the **policy** id (3 distinct across 1048 alerts), not an alert id.
> `source_log_type = "Audit"` is **not** duplicated (1.0 ratio) and needs no dedupe.

Every query whose text survives was checked. **Two touch Alerts — B7 and B8 — and both dedupe
correctly** on `metadata.notification_event_id` before any aggregation. No violation found.

That is a narrow result, not a clean bill of health: **9 of the surviving 29 queries could not be
checked at all**, because Theme C's C7–C13 and Theme D's D4–D12 text is gone. Theme D's own brief
says D7 does the dedupe correctly; Theme C's says none of its queries count Alerts rows. Both claims
are unverifiable here. **Anyone recovering those queries must re-audit them against this rule before
use.**

Every other query in this library reads `source_log_type = "Audit"` only, or reads `xdr_data` only.

---

## 4. Ranking principle

The queries worth having are the ones **neither dataset can answer alone**. Ranked in tiers:

1. **Cross-dataset.** `koi_koi_raw` joined or unioned with `xdr_data`. KOI knows *what you own and
   what it scores as risky*; XDR knows *what actually ran, who ran it and what it talked to*. Only
   the intersection tells you a risky thing is live.
2. **XDR-only, answering a KOI question.** A7 measures KOI scan freshness purely from `xdr_data`,
   because KOI on Windows is run-on-demand and *absence of KOI events is indistinguishable from "no
   scan ran"* inside `koi_koi_raw`. That is a cross-product answer from one dataset.
3. **XDR-only supply-chain / agentic telemetry.** Real detections, but they do not use the KOI pack.
4. **KOI-only.** Genuinely useful — the Marketplace pack has no history command, no
   `koi-devices-list` and no `Koi.Device.*` context, so these recover capability the API does not
   expose. But they are not the point of this exercise and are ranked last deliberately.

---

## 5. Tenant facts every query below depends on

Stated once so the interpretations do not repeat them.

- **Dual-covered hosts = exactly one: `win-workstation`.** `koi_koi_raw` Audit carries 35 distinct
  hostnames over 7d; `xdr_data` carries 4 (`win-workstation`, `thor`, `OfficeiMac`,
  `Abdelrahman's MacBook Air`). Everything else in `koi_koi_raw` (`sj-ad-2022`, `jumpbox`, `winkoi`,
  `Greg's Mac mini`, `Kim的MacBook Air`, …) belongs to other orgs on the shared Koi SaaS tenant and
  has no Cortex agent. **Every coverage-gap count from these queries is dominated by tenant-sharing,
  not by real coverage failure. Say so in any report.**
- **Hostname form is compatible.** Both datasets use bare hostnames (not FQDN), preserve case, and
  both use the Unicode curly apostrophe U+2019 in Mac names. A plain equality join is correct.
- **KOI Alerts cannot be attributed to a host via `hostname`** — it is NULL on every Alerts row
  (797/7d). The host lives in `resources[type=device].data.hostname`. Only Audit rows are
  host-attributable.
- **The KOI agent is visible in XDR.** It bundles its own WinPython and runs as
  `C:\Users\Default\AppData\Local\Koi\Python\WPy64-31290\python\python.exe -I C:\Windows\SystemTemp\tmpXXXX.tmp.pyz`,
  spawned by `powershell.exe`. Each scan is a **pair**: a `.py` launcher, then ~90 ms later the
  `.pyz` zipapp. On `win-workstation`, 49 launcher + 49 zipapp executions in 24h — a mean cadence of
  ~29 minutes. This contradicts, or at least qualifies, "KOI is run-on-demand with no resident
  agent": there is a real expected cadence to test absence against.
- **`C:\ProgramData\Koi\` is not in XDR FILE telemetry.** Writes under `AppData\Local\Koi` are a
  one-time 22-second WinPython unpack burst, not a per-scan artifact. **Process execution is the only
  reliable KOI-freshness signal in XDR.** Do not build a freshness detection on file writes.
- **KOI detection latency, measured:** pip installs on `win-workstation` were inventoried 4–135
  minutes after the process ran; a `git clone` was inventoried 3 minutes after. This is what justifies
  A5's 180-minute and A6's 240-minute windows.
- **Marketplace vocabulary differs between events and the API.** Events emit short forms
  (`software_windows`, `chrome`, `vsc`, `jet`, `npp`, `openvsx`, `software_mac`, `github`); the API
  and UI use long forms (`windows`, `chrome_web_store`, `vscode`, `jetbrains`, `notepad++`,
  `open_vsx_registry`, `mac`, `github_mcp_registry`). `npm` and `pypi` are the same in both.
  `built_in` and `side_loaded` are **installation methods** leaking into the marketplace field, not
  marketplaces. Never feed an event-side marketplace value into a `koi-*` command argument.
- **`platform` is the better agentic pivot than `marketplace`.** It carries `claude_code`, `cur`
  (Cursor), `openclaw`, `talon`, `git`, `homebrew`, `vsc`, `edge`, `chrome` — values `marketplace`
  reports as null or as `built_in`.
- **Lifecycle:** install and uninstall produce events with the *same* `(object_name, item_version)`.
  Git repos use the remote as `object_name` and the **commit SHA** as `item_version`.

### XQL syntax facts, established by testing

Reuse these; they cost real debugging time.

1. A backslash in an XQL string literal is written `\\` and reaches the regex engine as **one**
   literal backslash. `\\\\` gives two and silently matches nothing. In several places the safest
   form is `.` as a wildcard for the separator.
2. `"NT AUTHORITY\\SYSTEM"` inside an `in (...)` list does **not** match — the literal is not
   unescaped for equality. Use an anchored regex `~= "(?i)SYSTEM$"`.
3. After `| join (...) as koi`, joined columns are referenced by their **bare** name (`koi_time`), not
   `koi.koi_time`. The alias prefix is required in the join *condition* and forbidden everywhere
   else. Getting it wrong fails the query **asynchronously**.
4. `| fields alias = field` is a parse error. Alias in `alter`, then list in `fields`.
5. Joined timestamps are of type `date`, so `subtract()` rejects them — use
   `timestamp_diff(t1, t2, "MINUTE")`. `to_epoch(_time, "MINUTES")` is rejected; only `MILLIS` and
   `SECONDS` are supported. Arithmetic inside `to_timestamp()` is a parse error.
6. `event_sub_type` cannot be selected unless `event_type` is also in the projection.
   `ENUM.FILE_WRITE / FILE_CREATE_NEW / FILE_RENAME` work.
7. `action_country` is an **ENUM**. `to_string()` yields the ISO alpha-2 **code** (`"US"`, `"AE"`,
   `"-"`), while `comp ... by action_country` **prints the label** (`"UNITED_STATES"`). Comparing
   against the label silently matches nothing — this was a real bug caught mid-validation (79 rows →
   12 after the fix).
8. On **NETWORK** events `action_process_image_name` is always NULL. Process identity is
   `actor_process_image_name`; the owning application is `causality_actor_process_image_name`.
   `dns_query_name` is not populated (0 of 15,616 agent-owned NETWORK rows) — use
   `action_external_hostname` (~56% populated).
9. JSONPath array indexing is `$[0].data.hostname`. `$.[0]...` is rejected.
   `json_extract_array(x, "$")` works; `json_extract_array(x, "$.[*]")` does not. Filter expressions
   `$.[?(@.type=='device')]` are unsupported — use
   `arrayfilter(arr, json_extract_scalar("@element","$.type") = "device")`.
10. `dedup <keys> by desc _time` is the latest-row-per-key idiom, and is what makes both the Alerts
    dedupe and the "current state" queries possible.
11. Filter **order** matters on FILE: a broad `not(... contains ...)` exclusion placed *before* the
    classifier makes the query time out. Put it after `filter secret_class != null`.
12. The tenant enforces both a parallel-query cap and a daily Compute Unit quota. Both surface as
    HTTP 500 with distinct `err_msg`.

### A false-positive class worth naming once

The analyst's own session is telemetry. This project's shell command lines — which contained the
strings `github.com/octocat/Hello-World.git`, `pip install`, and the directory name `KOI-MP` — were
themselves recorded as PROCESS events on `OfficeiMac` and matched A1, A3, C1 and C2. **Any
command-line-substring detection will catch analysts and automation discussing the indicator.**
Exclude your SOAR and automation hosts, or require the process image to be the actual tool.

---

# Group 1 — Cross-dataset (`koi_koi_raw` × `xdr_data`)

These are the queries that justify the exercise.

---

## A3 — `git clone` in XDR joined to KOI's GitHub inventory event

**Purpose:** investigation (becomes a coverage detection with one added filter)
**Datasets:** `xdr_data` (PROCESS) + `koi_koi_raw` (Audit, `type=extensions`, `marketplace=github`)
**Question:** For every `git clone` on the estate — did KOI inventory the repo, what commit SHA did
it record, how long did KOI take to see it, who ran the clone, and where did it land?
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** none. Add `| filter koi_saw_it = "NO - not in KOI inventory"` to convert it into a
coverage detection.

```
/* THEME A - Q3 : `git clone` in XDR joined to KOI's GitHub inventory event.
   Purpose : investigation
   Datasets: xdr_data (PROCESS) + koi_koi_raw (Audit)
   Why     : KOI records a git item as owner/repo with the COMMIT SHA in item_version, but has
             no idea who ran the clone or where it landed. XDR has the command line, the user,
             the causality parent and the destination path, but never resolves the SHA.
             Joined on the repo slug + host you get the whole acquisition in one row.
   Pack    : Marketplace KOI pack (demisto/content Packs/Koi) v1.2.3 -> dataset koi_koi_raw.
   Vocab   : the EVENT field marketplace = "github" / platform = "git". The KOI API and UI call
             the same thing "github_mcp_registry" - do not filter on the API spelling here.
   Syntax  : after `join ... as koi`, joined columns are referenced by their BARE name, not
             `koi.name`, and the joined side's _time overwrites the left _time - hence the
             explicit clone_time alias below. */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)git(\.exe)?[\s\"]+clone"
// owner/repo, lower-cased so it lines up with KOI's object_name
| alter repo_slug = lowercase(arrayindex(regextract(action_process_image_command_line, "(?i)github\.com[:/]([A-Za-z0-9._-]+/[A-Za-z0-9._-]+?)(?:\.git|[\s\"]|$)"), 0))
| filter repo_slug != null
// whatever token follows the remote URL is the clone destination, when one was supplied
| alter clone_dest  = arrayindex(regextract(action_process_image_command_line, "(?i)github\.com\S+\s+(\S+)"), 0)
| alter clone_time  = _time,
        clone_host  = lowercase(agent_hostname),
        clone_user  = action_process_username,
        clone_cmd   = action_process_image_command_line,
        clone_parent = coalesce(causality_actor_process_image_name, actor_process_image_name)
// one row per (host, repo, command) - git clone spawns remote-https / index-pack children
// that all carry the parent's command line
| dedup clone_host, repo_slug, clone_cmd by asc clone_time
| fields clone_time, clone_host, agent_hostname, agent_id, repo_slug, clone_dest,
         clone_user, clone_parent, clone_cmd, action_process_cwd
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "extensions" and marketplace = "github"
    | alter koi_repo = lowercase(object_name),
            koi_host = lowercase(hostname),
            koi_time = _time,
            koi_action = action,
            commit_sha = item_version,
            koi_message = message
    | fields koi_repo, koi_host, koi_time, koi_action, commit_sha, koi_message
  ) as koi koi.koi_repo = repo_slug and koi.koi_host = clone_host
| alter koi_lag_minutes = timestamp_diff(koi_time, clone_time, "MINUTE")
| alter koi_saw_it = if(koi_time = null, "NO - not in KOI inventory", "yes")
| fields clone_time, agent_hostname, repo_slug, clone_dest, clone_user, clone_parent,
         clone_cmd, action_process_cwd, koi_saw_it, koi_action, commit_sha,
         koi_time, koi_lag_minutes, koi_message
| sort desc clone_time
| limit 200
```

**Interpretation.** This is the cleanest demonstration in the library of what the join buys you.
KOI records `octocat/Hello-World` with `item_version = 7fd1a60b01f91b314f59955a4e4d4e80d8edf11d` —
the commit SHA — and nothing else. XDR records
`"C:\Program Files\Git\cmd\git.exe" clone --depth 1 https://github.com/octocat/Hello-World.git C:\Users\amahmoud\Documents\koi-test-repo`
running as `NT AUTHORITY\SYSTEM` under `cortex-xdr-payload.exe`, and never resolves a SHA. One row
gives you repo, SHA, user, parent process, destination path and KOI's detection lag (3 minutes on
this clone).

Zero rows means no `git clone` in the window, not a broken query.

**False positives.** The repo-slug regex matches any command line containing a GitHub URL, including
an analyst's own shell history — see the named false-positive class in §5. `koi_saw_it = "NO"` is
only meaningful on a dual-covered host; on this tenant that is `win-workstation` alone, and every
other host will read as a false gap.

---

## A6 — Package installed in XDR, never inventoried by KOI (coverage gap, XDR → KOI)

**Purpose:** detection (KOI coverage / scan-freshness / evasion hunt)
**Datasets:** `xdr_data` (PROCESS) + `koi_koi_raw` (Audit)
**Question:** A package manager ran and installed something on a dual-covered host. Did KOI ever
inventory the package?
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** `// PARAM: window_minutes` — 240, forward-looking. Derived host set: the dual-covered
population is computed by the inner join, **not hardcoded**.

```
/* THEME A - Q6 : COVERAGE GAP, direction XDR -> KOI.
   A package-manager install ran in XDR on a dual-covered host, and KOI never inventoried the
   package.
   Purpose : detection (KOI coverage / scan-freshness / evasion hunt)
   Datasets: xdr_data (PROCESS) + koi_koi_raw (Audit)

   ASSUMPTIONS:
   1. Dual-covered hosts only; the set is derived from the data, not hardcoded.
   2. KOI on Windows is run-on-demand, so the inventory event lands at the NEXT scan, not at
      install time. The window is forward-looking and generous: 240 minutes. // PARAM: window_minutes
      A hit inside a fresh window usually means "no scan has run yet" - re-run it after a scan
      before treating it as a real gap. Pair it with A7 (scan freshness) to tell the two apart.
   3. Package-name extraction is a heuristic: first non-flag, non-path token after
      install/add/i. Command lines it cannot parse yield null and are dropped, so this
      under-reports rather than over-reports.
   5. nearest_koi_lag_minutes can be NEGATIVE: it is the closest KOI sighting of the same
      package name on that host in either direction, which is useful context on a gap row.
   4. Virtualenv / --target installs into a path KOI does not scan are the expected true
      positives here, alongside anything installed into a container or WSL guest. */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)(pip3?\s+install|uv\s+pip\s+install|npm\s+(i|install|add)\s)"
| alter pkg_name = lowercase(arrayindex(regextract(action_process_image_command_line,
    "(?i)(?:pip3?|npm|uv\s+pip)\s+(?:install|add|i)\s+(?:(?:-{1,2}\S+|\S*[\\/:]\S*)\s+)*([A-Za-z@][A-Za-z0-9._@/-]{1,})"), 0))
| filter pkg_name != null
| alter ecosystem = if(action_process_image_command_line ~= "(?i)npm\s+(i|install|add)\s", "npm", "pypi")
| alter proc_host = lowercase(agent_hostname),
        install_time = _time,
        install_user = action_process_username,
        install_cmd  = action_process_image_command_line,
        install_parent = coalesce(causality_actor_process_image_name, actor_process_image_name)
| dedup proc_host, pkg_name, install_cmd by asc install_time
| fields proc_host, agent_hostname, install_time, pkg_name, ecosystem, install_user,
         install_parent, install_cmd
// dual coverage only
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter cov_host = lowercase(hostname)
    | comp count() as koi_event_count by cov_host
  ) as cov cov.cov_host = proc_host
// did KOI ever inventory that package on that host?
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "extensions"
    | filter marketplace in ("pypi", "npm")
    | alter koi_host = lowercase(hostname),
            koi_pkg  = lowercase(object_name),
            koi_time = _time,
            koi_action = action,
            koi_version = item_version,
            koi_marketplace = marketplace
    | fields koi_host, koi_pkg, koi_time, koi_action, koi_version, koi_marketplace
  ) as k k.koi_pkg = pkg_name and k.koi_host = proc_host
| alter koi_lag_minutes = timestamp_diff(koi_time, install_time, "MINUTE")
| alter koi_confirmed = if(koi_time != null and koi_lag_minutes >= 0 and koi_lag_minutes <= 240, 1, 0)
| comp max(koi_confirmed) as seen_by_koi,
       min(koi_lag_minutes) as nearest_koi_lag_minutes
    by proc_host, agent_hostname, install_time, pkg_name, ecosystem, install_user, install_parent, install_cmd
| filter seen_by_koi = 0
| fields install_time, agent_hostname, pkg_name, ecosystem, install_user, install_parent,
         install_cmd, nearest_koi_lag_minutes
| sort desc install_time
| limit 200
```

**Interpretation.** The expected true positives are installs into a path KOI does not scan —
`--target`, a virtualenv, a container, a WSL guest. Those are exactly the shape of a deliberate
evasion and exactly the shape of a routine developer workflow, so this needs pairing with A7 before
anything fires: a hit inside a fresh window usually means "no scan has run yet", not "KOI missed it".
`nearest_koi_lag_minutes` can be **negative** — it is the closest KOI sighting of the same package
name on that host in *either* direction, which is context on a gap row rather than an error.

**False positives.** The package-name extraction is a heuristic (first non-flag, non-path token) and
drops command lines it cannot parse, so the query **under-reports**. On a tenant where only one host
is dual-covered, the inner join reduces the population to almost nothing — that is correct behaviour,
not a bug, and it is why the dual-covered set is derived rather than hardcoded.

---

## A5 — KOI reported an install, XDR saw no acquisition process (coverage gap, KOI → XDR)

**Purpose:** detection (coverage / evasion hunt)
**Datasets:** `koi_koi_raw` (Audit) + `xdr_data` (PROCESS)
**Question:** KOI inventoried something new on a dual-covered host. Did *any* package manager or
downloader run near that time that names it?
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** `// PARAM: window_minutes` — 180, backward-looking.

```
/* THEME A - Q5 : COVERAGE GAP, direction KOI -> XDR.
   A KOI "installed"/"updated" inventory event on a dual-covered host with NO package-manager
   or download process in XDR anywhere near it.
   Purpose : detection (coverage / evasion hunt)
   Datasets: koi_koi_raw (Audit) + xdr_data (PROCESS)

   ASSUMPTIONS - state these when you use it:
   1. Only hosts covered by BOTH products can be judged. The join below derives that set from
      the data (on this tenant it is exactly one host, win-workstation) - do not hardcode it.
   2. KOI on Windows is run-on-demand: it batch-reports at scan time, so the KOI timestamp is
      the SCAN time, not the install time. The window therefore has to be generous and
      one-sided-backwards. 180 minutes is used here. // PARAM: window_minutes
   3. KOI's FIRST scan of a host reports every pre-existing item as "installed". Those
      legitimately have no XDR process. Exclude the first scan per host, or run this over a
      window that starts after onboarding.
   A hit means: something arrived on disk without a package manager running - a file copy, an
   archive unpack, a sync client, an MSI, or an agent that XDR did not see spawn a process. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter action in ("installed", "updated")
| alter koi_host = lowercase(hostname),
        koi_time = _time,
        item     = object_name,
        item_key = lowercase(object_name),
        // "Antigravity 2.3.1" -> "antigravity", "Python 3.14.6" -> "python",
        // "ms-toolsai.jupyter" -> itself. KOI names Windows software NAME + VERSION, which
        // never appears verbatim in a command line, so match on the leading token instead.
        item_root = lowercase(arrayindex(regextract(object_name, "^([A-Za-z0-9][A-Za-z0-9._+-]{3,})"), 0))
| fields koi_host, koi_time, item, item_key, item_root, item_version, marketplace, platform, action, message
// keep only hosts that also report into xdr_data - anywhere else the "gap" is meaningless
| join type = inner (
    dataset = xdr_data
    | alter cov_host = lowercase(agent_hostname)
    | comp count() as xdr_event_count by cov_host
  ) as cov cov.cov_host = koi_host
// now look for ANY acquisition process on that host that names the item
| join type = left (
    dataset = xdr_data
    | filter event_type = ENUM.PROCESS
    | filter action_process_image_command_line ~= "(?i)(pip3?\s+install|uv\s+(pip|add|tool)\s|npm\s+(i|install|add|ci)\s|yarn\s+add|pnpm\s+add|git\s+clone|choco\s+install|winget\s+install|brew\s+install|Install-Module|msiexec|setup\.exe|\.msi)"
    | alter proc_host = lowercase(agent_hostname),
            proc_time = _time,
            proc_cmd  = action_process_image_command_line,
            proc_user = action_process_username
    | fields proc_host, proc_time, proc_cmd, proc_user
  ) as p p.proc_host = koi_host
| alter lag_minutes = timestamp_diff(koi_time, proc_time, "MINUTE")
// the process must have run BEFORE the KOI scan and within the window, and must name the item
| alter corroborated = if(
    proc_time != null
      and lag_minutes >= 0 and lag_minutes <= 180
      and item_root != null
      and lowercase(proc_cmd) contains item_root,
    1, 0)
| comp max(corroborated) as corroborated_by_xdr,
       count() as candidate_processes
    by koi_host, koi_time, item, item_version, marketplace, platform, action, message
| filter corroborated_by_xdr = 0
| fields koi_time, koi_host, item, item_version, marketplace, platform, action, message
| sort desc koi_time
| limit 200
```

**Interpretation.** A hit means something arrived on disk without a package manager running — a file
copy, an archive unpack, a sync client, a hand-dropped MSI, or an installer XDR did not see spawn a
process. That is the interesting half of the coverage question and it is unanswerable from either
dataset alone.

**False positives.** Two structural ones, both stated in the query header. (1) **KOI's first scan of a
host reports every pre-existing item as `installed`.** Those legitimately have no XDR process and will
flood this query — exclude the first scan per host, or run over a window starting after onboarding.
(2) The `item_root` heuristic reduces `"Antigravity 2.3.1"` to `antigravity` because KOI names Windows
software `NAME + VERSION`, which never appears verbatim in a command line; short or generic roots will
match unrelated command lines and *suppress* real gaps.

---

## A8 — One-item acquisition timeline (the playbook query)

**Purpose:** investigation
**Datasets:** `koi_koi_raw` (Audit) + `xdr_data` (PROCESS, FILE), unioned into a common shape
**Question:** Given one item and one host, put every KOI lifecycle event and every XDR process and
file event that names it on a single timeline.
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** `// PARAM: item_token`, `// PARAM: hostname` — both appear three times each (once per
union branch). The worked values `"win-workstation"` / `"tabulate"` are placeholders.

```
/* THEME A - Q8 : ONE-ITEM ACQUISITION TIMELINE - the playbook query.
   Purpose : investigation. Parameterise on an item and a host and get every KOI lifecycle
             event and every XDR process/file event that names it, on one timeline.
   Datasets: koi_koi_raw (Audit) + xdr_data (PROCESS, FILE), unioned into a common shape.
   Inputs  : // PARAM: item_token  - lower-case substring of the KOI object_name, e.g. "tabulate",
             //                      "octocat/hello-world", "antigravity", "vscodeusersetup"
             // PARAM: hostname    - as KOI reports it AND as XDR reports it; they agree on this
             //                      tenant, but normalise if your estate differs.
   Pack    : Marketplace KOI pack (demisto/content Packs/Koi) v1.2.3 -> dataset koi_koi_raw.
             There is no Koi.Device.* context in this pack; endpoints hang off an item, so the
             item is the correct pivot. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter lowercase(hostname) = "win-workstation"                 // PARAM: hostname
| filter lowercase(object_name) contains "tabulate"              // PARAM: item_token
| alter evt_time = _time,
        source   = "KOI inventory",
        actor    = triggered_by,
        detail   = message,
        extra    = concat(marketplace, " / ", platform, " / v", item_version)
| fields evt_time, source, actor, detail, extra
| union (
    dataset = xdr_data
    | filter event_type = ENUM.PROCESS
    | filter lowercase(agent_hostname) = "win-workstation"        // PARAM: hostname
    | filter lowercase(action_process_image_command_line) contains "tabulate"   // PARAM: item_token
    | alter evt_time = _time,
            source   = "XDR process",
            actor    = action_process_username,
            detail   = action_process_image_command_line,
            extra    = concat("parent=", coalesce(causality_actor_process_image_name, "?"),
                              " cwd=", coalesce(action_process_cwd, "?"))
    | fields evt_time, source, actor, detail, extra
  )
| union (
    dataset = xdr_data
    | filter event_type = ENUM.FILE
    | filter lowercase(agent_hostname) = "win-workstation"        // PARAM: hostname
    | filter lowercase(action_file_path) contains "tabulate"      // PARAM: item_token
    | alter evt_time = _time,
            source   = "XDR file",
            actor    = actor_effective_username,
            detail   = action_file_path,
            extra    = concat("written by ", coalesce(actor_process_image_name, "?"))
    | fields evt_time, source, actor, detail, extra
  )
| dedup evt_time, source, detail by asc evt_time
| sort asc evt_time
| limit 300
```

**Interpretation.** This is the one to wire into a playbook. The union avoids the join entirely, which
sidesteps the bare-name/alias-prefix trap and the `date`-typed-timestamp arithmetic trap in one move.
`source` tells the analyst which product saw each line, so KOI's scan latency shows up as a visible
gap in the timeline rather than having to be computed.

**False positives.** Substring matching on `item_token`. Short or generic tokens (`pip`, `build`,
`access`, `npm`) will match unrelated paths and command lines; use the longest distinctive fragment
available. Compare with **D2**, which does the XDR half only but adds LOAD_IMAGE.

---

## A7 — KOI scan freshness, measured from XDR rather than from KOI

**Purpose:** detection (coverage assurance) + investigation (is this host's inventory stale?)
**Datasets:** `xdr_data` (PROCESS) only — **and that is the point**
**Question:** When was each host last scanned by KOI, and therefore how much should its KOI inventory
be trusted?
**Provenance:** `CORRECTED — needs re-run`. Validated by Theme A in its original form; the path regex
has been replaced with the form Theme C independently proved returns rows (see §2).
**Parameters:** `// PARAM: staleness thresholds` (60 / 1440 minutes).

```
/* THEME A - Q7 : KOI SCAN FRESHNESS measured from XDR, not from KOI.
   Purpose : detection (coverage assurance) + investigation (is this host's inventory stale?)
   Dataset : xdr_data (PROCESS) only - no KOI data needed, which is the point.
   Why     : KOI on Windows is run-on-demand; there is no resident agent, so ABSENCE of KOI
             events means "no scan ran", not "nothing happened". You cannot tell those apart
             from koi_koi_raw. But the KOI agent bundles its own Python and executes as
             C:\Users\Default\AppData\Local\Koi\Python\WPy64-*\python\python.exe -I <tmp>.pyz
             spawned by powershell.exe - which XDR records. So XDR can tell you WHEN a host was
             last scanned, and therefore how much to trust its KOI inventory.
   Verified on this tenant: win-workstation, scans at 09:45:22, 09:51:15 and 10:00:10 line up
   exactly with the manually triggered scans.
   Use as a detection by filtering minutes_since_last_scan above your tolerance. */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
// The KOI-bundled interpreter. Anchored on the vendor's own install path so it cannot be
// confused with any other Python on the box. The `.` are wildcards standing in for the
// path separator - see the string-literal backslash caveat in the syntax notes.
| filter action_process_image_path ~= "(?i)AppData.Local.Koi.Python"
| alter scan_host   = lowercase(agent_hostname),
        scan_time   = _time,
        koi_payload = arrayindex(regextract(action_process_image_command_line, "(?i)(tmp[0-9A-Fa-f]+\.tmp\.pyz?)"), 0),
        launched_by = actor_process_image_name,
        scan_user   = action_process_username
// one row per scan invocation - each scan spawns a .py bootstrap and a .pyz payload
| comp count() as koi_processes,
       max(scan_time) as last_scan,
       min(scan_time) as first_scan
    by scan_host, agent_hostname, launched_by, scan_user
| alter minutes_since_last_scan = timestamp_diff(current_time(), last_scan, "MINUTE")
| alter inventory_confidence = if(
    // PARAM: staleness thresholds, in minutes. 60/1440 suits a ~29-minute scan cadence.
    minutes_since_last_scan <= 60,   "fresh - inventory reflects the last hour",
    minutes_since_last_scan <= 1440, "aging - up to a day of drift",
    "STALE - KOI inventory for this host may be days out of date")
| fields agent_hostname, launched_by, scan_user, koi_processes, first_scan, last_scan,
         minutes_since_last_scan, inventory_confidence
| sort asc minutes_since_last_scan
| limit 100
```

**Interpretation.** This is the query that makes A5 and A6 usable. Without it, "KOI has no record of
this package" is ambiguous between *KOI missed it* and *KOI has not looked yet*, and there is nothing
in `koi_koi_raw` that can tell you which. Because the KOI agent bundles its own Python and executes
under a vendor-specific path, XDR can date the last scan of every dual-covered host.

Measured cadence on `win-workstation`: 49 launcher + 49 zipapp executions in 24h, spanning
2026-07-20 10:41:34Z → 2026-07-21 10:00:10Z — a mean gap of ~29 minutes and a perfect 49/49 pairing.
So absence can be tested against a real expected cadence, not just against manual triggers.

**A host absent from this result set has never run a KOI scan in the window.** That is the coverage
blind spot, and on this tenant it is 3 of the 4 XDR-covered hosts — but see §5: that number is
dominated by the fact that the other KOI hosts belong to different orgs on a shared SaaS tenant.

**False positives.** Essentially none — the `AppData\Local\Koi\Python\WPy64-*\python\python.exe` path
anchor is KOI's own bundled WinPython and matched nothing else on the tenant. `current_time()` is used
here; Theme C could not validate it before quota exhaustion, so re-confirm it on the re-run.

---

## D2 — XDR runtime evidence for a KOI item

**Purpose:** investigation
**Datasets:** `xdr_data` (PROCESS, FILE, LOAD_IMAGE)
**Question:** KOI says this item is installed — did anything from it actually execute, get loaded as a
module, or get written to disk, and what brought it here?
**Provenance:** `VALIDATED (agent), 8 rows` (24h)
**Parameters:** `// PARAM: item_token` (lowercase), `// PARAM: koi_host` (delete the line to search
fleet-wide).

```
// Theme D / D2 - XDR runtime evidence for a KOI item.
// Bridges "KOI says it is installed" to "it actually ran / loaded / was written to disk".
// action_module_path is confirmed present on LOAD_IMAGE (action_module_file_name is NOT);
// coalescing the three path fields into one artifact_path lets a single filter cover
// execution, module load and file write.
// PARAM: item_token = a distinctive LOWERCASE substring of the item - package name,
//                     extension id, repo name. From KoiContext.package_name / item_id.
// PARAM: koi_host   = KoiContext.alert_hostname / Koi.Inventory.Endpoint.hostname.
//                     Delete that filter line to search fleet-wide.
// Investigation.
dataset = xdr_data
| filter event_type in (ENUM.PROCESS, ENUM.FILE, ENUM.LOAD_IMAGE)
| filter agent_hostname = "win-workstation"                          // PARAM: koi_host
| alter artifact_path = coalesce(action_process_image_path, action_file_path, action_module_path)
| alter cmdline       = action_process_image_command_line
| filter lowercase(coalesce(artifact_path, "")) contains "hello-world"
      or lowercase(coalesce(cmdline, ""))       contains "hello-world"     // PARAM: item_token
| alter evidence_kind = if(event_type = ENUM.PROCESS, "executed",
                        if(event_type = ENUM.LOAD_IMAGE, "loaded_as_module", "written_to_disk"))
| fields _time, agent_hostname, evidence_kind, event_type, artifact_path, cmdline,
         action_process_image_name, action_process_username, action_process_signature_status,
         actor_process_image_name, actor_process_command_line
| sort asc _time
| limit 200
```

**Interpretation.** The lighter, playbook-shaped counterpart to A8: it drops the KOI half but adds
LOAD_IMAGE, so it catches an item that is loaded as a DLL or interpreter module without ever being a
process of its own. On the worked example it recovered the full causality chain for
`octocat/Hello-World` — `cortex-xdr-payload.exe` → `git.exe clone` → `git remote-https` →
`git-remote-https.exe` — four minutes before KOI reported the install. **That four-minute gap is the
KOI scan latency made visible.**

**False positives.** Substring matching, same caveat as A8. A hit in `cmdline` only, with no matching
`artifact_path`, means something *mentioned* the item rather than ran it — the `git clone` rows are
exactly that shape and are still the answer you want, so read `evidence_kind` together with who the
actor was.

---

# Group 2 — XDR-only: supply-chain acquisition

Real detections, but they do not touch the KOI pack.

---

## A1 — Package-manager and downloader execution with full acquisition provenance

**Purpose:** investigation (detection when scoped by tool or `run_context`)
**Datasets:** `xdr_data` (PROCESS)
**Question:** For every supply-chain acquisition command on the estate — which tool, which user, which
parent, which working directory, and the full command line?
**Provenance:** `VALIDATED (agent), 46 rows` (24h; fluctuates 34–68 as activity continues)
**Parameters:** none. Scope with `| filter agent_hostname = "..."` or
`| filter acquisition_tool = "pip"` to turn it into a detection.

```
/* THEME A - Q1 : Package-manager / downloader execution with full acquisition provenance.
   Purpose        : investigation (and detection when scoped by tool or run_context)
   Datasets       : xdr_data (PROCESS)
   What it answers: for every supply-chain acquisition command on the estate - which tool,
                    which user, which parent process, which working directory, full command line.
   Tools matched were confirmed present on this tenant: pip, uv, npm/npx, git, curl,
   Invoke-WebRequest. yarn/pnpm/choco/winget/brew/go/cargo/gem are included so the query
   travels to estates that have them; they are simply quiet here. */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
// Match on the command line, not the image name: pip and npm are usually reached through
// python.exe -m pip, cmd /c, wsl.exe or a shell, so image-name matching misses most of them.
| filter action_process_image_command_line ~= "(?i)(pip3?\s+(install|download)|uv\s+(pip|add|tool)\s|npm\s+(i|install|add|ci)\s|npx\s|yarn\s+(add|install)|pnpm\s+(add|install|i)\s|git\s+clone|curl\s+[^|]*http|wget\s+http|choco\s+install|winget\s+install|brew\s+install|Invoke-WebRequest|Install-Module|Install-Package|go\s+install|cargo\s+install|gem\s+install)"
| alter acquisition_tool = if(
    action_process_image_command_line ~= "(?i)uv\s+(pip|add|tool)\s", "uv",
    action_process_image_command_line ~= "(?i)pip3?\s+(install|download)", "pip",
    action_process_image_command_line ~= "(?i)(npm\s+(i|install|add|ci)\s|npx\s)", "npm",
    action_process_image_command_line ~= "(?i)yarn\s+(add|install)", "yarn",
    action_process_image_command_line ~= "(?i)pnpm\s+(add|install|i)\s", "pnpm",
    action_process_image_command_line ~= "(?i)git\s+clone", "git",
    action_process_image_command_line ~= "(?i)brew\s+install", "brew",
    action_process_image_command_line ~= "(?i)choco\s+install", "choco",
    action_process_image_command_line ~= "(?i)winget\s+install", "winget",
    action_process_image_command_line ~= "(?i)(Install-Module|Install-Package)", "psgallery",
    action_process_image_command_line ~= "(?i)go\s+install", "go",
    action_process_image_command_line ~= "(?i)cargo\s+install", "cargo",
    action_process_image_command_line ~= "(?i)gem\s+install", "gem",
    "http-download")
// Who really ran it. Anchored suffix match - "NT AUTHORITY\SYSTEM" cannot be matched with
// an `in` list because XQL does not unescape the backslash inside a string literal.
| alter run_context = if(
    action_process_username ~= "(?i)(SYSTEM|LOCAL SERVICE|NETWORK SERVICE)$" or action_process_username = "root",
    "non-interactive / service context", "interactive user")
| alter installed_for_user = arrayindex(regextract(action_process_image_command_line, "(?i)[Cc]:\\Users\\([A-Za-z0-9._-]+)"), 0)
| fields _time, agent_hostname, agent_id, acquisition_tool, run_context,
         action_process_username, installed_for_user,
         action_process_image_name, action_process_cwd,
         action_process_image_command_line,
         actor_process_image_name, actor_process_command_line,
         causality_actor_process_image_name,
         action_process_image_sha256, action_process_causality_id
| sort desc _time
| limit 500
```

**Interpretation.** `installed_for_user` recovers the target account from `--target C:\Users\<name>\...`
even when the process ran as SYSTEM — that is how you attribute a SYSTEM-context install to the human
it was done for. Package managers actually present on this tenant: **pip, uv, npm/npx, git, curl,
Invoke-WebRequest, msiexec**. Not present anywhere in 7d: yarn, pnpm, choco, winget, brew, go, cargo,
gem — they are kept in the query so it travels, and are legitimately quiet here.

**False positives.** (a) The analyst's own session — see §5. (b) `npx ` matches tool invocations that
install nothing (`npx tsc --noEmit`). (c) For package managers that re-exec themselves (PyManager
`python.exe` → pythoncore `python.exe`) the parent chain shows the same binary twice — use
`causality_actor_process_image_name` for the true origin.

---

## A2 — Supply-chain acquisition run by a non-interactive parent

**Purpose:** detection
**Datasets:** `xdr_data` (PROCESS)
**Question:** Which package-manager installs were *not* launched by a human at a shell or IDE?
**Provenance:** `VALIDATED (agent), 24 rows` (24h)
**Parameters:** none required. The `parent_class` allow-list on the final filter is the tuning
surface — add your build agents to `"developer IDE / agent"` to suppress CI.

```
/* THEME A - Q2 : Supply-chain acquisition run by a NON-INTERACTIVE parent.
   Purpose : detection
   Dataset : xdr_data (PROCESS)
   Idea    : the same `pip install` is benign from a developer's shell and suspicious from a
             service, a scheduled task, an SSH daemon or an EDR/automation payload. Classify
             the causality chain rather than the process itself.
   Live ground truth on this tenant: the SAME package (tabulate 0.9.0) was installed twice -
   once by WIN-WORKSTATION\amahmoud under powershell.exe, once by NT AUTHORITY\SYSTEM under
   cortex-xdr-payload.exe -> cyserver.exe. This query separates them. */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)(pip3?\s+(install|download)|uv\s+(pip|add|tool)\s|npm\s+(i|install|add|ci)\s|npx\s|yarn\s+(add|install)|pnpm\s+(add|install)\s|git\s+clone|choco\s+install|winget\s+install|brew\s+install|Install-Module|Install-Package|go\s+install|cargo\s+install|gem\s+install)"
// Build the full launcher chain: immediate parent + the causality (process-tree root) actor.
// Classify on the causality (process-tree ROOT) actor, not the immediate parent: package
// managers re-exec themselves (PyManager python.exe -> pythoncore python.exe), so the
// immediate parent is often just the same binary again.
| alter launcher = coalesce(causality_actor_process_image_name, actor_process_image_name)
| alter parent_class = if(
    launcher ~= "(?i)^(explorer\.exe|cmd\.exe|powershell\.exe|pwsh\.exe|WindowsTerminal\.exe|conhost\.exe|zsh|bash|sh|fish|Terminal|iTerm2|login)$", "interactive shell / desktop",
    launcher ~= "(?i)^(Code\.exe|code|devenv\.exe|idea64\.exe|pycharm64\.exe|cursor|Cursor\.exe|claude|node)$", "developer IDE / agent",
    launcher ~= "(?i)^(services\.exe|svchost\.exe|taskeng\.exe|taskhostw\.exe|schtasks\.exe|wininit\.exe|launchd|systemd|cron|crond)$", "service / scheduled task",
    launcher ~= "(?i)^(sshd\.exe|sshd|winrshost\.exe|wsmprovhost\.exe|psexesvc\.exe|wsl\.exe)$", "remote session / lateral",
    launcher ~= "(?i)(payload|cyserver|cortex|rtvd|osquery|BigFix|ccmexec|ansible|puppet|chef|salt)", "management / EDR automation",
    "unclassified")
| alter run_context = if(
    action_process_username ~= "(?i)(SYSTEM|LOCAL SERVICE|NETWORK SERVICE)$" or action_process_username = "root",
    "privileged / non-interactive", "user")
// DETECTION CONDITION: keep only acquisitions that did NOT come from a human at a shell or IDE.
| filter parent_class != "interactive shell / desktop" and parent_class != "developer IDE / agent"
| fields _time, agent_hostname, agent_id, action_process_username, run_context, parent_class,
         launcher, actor_process_command_line, causality_actor_process_image_name,
         action_process_image_name, action_process_cwd, action_process_image_command_line,
         action_process_causality_id
| sort desc _time
| limit 200
```

**Interpretation.** The same command, same package, same host, different provenance, different
verdict. On this tenant the 24 rows split cleanly: `"management / EDR automation"` (the SYSTEM pip
installs and `git clone` whose causality root is `cyserver.exe` via `cortex-xdr-payload.exe`) and
`"remote session / lateral"` (installs on `thor` arriving through `sshd.exe` → `cmd.exe` → `wsl.exe`).
The interactive `pip install` by `WIN-WORKSTATION\amahmoud` under `powershell.exe` is correctly
excluded, which is the entire point. Classifying on the causality **root** rather than the immediate
parent is essential — before that change the SYSTEM install classified as `"unclassified"` because its
immediate parent was another `python.exe`.

**False positives.** On this tenant every hit is the team's own EDR-driven testing, so as written it
would be noisy in any estate that provisions software via SCCM, Intune or Ansible. Tune by
allow-listing your provisioning agent's exact image name **and its expected command-line shape**, not
just the image name — the whole value is that a compromised management agent still looks like the
management agent.

Pairs with **B10**, which is the exact complement: B10 keeps *only* what A2 excludes on the
IDE/agent side.

---

## A4 — Write then execute: installer or script dropped in a user-writable path and run from it

**Purpose:** detection
**Datasets:** `xdr_data` (FILE joined to PROCESS)
**Question:** What was written into a download/temp/desktop path and then executed from that exact
path, and how long between the two?
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** none. The `servicing_selfextract` classifier is the tuning surface.

```
/* THEME A - Q4 : Acquisition then run - installer / archive / script written to a
   user-writable path, and then EXECUTED from that same path.
   Purpose : detection
   Dataset : xdr_data (FILE joined to PROCESS)
   Idea    : KOI will eventually inventory whatever the installer leaves behind, but only at
             the next scan. The write-then-execute pair is the moment of acquisition and it is
             visible in XDR immediately.
   Live ground truth: chrome.exe wrote C:\Users\amahmoud\Downloads\Antigravity-x64.exe, which
   was then run, and KOI reported "Antigravity 2.3.1" on win-workstation afterwards.
   Join note: after `join ... as run`, joined columns are referenced by their BARE names. */
dataset = xdr_data
| filter event_type = ENUM.FILE
| filter event_sub_type in (ENUM.FILE_WRITE, ENUM.FILE_CREATE_NEW, ENUM.FILE_RENAME)
| filter action_file_extension in ("exe","msi","ps1","bat","cmd","sh","zip","7z","tar","gz","tgz","whl","vsix","crx","dmg","pkg","jar","nupkg","deb","rpm","py","js")
// user-writable landing zones - where downloads and hand-dropped payloads live
| filter action_file_path ~= "(?i)(\\Downloads\\|\\Desktop\\|\\AppData\\Local\\Temp\\|\\Windows\\Temp\\|\\Public\\|/Downloads/|/Desktop/|/tmp/|/var/tmp/)"
| alter dropped_path   = lowercase(action_file_path),
        dropped_name   = action_file_name,
        drop_time      = _time,
        drop_host      = lowercase(agent_hostname),
        dropper        = actor_process_image_name,
        dropper_cmd    = actor_process_command_line,
        dropper_user   = actor_effective_username
| alter dropper_class = if(
    dropper ~= "(?i)^(chrome\.exe|msedge\.exe|firefox\.exe|brave\.exe|opera\.exe|Safari|Google Chrome|Arc)$", "browser download",
    dropper ~= "(?i)^(curl(\.exe)?|wget|powershell\.exe|pwsh\.exe|bitsadmin\.exe|certutil\.exe|python(\.exe|3)?)$", "scripted download",
    dropper ~= "(?i)^(Outlook\.exe|Teams\.exe|Slack|WhatsApp|Discord|Signal)$", "messaging / mail",
    "other")
| dedup drop_host, dropped_path by asc drop_time
| fields drop_time, drop_host, agent_hostname, dropped_path, dropped_name,
         action_file_extension, action_file_signature_status, dropper, dropper_class,
         dropper_user, dropper_cmd
// did anything then EXECUTE that exact path?
| join type = inner (
    dataset = xdr_data
    | filter event_type = ENUM.PROCESS
    | alter exec_path = lowercase(action_process_image_path),
            exec_host = lowercase(agent_hostname),
            exec_time = _time,
            exec_user = action_process_username,
            exec_cmd  = action_process_image_command_line,
            exec_parent = coalesce(causality_actor_process_image_name, actor_process_image_name),
            exec_sha256 = action_process_image_sha256,
            exec_sig = action_process_signature_status
    | fields exec_path, exec_host, exec_time, exec_user, exec_cmd, exec_parent, exec_sha256, exec_sig
  ) as run run.exec_path = dropped_path and run.exec_host = drop_host
// acquisition then run only counts if the run came AFTER the write
| alter minutes_drop_to_exec = timestamp_diff(exec_time, drop_time, "MINUTE")
// acquisition then run only counts if the run came AFTER the write
| filter minutes_drop_to_exec >= 0
/* TUNING - dominant false-positive class on Windows: OS servicing and installer
   self-extraction (MoUsoCoreWorker/DismHost, VC_redist, *.tmp bootstrappers) drop and
   immediately run their own payload inside C:\Windows\Temp as SYSTEM. Flagged rather than
   silently dropped so it stays visible, then excluded for the detection. */
| alter servicing_selfextract = if(
    dropper_user ~= "(?i)(SYSTEM|LOCAL SERVICE|NETWORK SERVICE)$"
      and dropped_path ~= "(?i)(\\windows\\temp\\|\\softwaredistribution\\|\\windows\\installer\\)",
    "yes", "no")
| filter servicing_selfextract = "no"
| fields drop_time, agent_hostname, dropped_name, dropped_path, dropper, dropper_class,
         dropper_user, minutes_drop_to_exec, exec_time, exec_user, exec_parent,
         exec_sig, exec_sha256, exec_cmd
| sort desc drop_time
| limit 100
```

**Interpretation.** KOI will eventually inventory whatever the installer leaves behind, but only at
the next scan. The write-then-execute pair is the *moment* of acquisition and is visible in XDR
immediately. Ground truth on this tenant: `chrome.exe` wrote
`C:\Users\amahmoud\Downloads\Antigravity-x64.exe`, it was then run, and KOI reported
`Antigravity 2.3.1` on `win-workstation` afterwards.

**False positives.** Named and handled in the query: Windows OS servicing and installer
self-extraction (MoUsoCoreWorker/DismHost, VC_redist, `*.tmp` bootstrappers) drop and immediately run
their own payload inside `C:\Windows\Temp` as SYSTEM. The `servicing_selfextract` column flags them
rather than silently dropping them, so the class stays visible while being excluded from the
detection.

> **Caveat, flagged not fixed.** Both path regexes here use the `\\Downloads\\` form. Per syntax fact
> #1 that reaches the regex engine as `\D` `ownloads` `\|`, where `\D` is "non-digit" — so the
> expression may match far more loosely than intended, or differently on the two `filter` lines. The
> originating agent reports the query parsed and returned rows, and it was not re-run in this pass.
> **Confirm the match set on the re-run; if it is wrong, convert to the `.`-wildcard form used in
> A7/C3.**

---

# Group 3 — XDR-only: agentic runtime

AI agents, MCP servers, and what they actually do. None of these touch the KOI pack.

---

## B2 — MCP server execution via the stdio spawn chain

**Purpose:** detection + investigation
**Datasets:** `xdr_data` (PROCESS)
**Question:** Which MCP servers are actually running, under which AI client, on which host?
**Provenance:** `VALIDATED (agent), 8 rows` over **7d**, zero false positives
**Parameters:** none — but **run over 7d, not 24h** (see interpretation).

```
// Theme B / B2 - MCP server execution (stdio transport).
// A local MCP server has no service of its own: the AI client spawns it as a CHILD process.
// So the signal is a generic runtime (node / npx / python / uv / docker) whose command line
// names an MCP entrypoint, sitting under an agent causality group owner.
// Detection + Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, ""))
// Only generic runtimes. Deliberately EXCLUDES shells: an analyst's own `grep mcp` in a
// zsh command line is the single biggest false positive in this dataset.
| filter proc in ("node", "node.exe", "npx", "npx.cmd", "env", "python", "python.exe",
                  "python3", "python3.12", "python3.13", "uv", "uvx", "uv.exe", "uvx.exe",
                  "bun", "deno", "docker", "podman")
// "mcp" must sit on a package-name boundary (@scope/mcp, foo-mcp, mcp-server-x), otherwise
// any file called mcp_type.py or resmcp.py matches. This one clause removes ~all noise.
| filter cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd ~= "mcp-server" or cmd contains "modelcontextprotocol"
// Pull the package/entrypoint token that carries "mcp" out of the command line.
| alter mcp_entrypoint = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
| alter agent_owner = if(
      root contains "claude",      "claude",
      root contains "cursor",      "cursor",
      root contains "antigravity", "antigravity",
      root contains "windsurf",    "windsurf",
      root contains "code",        "vscode_family",
      root contains "ollama",      "ollama",
      "UNATTRIBUTED")
| comp count() as spawns,
       min(_time) as first_spawn,
       max(_time) as last_spawn,
       count_distinct(agent_hostname) as hosts
   by agent_hostname, agent_owner, causality_actor_process_image_name, proc, mcp_entrypoint
| sort desc spawns
```

**Interpretation.** `causality_actor_process_image_name` is the field that makes MCP detection possible
at all: an MCP server is a bare `node` or `python`, and only the causality group owner says which agent
owns it. Observed chain: `Claude` → `claude` → `env` → `node @playwright/mcp`.

Real servers found on this tenant: `@playwright/mcp@latest` (256 `node` spawns + 16 `env` spawns,
owner `claude`, `OfficeiMac`); the same server resolved through the npx cache as
`.../node_modules/.bin/playwright-mcp`; and `start-mcp-server` run through `uvx` → `uv` → `python3.12`.
The same logical server appears under **both** `env` and `node` because macOS spawns
`/usr/bin/env node <entrypoint>` — **count distinct entrypoints, not rows.**

**Over 24h this query returns zero.** MCP spawns here are bursty and the most recent burst was ~4 days
old. Zero rows on a 24h window means "no agent session ran today", **not** that the query is wrong.

**False positives.** Before the package-boundary regex was added, this returned 25 rows including
`resmcp` (a python script arg), `mcp_type` (a column name in an analyst's own query), a base64 blob,
and a YAML filename containing `_mcp_server`. The `[/@\-]mcp([\-/@\s"']|$)` clause plus excluding
shells from the runner list removed all of them. **Do not relax either clause.** Remaining risk: a
legitimately-named non-MCP package like `some-mcp-utils` would still match.

---

## B6 — An AI agent or one of its MCP servers touching a secret store

**Purpose:** detection
**Datasets:** `xdr_data` (FILE)
**Question:** Did anything inside an agent's process tree read or write `~/.ssh`, `.aws`, a
kubeconfig, an `.npmrc`, a browser profile or a `.env`?
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** none. The `secret_class` classifier is the tuning surface.

```
// Theme B / B6 - An AI agent or one of its MCP servers touching a secret store.
// This is the concrete harm behind "agentic runtime risk": an MCP server runs with the full
// privilege of the user who started it, so a poisoned tool or an injected prompt reads
// ~/.ssh, .env, cloud tokens or a browser profile with no further exploitation needed.
// Detection.
dataset = xdr_data
| filter event_type = ENUM.FILE
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
// Scope to agent-owned process trees FIRST. An unscoped FILE scan on this tenant is ~115k
// rows/day on one host alone and the aggregation will not return.
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root contains "codex" or root = "code" or root = "code.exe"
| alter p = lowercase(coalesce(action_file_path, ""))
// Separator-free tokens on purpose: one expression then matches both the POSIX and the
// Windows form of each path. Do NOT write backslashes inside XQL string literals here -
// "\\temp\\" is a parse error; only comments may contain them.
| alter secret_class = if(
      p contains ".ssh" or p contains "id_rsa" or p contains "id_ed25519",      "ssh_key",
      p contains ".aws",                                                        "aws_credentials",
      p contains "gcloud",                                                      "gcp_credentials",
      p contains ".kube",                                                       "kubeconfig",
      p contains ".npmrc" or p contains ".pypirc" or p contains ".netrc",       "package_registry_token",
      p contains "keychain" or p contains "credentials" or p contains "vaults", "os_credential_store",
      p contains "login data" or p contains "cookies" or p contains "web data", "browser_profile",
      p contains ".env",                                                        "dotenv",
      p contains "token",                                                       "token_file",
      null)
| filter secret_class != null
| alter access = to_string(event_sub_type)
| comp count() as events,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, actor_process_image_name,
      secret_class, access, action_file_path
| sort desc events
```

**Interpretation.** This is the concrete harm behind the phrase "agentic runtime risk". An MCP server
runs with the full privilege of the user who started it, so a poisoned tool or an injected prompt
reads `~/.ssh`, `.env`, cloud tokens or a browser profile with no further exploitation needed.

Two structural notes worth keeping: the agent-tree filter **must come first** (an unscoped FILE scan is
~115k rows/day on one host alone and the aggregation will not return), and the broad exclusion clause
must come **after** `filter secret_class != null` or the query times out.

**False positives.** High by design — `p contains "token"` and `p contains "credentials"` will match
ordinary project files, and a coding agent legitimately reads `.env` files in the repo it is working
in. Treat this as a hunt surface, not an alert, until you have baselined which `secret_class` values
are normal for your agent population.

---

## B5 — Anomalous egress from an AI agent or its MCP servers

**Purpose:** detection
**Datasets:** `xdr_data` (NETWORK)
**Question:** Which agent-owned processes reached the public internet on a non-web port, or to a
country outside the approved set?
**Provenance:** `VALIDATED (agent), row count lost` (79 rows → 12 after the `action_country` ENUM fix)
**Parameters:** `// PARAM: approved egress countries` — `("US", "IE", "GB", "NL")` is tenant-specific
and must be set per estate.

```
// Theme B / B5 - Anomalous egress from an AI agent or its MCP servers.
// An agent talking to its own model API is normal. The detection is an agent-owned process
// reaching the public internet on a NON-WEB port, or to a country outside the approved set -
// the shape a rogue MCP server or a prompt-injection-driven exfil attempt takes.
// Detection.
dataset = xdr_data
| filter event_type = ENUM.NETWORK
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root contains "codex" or root = "code" or root = "code.exe"
// public destinations only - drop loopback, RFC1918 and link-local
| filter action_network_is_loopback = false or action_network_is_loopback = null
| filter action_remote_ip != null
| filter not (incidr(action_remote_ip, "10.0.0.0/8") or incidr(action_remote_ip, "172.16.0.0/12")
           or incidr(action_remote_ip, "192.168.0.0/16") or incidr(action_remote_ip, "127.0.0.0/8")
           or incidr(action_remote_ip, "169.254.0.0/16"))
// action_country is an ENUM column. It must be cast before any string comparison, and
// to_string() yields the ISO-3166 ALPHA-2 CODE ("US"), not the label ("UNITED_STATES") that
// `comp ... by action_country` prints. Comparing against the label silently matches nothing.
// "-" is the code this tenant emits for an unresolved/private destination.
| alter country = to_string(action_country)
// PARAM: approved egress countries for AI/agent traffic (ISO alpha-2)
| alter approved_country = if(country in ("US", "IE", "GB", "NL"), true, false)
| alter web_port = if(action_remote_port in (80, 443, 8443), true, false)
| filter approved_country = false or web_port = false
| alter reason = if(approved_country = false and web_port = false, "off_country_and_off_port",
                    approved_country = false,                      "unapproved_country",
                                                                   "non_web_port")
| comp count() as flows, min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, actor_process_image_name,
      country, action_remote_ip, action_remote_port, action_external_hostname, reason
| sort desc flows
```

**Interpretation.** An agent talking to its own model API is normal. The detection is an agent-owned
process reaching the public internet on a **non-web port** or to an **unapproved country** — the shape
a rogue MCP server or a prompt-injection-driven exfiltration attempt takes.

**The `action_country` ENUM trap is the load-bearing detail here** (syntax fact #7): comparing against
the printed label instead of the alpha-2 code silently matches nothing. This was a live bug, caught
mid-validation, that took the result from 79 rows to 12.

**False positives.** The country allow-list is the whole tuning surface and is tenant-specific.
`"-"` is the code this tenant emits for an unresolved destination and will read as unapproved. DNS on
port 53 will fire `non_web_port` continuously unless excluded.

---

## B1 — Agentic runtime inventory by causality group owner

**Purpose:** investigation
**Datasets:** `xdr_data` (PROCESS)
**Question:** Which AI-agent and coding-agent software is actually executing in the estate?
**Provenance:** `VALIDATED (agent), 24 rows` (24h)
**Parameters:** none; extend the `agent_family` classifier as new agents appear.

```
// Theme B / B1 - Agentic runtime inventory: which AI-agent / coding-agent software is
// actually EXECUTING in the estate. Run this first; it defines the surface every other
// Theme B detection is tuned against.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    proc = lowercase(coalesce(action_process_image_name, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, "")),
    cmd  = lowercase(coalesce(action_process_image_command_line, ""))
// Classify by the CAUSALITY GROUP OWNER (the root of the tree), not the leaf: an MCP
// server is a bare `node`/`python`, and only the CGO says which agent owns it.
| alter agent_family = if(
      root contains "claude"      or proc contains "claude",      "claude",
      root contains "cursor"      or proc contains "cursor",      "cursor",
      root contains "antigravity" or proc contains "antigravity", "antigravity",
      root contains "windsurf"    or proc contains "windsurf",    "windsurf",
      root contains "copilot"     or proc contains "copilot",     "copilot",
      root contains "codex"       or proc contains "codex",       "codex",
      root contains "ollama"      or proc contains "ollama",      "ollama",
      root contains "code"        or proc contains "code",        "vscode_family",
      cmd contains "mcp",                                         "mcp_unattributed",
      null)
| filter agent_family != null
| comp count() as events,
       count_distinct(action_process_image_name) as distinct_child_images,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, agent_family, causality_actor_process_image_name
| sort desc events
```

**Interpretation.** `distinct_child_images` is the column that matters. On `OfficeiMac`, `Code`
generated 17,552 events across **6** distinct child images while `Claude` generated 15,398 across
**24** — that 24-vs-6 gap is the signal that an AI agent is not just an editor, it drives two dozen
distinct executables. `win-workstation` shows `Antigravity.exe` and a `VSCodeUserSetup-x64-1.129.1.exe`
installer tree (57 events, 12 distinct children — an agentic IDE being installed inside the window).
`thor` shows `mscopilot.exe`.

Zero rows would mean no AI tooling runs in the estate. For any modern developer population that far
more likely means the classifier misses the local agent brand than that the estate is clean —
cross-check with B0.

**False positives.** `proc contains "code"` over-matches: `Microsoft Update Assistant` (12 events) and
`com.adobe.acc.installer.v2` (3 events) were classified `vscode_family` because a child process name
contained "code". Tighten to `root = "code" or root = "code.exe" or root contains "vscode"` if
precision matters more than recall.

---

## B10 — An AI agent driving a supply-chain change itself

**Purpose:** detection + investigation
**Datasets:** `xdr_data` (PROCESS)
**Question:** Which package installs happened *inside* an agent's causality group — the agent
installing, not just consuming?
**Provenance:** `VALIDATED (agent), row count lost`
**Parameters:** none. The agent-root filter is the tuning surface.

```
// Theme B / B10 - An AI agent driving a supply-chain change itself.
// The agent is not just consuming packages, it is INSTALLING them: `claude` -> zsh -> pip/npm
// install. Every such event should show up in KOI's Audit stream as an `installed` action
// shortly afterwards; if it does not, KOI has not rescanned yet (see B9).
// Detection + Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, ""))
// Only inside an agent's causality group - a developer typing `pip install` themselves is
// not agentic risk and must not fire this.
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root = "code" or root = "code.exe"
| filter (cmd contains "pip install" or cmd contains "pip3 install" or cmd contains "npm install"
       or cmd contains "npm i " or cmd contains "yarn add" or cmd contains "pnpm add"
       or cmd contains "uv pip install" or cmd contains "uv add" or cmd contains "uvx "
       or cmd contains "npx " or cmd contains "brew install" or cmd contains "cargo install"
       or cmd contains "go install" or cmd contains "gem install"
       or cmd contains "docker pull" or cmd contains "curl -" and cmd contains "| sh")
| alter ecosystem = if(
      cmd contains "pip",    "pypi",
      cmd contains "npm" or cmd contains "npx" or cmd contains "yarn" or cmd contains "pnpm", "npm",
      cmd contains "uv",     "pypi_uv",
      cmd contains "brew",   "homebrew",
      cmd contains "cargo",  "crates",
      cmd contains "go ",    "go",
      cmd contains "gem",    "rubygems",
      cmd contains "docker", "docker",
                             "shell_pipe")
| comp count() as installs,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, action_process_username,
      ecosystem, action_process_image_name, action_process_image_command_line
| sort desc installs
```

**Interpretation.** The exact complement of A2: A2 excludes IDE and agent parents, B10 requires them.
Run them as a pair and you have partitioned every acquisition on the estate into human, agent, and
machine.

**False positives.** The final `or` clause mixes `and` and `or` without parentheses
(`cmd contains "curl -" and cmd contains "| sh"`), so operator precedence may not bind as intended —
**verify that branch on the re-run**. `cmd contains "go "` will match any command line containing the
word "go" followed by a space.

---

## B4 — Network egress attributed to an AI agent's process tree

**Purpose:** investigation (baseline), detection when scoped
**Datasets:** `xdr_data` (NETWORK)
**Question:** What does each host's agent egress profile look like?
**Provenance:** `VALIDATED (agent), 53 rows` (24h)
**Parameters:** none; add agent names to the root filter as needed.

```
// Theme B / B4 - Network egress attributed to an AI agent's process tree.
// NOTE ON FIELDS (verified on this tenant): on NETWORK events action_process_image_name is
// ALWAYS NULL - the process identity is actor_process_image_name, and the owning application
// is causality_actor_process_image_name. dns_query_name is NOT populated here (0 of 15616
// agent-owned NETWORK rows), so DNS-name pivots are unavailable; use action_external_hostname.
// Detection (unexpected country / port) + Investigation (per-host egress profile).
dataset = xdr_data
| filter event_type = ENUM.NETWORK
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root = "code" or root = "code.exe"
| filter action_network_is_loopback = false or action_network_is_loopback = null
| alter dest = coalesce(action_external_hostname, action_remote_ip)
| comp count() as flows,
       count_distinct(action_remote_ip) as distinct_ips,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, actor_process_image_name,
      action_country, action_remote_port, dest
| sort desc flows
```

**Interpretation.** This is the baseline B5 is measured against. Notables on this tenant: `Claude` on
`OfficeiMac` generated 6,427 DNS flows and **42 flows on port 22 (SSH) from the `claude` binary to
192.168.20.231** — an AI agent opening SSH sessions to an internal host is exactly the behaviour worth
knowing about. `Code` reached `169.254.169.254`, the cloud instance-metadata address, on port 80.
`thor` surfaced `ollama app.exe` here even though it is invisible to a PROCESS-name probe, because
Ollama is a long-running service whose process start fell outside the window.

**That last point generalises: a PROCESS-name-only agent inventory under-reports resident runtimes.**
Discover them via NETWORK (B4) and FILE (B6).

**False positives.** None in the detection sense — this is a profile, not an alert. Note that
`action_country` here is *printed as the label* by `comp ... by`, not the alpha-2 code; do not copy a
value out of this output into a B5-style `in (...)` comparison.

---

## B3 — Full child-process tree of one AI agent on one host

**Purpose:** investigation (playbook)
**Datasets:** `xdr_data` (PROCESS)
**Question:** Given a host and an agent application, what did that agent cause to run?
**Provenance:** `Not validated by originating agent` — shipped with `parses: false`, meaning
unverified, not known-bad. **Needs re-run.**
**Parameters:** `// PARAM: hostname`, `// PARAM: agent application` — both hardcoded to this tenant's
values and must be replaced.

```
// Theme B / B3 - Full child-process tree of one AI agent on one host.
// Playbook-facing: given a host (and optionally a specific agent app) this reconstructs
// everything the agent caused to run - MCP servers, shells, package managers, git, curl.
// Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
// PARAM: hostname
| filter agent_hostname = "OfficeiMac"
// PARAM: agent application (the causality group owner). Widen or drop to see all agents.
| filter causality_actor_process_image_name in ("Claude", "Cursor", "Code", "Antigravity.exe",
                                                "Windsurf.exe", "ollama app.exe")
| alter cmd = coalesce(action_process_image_command_line, "")
| alter activity = if(
      lowercase(cmd) ~= "[/@\-]mcp([\-/@\s\"']|$)" or lowercase(cmd) ~= "mcp-server", "mcp_server",
      action_process_image_name in ("npm", "npx", "pip", "pip3", "uv", "uvx", "yarn", "pnpm",
                                    "brew", "gem", "cargo", "go"),                     "package_manager",
      action_process_image_name in ("zsh", "bash", "sh", "cmd.exe", "powershell.exe"),  "shell",
      action_process_image_name in ("curl", "wget", "git", "gh", "ssh", "scp"),         "network_tool",
      action_process_image_name in ("node", "python", "python3", "python3.12", "Python"), "interpreter",
                                                                                        "other")
| comp count() as executions,
       count_distinct(action_process_image_command_line) as distinct_cmdlines,
       min(_time) as first_seen,
       max(_time) as last_seen
   by causality_actor_process_image_name, activity, actor_process_image_name,
      action_process_image_name, action_process_username
| sort desc executions
```

**Interpretation.** The playbook-facing drill-down after B1 or B2 identifies an agent worth looking at.
The `activity` classifier buckets the tree into MCP servers, package managers, shells, network tools
and interpreters, which is usually enough to answer "what was this agent doing" in one screen.

**False positives.** N/A (investigation). But note the `causality_actor_process_image_name` list is a
hardcoded inventory of *this tenant's* agents, taken from B0/B1. Regenerate it from B1 before using
this anywhere else.

---

## B0 — Ground-truth probe: which agent-ish process image names actually exist

**Purpose:** investigation (discovery probe — **not** a detection)
**Datasets:** `xdr_data` (PROCESS)
**Question:** Before tuning anything, which agent binaries are actually on this estate?
**Provenance:** `VALIDATED (agent), 7 rows` (24h)
**Parameters:** none — the name list is deliberately hardcoded. Edit the list, not a variable.

```
// Theme B / B0 - Ground truth probe: which agent-ish PROCESS IMAGE NAMES actually exist here.
// Run this before anything else. Every other Theme B query is tuned to what this returns;
// guessing at agent binary names produces a library of queries that are all quiet.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter pname = lowercase(action_process_image_name)
| filter pname in ("node","node.exe","npx","npx.cmd","bun","deno","uv","uvx","uvx.exe","python","python.exe","python3","Python","claude","cursor","code","code.exe","ollama","copilot","codex","windsurf","antigravity")
   or pname contains "claude" or pname contains "cursor" or pname contains "copilot"
   or pname contains "ollama" or pname contains "codex" or pname contains "windsurf"
   or pname contains "antigravity" or pname contains "node" or pname contains "npx"
   or pname contains "uvx" or pname contains "aider" or pname contains "gemini"
| comp count() as n by agent_hostname, action_process_image_name
| sort desc n
```

**Interpretation.** Run this first on any new estate. On this tenant it returned `Python` 2826
(OfficeiMac), `claude` 180 (OfficeiMac), `python.exe` 112 (win-workstation), `Code.exe` 10,
`Antigravity.exe` 7, `Antigravity-x64.exe` 1 (win-workstation), `mscopilot.exe` 1 (thor). Nothing for
cursor, windsurf, codex, aider or gemini-cli.

Two lessons it teaches: (1) `node` returns **zero** over 24h but **288 spawns over 7d** — MCP activity
here is bursty, which is why B2 must run over 7d; (2) `ollama app.exe` on thor does **not** appear at
all, because it is a long-running service whose process start fell outside the window.

**False positives.** Broad `contains` matching pulls in unrelated binaries on other estates (anything
named `*-node*`, `*-code*`). Acceptable — this is a discovery probe, not a detection.

---

# Group 4 — KOI coverage and integrity

Is the supply-chain telemetry trustworthy? A7 (Group 1) is the primary query for this question; these
support it.

---

## C3 — KOI scan executions per host, with timestamps and launch command line

**Purpose:** investigation (per-scan detail); detection when paired with A7
**Datasets:** `xdr_data` (PROCESS)
**Question:** When did the KOI agent actually execute on each host, and in which of its two forms?
**Provenance:** `VALIDATED (agent), 25 rows` (capped by the limit) — the `koi_launch_kind` classifier
folded in from C4 was validated separately, `VALIDATED (agent), 2 rows`. The **combination** has not
been run. `CORRECTED — needs re-run`.
**Parameters:** `// PARAM: hostname` — add `and agent_hostname = "<host>"` to scope inside a playbook.

```
// Theme C / C3 - KOI scan executions per host, with timestamps and launch command line.
// The KOI agent bundles its own WinPython and runs as
//   C:\Users\Default\AppData\Local\Koi\Python\WPy64-*\python\python.exe -I <tmp>.py[z]
// spawned by powershell.exe. The path anchor is what makes this clean - matching the bare
// substring "Koi" pulls in unrelated lab scripts and any directory named KOI-* (see C2/C5).
// The `.` in the regex is a wildcard standing in for the backslash: XQL string-literal
// backslash escaping is unreliable here and this form is the one that validated.
// Investigation (per-scan detail) + Detection (pair with A7 for staleness).
dataset = xdr_data
| filter event_type = ENUM.PROCESS
// PARAM: hostname - add `and agent_hostname = "<host>"` to scope to one host in a playbook
| filter action_process_image_path ~= "(?i)AppData.Local.Koi.Python"
// Each launch is a PAIR: a .py launcher, then ~90ms later the .pyz zipapp that does the scan
// (note the trailing space on the .pyz form). If `other` ever becomes non-empty, KOI has
// changed its launch shape and this signature needs review.
| alter koi_launch_kind = if(action_process_image_command_line ~= "(?i)\.pyz", "scan_zipapp_pyz",
                          if(action_process_image_command_line ~= "(?i)\.py\s*$", "launcher_py", "other"))
| comp count() as n, min(_time) as first, max(_time) as last
  by agent_hostname, koi_launch_kind, action_process_image_command_line, actor_process_image_name
| sort desc n
| limit 25
```

**Interpretation.** Every row has `n=1`, because each launch gets a fresh random temp filename — so
the row count *is* the execution count, and grouping by command line effectively lists individual
scans. All rows on this tenant are `win-workstation` with parent `powershell.exe`. The `other` bucket
returned zero rows, meaning the two-form model is complete here.

**False positives.** Essentially none. The path anchor is KOI's own bundled WinPython and matched
nothing else on the tenant — unlike the bare-substring approach in C2, which matched 4,275 events of
an unrelated lab script.

---

## C5 — Control query: real KOI agent vs. a lab script named "koi"

**Purpose:** investigation (false-positive proof / playbook disambiguation step)
**Datasets:** `xdr_data` (PROCESS)
**Question:** Is the KOI-looking Python activity on this host the actual KOI agent, or something else
named "koi"?
**Provenance:** `VALIDATED (agent), 2 rows`
**Parameters:** `// PARAM: hostname` — `"thor"` is this tenant's example.

```
// Theme C / C5 - Control query: is the KOI-looking Python activity on this host the actual
// KOI agent, or something else named "koi"? Ship this as the disambiguation step in any
// investigation playbook that gets a "KOI activity" hit.
// Rule: if the interpreter is a USER-INSTALLED Python rather than KOI's bundled WinPython
// under AppData\Local\Koi\Python\, it is not KOI.
// Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
// PARAM: hostname - the host that triggered the KOI-activity hit
| filter agent_hostname = "thor"
| filter action_process_image_name in ("pythonw.exe","python.exe") or actor_process_image_name in ("pythonw.exe")
| comp count() as n, min(_time) as first, max(_time) as last
  by action_process_image_name, action_process_image_path, actor_process_image_name, actor_process_command_line
| sort desc n
| limit 20
```

**Interpretation.** Returned 2 rows revealing
`"C:\Users\ayman\AppData\Local\Programs\Python\Python312\pythonw.exe" D:\VMs\wsl-koi\koi_ssh_relay.py`
driving `wsl.exe` **4,275 times in 24h**. That is a hand-built lab SSH relay against a WSL distro named
`koi-engine`, not the KOI agent. **The rule this encodes: if the interpreter is a user-installed
Python rather than KOI's bundled WinPython, it is not KOI.** Ship it as the disambiguation step in any
playbook that receives a "KOI activity" hit.

**False positives.** N/A — this query exists to *expose* one.

---

## C2 — KOI-referencing process shapes, grouped by host and image

**Purpose:** investigation (orientation / signature discovery — **do not promote to a detection**)
**Datasets:** `xdr_data` (PROCESS)
**Question:** Across all hosts, what distinct (host, image, parent) shapes reference KOI, and how
often?
**Provenance:** `VALIDATED (agent), 35 rows`
**Parameters:** none — tenant-wide by design.

```
// Theme C / C2 - KOI-referencing process shapes, grouped by host and image.
// ORIENTATION ONLY - deliberately broad, exists to ENUMERATE false positives before you
// pin a precise signature. Do not promote this to a detection; use C3/A7 for that.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path contains "Koi" or action_process_image_command_line contains "Koi" or actor_process_command_line contains "Koi"
| comp count() as n,
       min(_time) as first_seen,
       max(_time) as last_seen
  by agent_hostname, action_process_image_name, action_process_image_path, actor_process_image_name
| sort desc n
| limit 40
```

**Interpretation.** The one row that matters: `win-workstation` / `python.exe` /
`C:\Users\Default\AppData\Local\Koi\Python\WPy64-31290\python\python.exe` / parent `powershell.exe`,
n=98 (the 49+49 launcher/zipapp pairs). It also reveals KOI's scan fan-out — that `python.exe` spawns
`cmd.exe` 1,437 times and `icacls.exe` 490 times in 24h — which is worth knowing so it is not mistaken
for attacker activity.

**False positives.** Very high, deliberately. Three sources, all real on this tenant: (a) the lab
SSH-relay on `thor` (4,275 events/24h); (b) any path containing "koi" — including **this project's own
`KOI-MP` directory** on `OfficeiMac`; (c) "KOI" embedded in unrelated hostnames such as
`DESKTOP-8Q6G4SKOI`. Use C3 or A7 for anything that alerts.

---

# Group 5 — KOI-only

Useful, and they recover capability the Marketplace pack's API does not expose — but they are not the
point of this exercise. Ranked last deliberately.

---

## D1 — Item full KOI history across every host

**Purpose:** investigation
**Datasets:** `koi_koi_raw` (Audit only)
**Question:** Given an item, when was it installed, updated, uninstalled or remediated — on which
hosts, at which versions, by whom?
**Provenance:** `VALIDATED (agent), 2 rows` for `octocat/Hello-World`; 88 rows across 8 hosts for
`anthropic.claude-code`
**Parameters:** `// PARAM: item_key` / `item_name` — both sides of the OR take the same value when you
only have one. Suggested timeframe 30d.

```
// Theme D / D1 - Item full KOI history across every host.
// Marketplace KOI pack 1.2.3 has NO history command, no koi-remediations-list and no
// koi-approval-requests-list - the Audit stream is the only source of an item timeline.
// Audit is NOT duplicated on this tenant (1.0 ratio) - do not dedupe.
// PARAM: item_key  = KoiContext.item_id (from the alert's observables[name="item.id"])
//                    or Koi.Inventory.item_id
// PARAM: item_name = Koi.Inventory.name (pass the same value twice if you only have one)
// Investigation. Suggested timeframe 30d.
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter type in ("extensions", "remediation")
| filter object_id = "octocat/Hello-World" or object_name = "octocat/Hello-World"   // PARAM
| alter koi_host      = coalesce(hostname, "<no host on event>")
| alter koi_action    = coalesce(action, "-")
| alter koi_actor     = coalesce(triggered_by, "-")
// EVENTS emit the short marketplace vocabulary (github, vsc, chrome, software_windows);
// the KOI API and UI use the long forms (github_mcp_registry, vscode, chrome_web_store,
// windows). Do NOT feed this value straight into a koi-* command argument.
| alter marketplace_event_vocab = coalesce(marketplace, "-")
| fields _time, koi_host, koi_action, type, object_name, object_id, item_version,
         marketplace_event_vocab, platform, category, koi_actor, message, id
| sort asc _time
| limit 500
```

**Interpretation.** The Marketplace pack has **no history command at all** — no
`koi-remediations-list`, no `koi-approval-requests-list` — so the Audit stream is the only source of an
item timeline. Two rows is the correct answer for the worked example, not a thin one: it is the
complete verified lifecycle of `octocat/Hello-World` on `win-workstation`, installed and uninstalled,
both carrying the **same** `item_version 7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`. Git repos use the
remote as `object_name` and the commit SHA as the version, **which is why version alone never
distinguishes an install from a removal**.

**False positives.** `object_name` is not unique — generic names such as `npm`, `pip`, `access` or
`configure` collide across marketplaces and will pull in unrelated items. When the marketplace is
known, add `| filter marketplace = "<event vocab value>"`. Matching on `object_id` alone is exact but
not always available from an alert.

---

## D3 — Host agentic supply-chain posture by marketplace

**Purpose:** investigation
**Datasets:** `koi_koi_raw` (Audit only)
**Question:** Given a host, what is currently on it, broken down by marketplace and platform?
**Provenance:** `VALIDATED (agent), 7 rows` (30d)
**Parameters:** `// PARAM: koi_host`. **Run at 30d or longer, not 24h.**

```
// Theme D / D3 - Host agentic supply-chain posture by marketplace.
// The device-side entry point the Marketplace pack cannot provide: 1.2.3 has no
// koi-devices-list, no koi-device-inventory-get and no Koi.Device.* context, so a hostname
// cannot be turned into an inventory through the API. This does it from events.
// The `dedup ... by desc _time` then `filter action != "uninstalled"` pair is the whole
// trick: it nets install/update/uninstall churn down to present-tense state.
// PARAM: koi_host = inputs.hostname (KOI Ext - Investigate Device)
// Investigation. Run at 30d or longer for posture, NOT 24h.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter hostname = "win-workstation"                                 // PARAM: koi_host
| dedup object_id, marketplace by desc _time
| filter action != "uninstalled"
// "<unset>" is not an error: claude_code items genuinely carry no marketplace, and
// built_in / side_loaded seen elsewhere are installation METHODS leaking into this field.
| alter marketplace_event_vocab = coalesce(marketplace, "<unset>")
| comp count()               as items_present,
       values(object_name)   as item_names,
       max(_time)            as latest_change
     by marketplace_event_vocab, platform
| sort desc items_present
| limit 50
```

**Interpretation.** This is the device-side entry point the Marketplace pack cannot provide: v1.2.3
has no `koi-devices-list`, no `koi-device-inventory-get` and **no `Koi.Device.*` context at all**, so a
hostname cannot be turned into an inventory through the API. This does it from events.

The largest group on `win-workstation` is the interesting one: **14 items on `platform = "claude_code"`
with `marketplace` unset** (access, agent-development, build-mcp-server,
claude-automation-recommender, hook-development, playground, plugin-settings, skill-development, …).
**That is the agentic surface, and it is invisible to any query that keys on `marketplace`.** Also
present: 5 `vsc` extensions, 3 `chrome`, 3 `software_windows`, 1 `pypi`.

**False positives.** It nets to state only *within the query timeframe*: an item installed before the
window and never touched again has no row inside it and will be missing entirely. This is the single
most likely way to get a wrong answer from this query.

---

## D3b — Recent supply-chain changes on a host, classified

**Purpose:** investigation
**Datasets:** `koi_koi_raw` (Audit only)
**Question:** What has changed on this device recently, and how much of it touches an agent or IDE
surface?
**Provenance:** `VALIDATED (agent), 85 rows` (7d)
**Parameters:** `// PARAM: koi_host`, `// PARAM: lookback` (set on the query timeframe).

```
// Theme D / D3b - Recent supply-chain changes on a host, classified.
// The narrative feed for a device investigation: change_class says what kind of change it
// was, agentic_surface says whether it touched an agent/IDE surface or is just Chrome
// updating itself.
// Verified action vocabulary on this tenant: installed, updated, uninstalled, archived,
// unarchived, remediation_opened, remediation_executed, remediation_pending, created,
// allowlist_items_added, enabled, disabled, email_sent - plus approval_requests rows where
// action is NULL, which is why the if-chain ends in "other".
// PARAM: koi_host = inputs.hostname
// PARAM: lookback = set on the query timeframe (7d in the worked example)
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter hostname = "win-workstation"                                  // PARAM: koi_host
| alter change_class = if(type = "remediation", "remediation",
                       if(action in ("installed", "updated"), "acquisition",
                       if(action = "uninstalled", "removal", "other")))
| alter agentic_surface = if(platform in ("claude_code", "vsc", "cursor", "jet", "npp"), "agent_or_ide",
                          if(platform in ("chrome", "edge"), "browser", "os_package"))
| fields _time, change_class, agentic_surface, action, type, object_name, object_id,
         item_version, marketplace, platform, category, triggered_by, message
| sort desc _time
| limit 300
```

**Interpretation.** The narrative feed for a device investigation. Two derived columns do the work:
`change_class` (acquisition / removal / remediation / other) and `agentic_surface` (agent_or_ide /
browser / os_package), so an analyst sees at a glance whether the week's churn is Chrome updating
itself or an agent surface moving. 85 rows over 7d on `win-workstation`, spanning `claude_code` skill
removals, `vsc` extension installs, GitHub repo acquisition and Windows package updates.

**False positives.** The `agentic_surface` platform lists are a closed enumeration taken from this
tenant. A platform value not in either list falls to `os_package`, which will silently mislabel a new
agent surface. Re-derive the lists periodically with `comp count() by platform`.

---

## D1b — Item history rolled up per host

**Purpose:** investigation (war-room summary block)
**Datasets:** `koi_koi_raw` (Audit only)
**Question:** One line per host that has ever seen this item.
**Provenance:** `VALIDATED (agent), 1 row` for the worked example
**Parameters:** same as D1.

```
// Theme D / D1b - Item history rolled up per host, for a war-room summary block.
// Same PARAMs as D1. `values()` emits a deduplicated array per group, so versions_seen
// doubles as a version-drift indicator without a second query.
// Investigation. Suggested timeframe 30d.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type in ("extensions", "remediation")
| filter object_id = "octocat/Hello-World" or object_name = "octocat/Hello-World"   // PARAM
| alter koi_host = coalesce(hostname, "<no host on event>")
| comp min(_time)               as first_seen,
       max(_time)               as last_seen,
       count()                  as koi_events,
       values(action)           as actions_seen,
       values(item_version)     as versions_seen,
       values(marketplace)      as marketplaces_seen,
       values(triggered_by)     as triggered_by_actors
     by koi_host
| sort desc last_seen
| limit 200
```

**Interpretation.** Collapses D1 into something a playbook can paste into a war-room note.
`versions_seen` doubles as a version-drift indicator without a second query. `triggered_by` is `"Koi"`
for everything agent-discovered — **a human or API actor in that column is itself worth reading.**

**False positives.** Same name-collision caveat as D1. `first_seen` is bounded by the query timeframe,
not by when the item genuinely first appeared, so an item present before the retention window looks
younger than it is.

---

## B11 — KOI's agentic supply-chain churn

**Purpose:** investigation
**Datasets:** `koi_koi_raw` (Audit only)
**Question:** What AI tooling is being installed, updated and removed across the estate?
**Provenance:** `Not validated by originating agent` — **needs re-run.**
**Parameters:** none; extend the `agentic_class` classifier as needed.

```
// Theme B / B11 - KOI's agentic supply-chain churn: what AI tooling is being installed,
// updated and removed across the estate, from the Audit stream.
// Audit is NOT duplicated (1.0 ratio) - one row per real change, so count() is safe here.
// This is the KOI-only baseline that B8 and B9 are measured against.
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| alter nm = lowercase(coalesce(object_name, ""))
| alter agentic_class = if(
      nm contains "mcp" or nm contains "modelcontextprotocol",             "mcp_server",
      nm contains "claude" or nm contains "anthropic",                     "claude_tooling",
      nm contains "copilot",                                              "copilot_tooling",
      nm contains "cursor" or nm contains "windsurf" or nm contains "antigravity", "agentic_ide",
      nm contains "openai" or nm contains "chatgpt" or nm contains "codex", "openai_tooling",
      nm contains "ollama" or nm contains "llama" or nm contains "llm",     "local_model_runtime",
      nm contains "langchain" or nm contains "langgraph" or nm contains "llamaindex"
        or nm contains "crewai" or nm contains "autogen",                   "agent_framework",
      nm contains "agent" or nm contains "subagent",                        "agent_named_item",
      null)
| filter agentic_class != null
// marketplace is null for Claude Code skills/plugins on this tenant - keep them, label them.
| alter source = coalesce(marketplace, "local_agent_config")
| comp count() as events,
       count_distinct(hostname) as devices,
       count_distinct(item_version) as versions,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agentic_class, source, object_name, action
| sort desc devices, desc events
```

**Interpretation.** The KOI-only baseline that B8 and B9 are measured against, and the answer to "what
agentic software does the org own" independent of whether any of it ran. `count()` is safe here because
Audit is not duplicated. Known KOI-side agentic inventory includes `@playwright/mcp` (18 `installed`
events, marketplace `npm`), `@idletoaster/ssh-mcp-server`, `chrome-devtools-mcp` and
`localhost/cortex-mcp` (docker).

**False positives.** `nm contains "agent"` is very broad — "user-agent", "agent-development",
"AgentRansack" all match. The `agent_named_item` class is a catch-all and should be read as a hunting
bucket, not a finding. Ordering matters in the `if` chain: an item named both `mcp` and `claude`
classifies as `mcp_server`.

---

# Appendix A — Structurally valid but quiet on this tenant

Nobody should think these are broken.

| Query | What is quiet, and why |
|---|---|
| **A1, A2, A6** | `yarn`, `pnpm`, `choco`, `winget`, `brew`, `go`, `cargo`, `gem` match nothing in 7d — those package managers are simply not installed here. `pip`, `uv`, `npm`/`npx`, `git`, `curl`, `Invoke-WebRequest` and `msiexec` are present and produce all the rows. The absent tools are kept so the queries travel. |
| **B0, B2, B3** | `cursor`, `windsurf`, `codex`, `aider` and `gemini-cli` match nothing — not deployed here. **B2 returns zero over 24h and 8 rows over 7d**: MCP spawns are bursty and the last burst was ~4 days old. Zero on 24h means "no agent session ran today". |
| **B1, B4** | `ollama app.exe` is invisible to PROCESS-name probes because it is a long-running service whose start fell outside the window. It shows up in B4 (NETWORK) and B6 (FILE). Any PROCESS-name-only agent inventory under-reports resident runtimes. |
| **A5, A6, A3, C6** | The **dual-covered host population on this tenant is exactly one: `win-workstation`.** All other KOI hosts belong to different orgs on a shared Koi SaaS tenant and have no Cortex agent; all other XDR hosts have no KOI. Coverage-gap results are therefore near-empty *or*, if you do not filter to dual-covered hosts, catastrophically over-reported. This is a tenant artefact, not a product finding. |
| **A7, C3, C5** | Only `win-workstation` runs the KOI agent, so scan-freshness returns exactly one host. Three of four XDR hosts have never run a KOI scan — again dominated by tenant-sharing. |
| **KOI Alerts, host attribution** | `hostname` is NULL on **every** Alerts row (797/7d). Any host-scoped query against Alerts returns nothing. Use `resources[type=device].data.hostname`, or restrict host-scoped work to Audit. |
| **`C:\ProgramData\Koi\` in FILE telemetry** | Returns 0 rows over 24h. Confirmed true negative — the same regex style returns thousands of rows against `AppData\Local\Koi`. There is no second KOI freshness signal in FILE. |

---

# Appendix B — Pending validation

These are the highest-concept queries in the set and the ones most worth running first after quota
reset. **None has ever been executed successfully in the form printed here.** They are separated from
the main library rather than dropped, because the ideas are sound and the defects are identified.

## B8 — KOI risk ∩ XDR execution *(corrected — needs re-run)*

**Purpose:** detection. **Datasets:** `xdr_data` (PROCESS) + `koi_koi_raw` (Alerts).
**Why it matters most:** KOI alone says *you own something dangerous*. XDR alone says *something ran*.
Only the intersection says *the dangerous thing is live on this host, right now*.

**What was wrong:** (1) `koi.koi_risk` and five other alias-prefixed references in `alter`/`fields` —
fails with `unknown field`, asynchronously. (2) `to_json_string(resources)` double-encodes an
already-JSON-string column, silently nulling every extraction. (3) JSONPath written `$.0.type`;
Theme D proved `$[0].type` is the accepted form. All three corrected below.
**Alerts dedupe: present and correct** — `dedup koi_event_id` on
`json_extract_scalar(metadata, "$.notification_event_id")` before any aggregation.

```
// Theme B / B8 - RISK THAT IS NOT THEORETICAL.
// A KOI-scored MCP server or agentic package that is ALSO observed EXECUTING in XDR endpoint
// telemetry. KOI alone says "you own something dangerous". XDR alone says "something ran".
// Only the intersection says "the dangerous thing is live on this host, right now".
// Detection - the highest-value query in the Theme B set.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, ""))
| filter proc in ("node", "node.exe", "npx", "npx.cmd", "env", "python", "python.exe",
                  "python3", "python3.12", "python3.13", "uv", "uvx", "uv.exe", "uvx.exe",
                  "bun", "deno", "docker", "podman")
| filter cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd ~= "mcp-server" or cmd contains "modelcontextprotocol"
| alter mcp_entrypoint = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
// Normalise the executed entrypoint to the bare package name KOI would inventory:
//   "@playwright/mcp@latest"                     -> "@playwright/mcp"   (stop at the @version)
//   ".../node_modules/.bin/playwright-mcp"       -> "playwright-mcp"    (last path segment)
//   "start-mcp-server"                           -> "start-mcp-server"
| alter exec_pkg = if(mcp_entrypoint contains "/node_modules/" or mcp_entrypoint contains "/bin/",
        arrayindex(regextract(mcp_entrypoint, "([^/]+)$"), 0),
        arrayindex(regextract(mcp_entrypoint, "^(@?[a-z0-9._\-]+/?[a-z0-9._\-]*)"), 0))
| comp count() as spawns, min(_time) as first_exec, max(_time) as last_exec
   by agent_hostname, causality_actor_process_image_name, exec_pkg
// KOI's verdict for the same package. Alerts carry the scored inventory in resources[0],
// as either an `mcp` resource (MCP servers) or an `item` resource (everything else);
// both expose data.package_name and data.risk_level, so handle them together.
| join type = inner (
      dataset = koi_koi_raw
      | filter source_log_type = "Alerts"
      | alter res = resources
      | alter r0type = json_extract_scalar(res, "$[0].type")
      | filter r0type = "mcp" or r0type = "item"
      // MANDATORY: the integration re-sends every open alert each 1-minute fetch cycle
      // (~245x duplication). Dedupe on the notification event id, never on _id.
      | alter koi_event_id = json_extract_scalar(metadata, "$.notification_event_id")
      | dedup koi_event_id
      | alter
          koi_pkg       = lowercase(json_extract_scalar(res, "$[0].data.package_name")),
          koi_risk      = json_extract_scalar(res, "$[0].data.risk_level"),
          koi_market    = json_extract_scalar(res, "$[0].data.marketplace"),
          koi_transport = json_extract_scalar(res, "$[0].data.transport"),
          koi_res_type  = r0type,
          koi_device    = json_extract_scalar(res, "$[1].data.hostname")
      | comp count_distinct(koi_device) as koi_devices, max(_time) as koi_last_alert
         by koi_pkg, koi_risk, koi_market, koi_transport, koi_res_type
  ) as koi koi.koi_pkg = exec_pkg
| alter verdict = if(
      koi_risk = "critical" or koi_risk = "high", "CONFIRMED_RISK_EXECUTING",
      koi_risk = "medium",                        "MEDIUM_RISK_EXECUTING",
      koi_risk = "pending",                       "UNSCORED_BUT_EXECUTING",
                                                  "SCORED_LOW_EXECUTING")
| fields agent_hostname, causality_actor_process_image_name, exec_pkg, verdict,
         koi_risk, koi_res_type, koi_transport, koi_market,
         koi_devices, koi_last_alert, spawns, first_exec, last_exec
| sort desc spawns
```

**Expected shape.** `@playwright/mcp` is known to appear on *both* sides — 18 `installed` events in
KOI's Audit stream and 256 observed executions in XDR — so an equivalent match should resolve if the
Alerts-side extraction works. KOI's `mcp` resources also inventory
`https://agent.robinhood.com/mcp/trading` (remote, http transport, `risk_level` `pending`) on
"Greg's Mac mini" and `mcp-server` (local, stdio, homebrew) on M-DQ3HT4R1P7 — but neither host has a
Cortex agent, so those will not join. **Run over 7d.**

**Known risk if it still returns nothing:** the `inner` join requires `exec_pkg` to equal
`koi_pkg` exactly. KOI's `package_name` for `@playwright/mcp@latest` may or may not carry the
`@latest` suffix or the scope. Probe both sides' distinct values before concluding the query is wrong.

## B9 — Shadow MCP: executing on an endpoint, not in KOI *(corrected — needs re-run)*

**Purpose:** detection. **Datasets:** `xdr_data` (PROCESS) + `koi_koi_raw` (Audit).
**What was wrong:** the same alias-prefix defect (`koi.koi_pkg`, `koi.koi_audit_events`,
`koi.koi_last_seen`) in `alter` and `fields`. Corrected. No Alerts involvement, so no dedupe needed.

```
// Theme B / B9 - Shadow MCP: an MCP server EXECUTING on an endpoint that KOI has not
// inventoried. KOI is run-on-demand on Windows - no resident agent - so a server installed
// and used between two scans is invisible on the supply-chain side while fully visible in
// endpoint telemetry. This is the coverage-gap detection neither dataset can produce alone.
// Detection.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, ""))
| filter proc in ("node", "node.exe", "npx", "npx.cmd", "env", "python", "python.exe",
                  "python3", "python3.12", "python3.13", "uv", "uvx", "uv.exe", "uvx.exe",
                  "bun", "deno", "docker", "podman")
| filter cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd ~= "mcp-server" or cmd contains "modelcontextprotocol"
| alter mcp_entrypoint = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
| alter exec_pkg = if(mcp_entrypoint contains "/node_modules/" or mcp_entrypoint contains "/bin/",
        arrayindex(regextract(mcp_entrypoint, "([^/]+)$"), 0),
        arrayindex(regextract(mcp_entrypoint, "^(@?[a-z0-9._\-]+/?[a-z0-9._\-]*)"), 0))
| comp count() as spawns, min(_time) as first_exec, max(_time) as last_exec
   by agent_hostname, causality_actor_process_image_name, exec_pkg
// LEFT join against everything KOI knows about, from BOTH streams:
// Audit object_name (the reliable, non-duplicated install/update record) and the scored
// Alerts inventory. A null right side means KOI has never seen this package at all.
| join type = left (
      dataset = koi_koi_raw
      | filter source_log_type = "Audit" and object_type = "item"
      | alter koi_pkg = lowercase(object_name)
      | comp count() as koi_audit_events, max(_time) as koi_last_seen by koi_pkg
  ) as koi koi.koi_pkg = exec_pkg
| alter koi_coverage = if(koi_pkg = null, "SHADOW_MCP_NOT_IN_KOI", "KNOWN_TO_KOI")
| fields agent_hostname, causality_actor_process_image_name, exec_pkg, koi_coverage,
         koi_audit_events, koi_last_seen, spawns, first_exec, last_exec
| sort asc koi_coverage, desc spawns
```

**Caveat.** The comment claims a join against *both* KOI streams; the query only joins Audit. That is
the safer choice (Audit needs no dedupe) but the comment overstates it. **Also: this joins on
package name with no host predicate**, so an MCP server inventoried by KOI on a *different org's*
host will read as `KNOWN_TO_KOI` here. On a shared SaaS tenant that materially understates the shadow
set. Add `and koi.koi_host = agent_hostname` if you want per-host truth. **Run over 7d.**

## B7 — KOI's MCP server inventory from Alerts *(corrected — needs re-run)*

**Purpose:** investigation. **Datasets:** `koi_koi_raw` (Alerts).
**Alerts dedupe: present and correct.** Same `to_json_string` / JSONPath corrections as B8. Theme B
claimed this validated; Theme D's independently tested JSONPath rules say the original form should
not have worked. **Run both forms and settle it.**

```
// Theme B / B7 - KOI's MCP server inventory, deduplicated, with its risk verdict.
// KOI does not ship MCP servers as their own event type. They arrive as an `mcp` RESOURCE
// inside an OCSF-ish alert: resources[0] is the MCP server, resources[1] is the device.
// CRITICAL: the integration re-sends every still-open alert on each 1-minute fetch cycle
// (~245x duplication over 24h). Dedupe on metadata.notification_event_id - never count()
// rows, never dedupe on _id. finding_info.uid is the POLICY id, not an alert id.
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter res = resources
| filter json_extract_scalar(res, "$[0].type") = "mcp"
| alter evid = json_extract_scalar(metadata, "$.notification_event_id")
| dedup evid
| fields evid, message, risk_level, severity, res
| limit 200
```

## C6 — Cortex-managed host population *(reconstructed — needs re-run)*

**Purpose:** investigation. **Datasets:** `xdr_data`.
The denominator for any coverage-gap calculation. Diff against A7/C3 (hosts running KOI scans) to get
the supply-chain blind spot. The originating agent's exact text was not persisted; this is a minimal
rebuild from its description.

```
// Theme C / C6 - Cortex-managed host population from telemetry.
// RECONSTRUCTED - the originating agent's exact text was not persisted. NOT re-validated.
// PARAM: timeframe defines what "recent" means
dataset = xdr_data
| comp count() as n, min(_time) as first_seen, max(_time) as last_seen by agent_hostname
| sort desc n
| limit 100
```

**Note.** `dataset = endpoints` is usable on this tenant but flaky: `comp count()` returns in seconds,
but any `comp ... by <field>` or `| fields <list>` against it timed out repeatedly at 240s+. Derive the
host population from `xdr_data` telemetry, as above, rather than from `endpoints`.

---

# Appendix C — Needs a field or behaviour we could not confirm

| Item | Status |
|---|---|
| `current_time()` | Used in **A7**. Theme A reports it working; Theme C could not validate it before quota exhaustion. Confirm on re-run — if it is rejected, drop `minutes_since_last_scan` and `inventory_confidence` and let the playbook compute the age from `last_scan`. |
| `to_json_string()` on `resources` | Whether `resources` needs wrapping is contested between Theme B (wrapped, claims validated) and the field brief + Theme D (already a JSON string, use directly). Corrected to *unwrapped* here. **Settle by running B7 both ways.** |
| JSONPath `$.0.x` vs `$[0].x` | Theme D proved `$[0].data.hostname` works and `$.[0]` is rejected. `$.0.x` was never tested against `$[0].x` on the same data. Normalised to `$[0]`. |
| Backslash form in path regexes | **A4** still uses `"(?i)(\\Downloads\\|...)"`. Per syntax fact #1 this reaches the regex engine as `\D`, `\o`, … which are valid-but-wrong regex escapes. A7 and C3 use the proven `.`-wildcard form. **Verify A4's match set on the re-run and convert if wrong.** |
| Operator precedence in **B10** | The final clause `cmd contains "curl -" and cmd contains "| sh"` sits inside a chain of `or`s with no parentheses. Confirm it binds as intended. |
| `koi_pkg` ↔ `exec_pkg` normalisation | **B8/B9** assume KOI's `package_name` for an npm-scoped MCP server matches the executed entrypoint after stripping `@version`. Never verified against real KOI Alerts values. Probe both distinct-value sets before trusting a zero result. |
| `action_external_hostname`, `dns_query_name` | `action_external_hostname` is ~56% populated; `dns_query_name` is **0% populated** (0 of 15,616 agent-owned NETWORK rows). DNS-name pivots are unavailable on this tenant — do not build a detection that requires them. |
| `action_file_last_writer_actor` | Populated, but it is an **opaque base64 causality ID** (`9aTCTSsY3QFkBwAAAAAAAA==`), not a readable process name. Do not present it to an analyst as an actor name. Not used in any query here. |
| Theme C C7–C13, Theme D D4–D12 | Exact XQL not persisted and not recoverable from the session transcript. **Excluded entirely.** This loses D7, the worked Alerts-dedupe query (734 raw rows → 3 real alerts), and Theme C's set-difference coverage pairs. If they are recovered, re-audit every one against the Alerts dedupe rule in §3 before use. |

---

*Query files and the validation runner live in `docs/xql/`. Filenames match the query ids above.*
