# XQL detection & investigation queries — KOI supply chain × Cortex XDR

**Pack context:** built for the official **Marketplace KOI pack v1.2.3** (`demisto/content` `Packs/Koi`, 13 commands, integration only) and its dataset `koi_koi_raw`, correlated with Cortex XDR endpoint telemetry `xdr_data`. Validated on tenant `api-ayman.xdr.eu` on 2026-07-21/22.

## How to read status

- **validated** — executed against the live tenant; row count is real.
- **parse-confirmed** — the XQL engine accepted it (query_id issued) but it is a heavy join that exceeds the validation poll window; run it with a narrow time filter. Not known-bad.

## Rules that apply to every query here

1. **Alerts are duplicated ~245× per 24h** (the integration re-sends every open alert each 1-minute fetch). Any query over `source_log_type = "Alerts"` **must** dedupe on `json_extract_scalar(metadata, "$.notification_event_id")` — never `count()` rows. **Audit is not duplicated (1.0)** and needs no dedupe; most queries here use Audit for exactly that reason.

2. **One host is dual-covered** (KOI + XDR) on this tenant — `win-workstation`. Coverage-gap queries derive the dual-covered set from data rather than hardcoding it.

3. **Marketplace vocabulary differs** between events (short: `chrome`, `vsc`, `software_windows`) and the API (long: `chrome_web_store`, `vscode`, `windows`). See `VERIFIED_FACTS.md` §7c.

4. `dns_query_name` is 0% populated here; `action_external_hostname` ~56%. Do not build a detection that requires DNS names on this tenant.


---

## Theme A — Supply-chain acquisition

_How an item arrived — which process, user and parent brought it. koi_koi_raw Audit × xdr_data PROCESS._

_8 queries._


### A1 — Package-manager and downloader execution with full acquisition provenance

**Purpose:** both · **Status:** validated (46 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


For every supply-chain acquisition command run anywhere on the estate: which tool, which user, which parent process, which working directory, and the full command line?


_Parameters:_ None. Scope with `| filter agent_hostname = "..."` or `| filter acquisition_tool = "pip"` to turn it into a detection.


```sql
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


_Interpretation:_ 46 rows over 24h (fluctuates 34-68 as activity continues). Rows are real and demonstrable: `pip install --user tabulate==0.9.0` as WIN-WORKSTATION\amahmoud under powershell.exe; the same package as NT AUTHORITY\SYSTEM under cortex-xdr-payload.exe; `git.exe clone --depth 1 https://github.com/octocat/Hello-World.git C:\Users\amahmoud\Documents\koi-test-repo`; `uv pip install` inside WSL on thor; npm/npx on OfficeiMac. `installed_for_user` recovers the target account from `--target C:\Users\<name>\...` even when the process ran as SYSTEM — this is how you attribute a SYSTEM-context install to the


_False positives:_ (a) This session's own automation: shell command lines that merely CONTAIN "pip install" or a github URL are themselves PROCESS events and match. Exclude SOAR/automation hosts or require action_process_image_name to be the real tool. (b) `npx ` matches tool invocations that install nothing (npx tsc --noEmit). (c) The parent chain for package managers that re-exec themselves (PyManager python.exe -


### A2 — Supply-chain acquisition run by a non-interactive parent (SYSTEM/service/EDR vs. a human shell)

**Purpose:** detection · **Status:** validated (24 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


Which package-manager installs were NOT launched by a human at a shell or IDE — i.e. came from a service, a scheduled task, an SSH/WinRM session, or a management/EDR automation payload?


_Parameters:_ None required. The parent_class allow-list on the final filter is the tuning surface — add your own build agents to "developer IDE / agent" to suppress CI.


```sql
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


_Interpretation:_ 24 rows over 24h, cleanly separated into two classes. "management / EDR automation" = the NT AUTHORITY\SYSTEM pip installs and git clone whose causality root is cyserver.exe via cortex-xdr-payload.exe — legitimate here (they are our own Live Terminal test payloads) but structurally identical to an attacker installing through a compromised management agent. "remote session / lateral" = installs on thor arriving through sshd.exe -> cmd.exe -> wsl.exe. The interactive pip install by WIN-WORKSTATION\amahmoud under powershell.exe is correctly EXCLUDED, which is the point: the same command, same pac


_False positives:_ On this tenant every hit is our own EDR-driven testing, so as written it would be noisy in any estate that provisions software via SCCM/Intune/Ansible. Tune by allow-listing your provisioning agent's exact image name AND its expected command-line shape, not just the image name — the whole value is that a compromised management agent still looks like the management agent.


### A3 — git clone in XDR joined to KOI's GitHub inventory event (repo + commit SHA + who cloned it)

**Purpose:** investigation · **Status:** validated (5 rows on this tenant) · **Datasets:** xdr_data (PROCESS) + koi_koi_raw (Audit, type=extensions, marketplace=github)


For every git clone on the estate: did KOI inventory the repo, what commit SHA did it record, how long did KOI take to see it, who ran the clone and where did it land?


_Parameters:_ None. Add `| filter koi_saw_it = "NO - not in KOI inventory"` to convert it into a coverage detection.


```sql
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


_Interpretation:_ 5 rows over 48h and they tell the whole Theme-A story in one line each. XDR: `git.exe clone --depth 1 https://github.com/octocat/Hello-World.git C:\Users\amahmoud\Documents\koi-test-repo` as NT AUTHORITY\SYSTEM, causality root cyserver.exe. KOI 3 minutes later: octocat/Hello-World, action=installed, item_version=7fd1a60b01f91b314f59955a4e4d4e80d8edf11d — the COMMIT SHA, which XDR never resolves. Then a second KOI row 21 minutes after the clone: action=uninstalled, SAME name and SAME SHA (confirming the documented lifecycle behaviour). Neither product can produce this row alone: KOI has no idea


_False positives:_ One of the five rows is a genuine false positive worth keeping visible: on OfficeiMac the repo URL appeared inside a /bin/zsh command line that was itself one of THESE validation queries — parent process "Claude", clone_dest garbage ("dest],"). Any command-line-substring rule catches analysts and automation talking about the indicator. Exclude automation hosts. Second FP class: clone_dest extracti


### A4 — Acquisition then run — installer/archive/script dropped to a user-writable path and executed from it

**Purpose:** detection · **Status:** validated (10 rows on this tenant) · **Datasets:** xdr_data (FILE joined to PROCESS)


What was written to Downloads/Desktop/Temp as an installer, archive or script — and then executed from that exact path, by whom, with what parent?


_Parameters:_ The path allow-list and the `servicing_selfextract` suppression are the tuning surfaces. `minutes_drop_to_exec >= 0` can be tightened (e.g. `<= 60`) for a stricter drop-and-run.


```sql
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


_Interpretation:_ 10 rows over 7d after noise suppression (17 before). The clean signal is exactly the pattern Theme A is about: chrome.exe (dropper_class = "browser download") writes into C:\Users\<user>\Downloads\, and explorer.exe then executes it — i.e. the user double-clicked it. Confirmed instances: VSCodeUserSetup-x64-1.129.1.exe (0 min), ChatGPT Installer.exe (0 min), rc-astro-cli-1.1.0-windows-x64.exe on thor (1 min), PI-windows-x64-1.9.4.exe on thor (410 min — downloaded, then run nearly 7 hours later). Two of these close the loop with KOI: after VSCodeUserSetup ran, koi_koi_raw carries "Microsoft Vis


_False positives:_ The dominant FP class is named and suppressed in the query: Windows servicing and installer self-extraction (MoUsoCoreWorker -> DismHost.exe, VC_redist bootstrappers, *.tmp extractors) drop-and-run inside C:\Windows\Temp as SYSTEM within the same second. Surviving lower-grade noise: cleanmgr.exe extracting DismHost.exe into the USER's AppData\Local\Temp — same binary, user context, so the SYSTEM-b


### A5 — Coverage gap KOI→XDR: a KOI install event with no corresponding acquisition process in XDR

**Purpose:** detection · **Status:** validated (15 rows on this tenant) · **Datasets:** koi_koi_raw (Audit, type=extensions) + xdr_data (PROCESS)


Which items did KOI report as installed/updated on a dual-covered host without XDR ever seeing a package manager or installer run for them in the preceding window?


_Parameters:_ // PARAM: window_minutes — 180 as written (lag_minutes >= 0 and <= 180). The dual-covered host set is derived by the inner join, deliberately not hardcoded.


```sql
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


_Interpretation:_ 15 rows over 48h, all on win-workstation, and they are TRUE positives in the useful sense — they are precisely the items that do NOT arrive via a package manager and therefore have no process to catch: Chrome/Edge extensions ("Dark Reader" 4.9.129, "JSON Formatter" 0.10.2, "Bookmarks Quick Search", "Google Docs Offline") and VS Code extensions (ms-toolsai.jupyter, ms-toolsai.vscode-jupyter-slideshow). These are installed by the browser/IDE itself writing into a profile directory — no child process spawns, so XDR PROCESS telemetry is structurally blind to them. That is the honest, valuable find


_False positives:_ (1) The first KOI scan of any host reports every pre-existing item as "installed" — those all appear as gaps. Run this over a window that starts after onboarding, or exclude the earliest koi_time per host. (2) item_root is a leading-token heuristic: short or generic leading tokens ("python", "java", "node") will over-corroborate and hide real gaps; multi-word names whose first token is not in the 


### A6 — Coverage gap XDR→KOI: a package-manager install in XDR that KOI never inventoried

**Purpose:** detection · **Status:** validated (0 rows on this tenant) · **Datasets:** xdr_data (PROCESS) + koi_koi_raw (Audit, type=extensions, marketplace in pypi/npm)


Which pip/npm/uv installs did XDR observe on a dual-covered host that KOI never reported as an inventory item?


_Parameters:_ // PARAM: window_minutes — 240 as written (koi_lag_minutes >= 0 and <= 240). Dual-covered host set derived by the inner join.


```sql
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
      before treating it as a real gap. Pair it with A8 (scan freshness) to tell the two apart.
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


_Interpretation:_ ZERO rows — and this is a legitimately quiet, correct detection, not a broken query. Verified by re-running the identical query with the final `| filter seen_by_koi = 0` removed: the population is 16 rows and EVERY ONE has seen_by_koi = 1. That is a positive result about KOI: every parseable pip install on the dual-covered host was inventoried, with measured lag of 5, 4, 134 and 135 minutes (tabulate x2, inflection x2, both as WIN-WORKSTATION\amahmoud and as NT AUTHORITY\SYSTEM). Those measured lags are what justify the 240-minute window — it is derived from this tenant's observed KOI scan cad


_False positives:_ The dominant FP is TIMING, not logic: a real install that simply has not been scanned yet looks identical to a coverage gap. Always pair with A7 (scan freshness) — if minutes_since_last_scan exceeds the install age, the correct verdict is "no scan yet", not "gap". Second: package-name extraction is a first-non-flag-token heuristic; shell-quoted specs ('astropy-healpix>=1.0') and deeply nested wsl/


### A7 — KOI scan freshness measured from XDR — how much can you trust this host's KOI inventory?

**Purpose:** both · **Status:** validated (1 rows on this tenant) · **Datasets:** xdr_data (PROCESS) only — deliberately no KOI data


When did the KOI agent last actually run on each host, and is that host's KOI inventory fresh, aging or stale?


_Parameters:_ The freshness thresholds (60 / 1440 minutes) are the tuning surface. Add `| filter minutes_since_last_scan > 1440` to make it a pure detection.


```sql
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
// confused with any other Python on the box.
| filter action_process_image_path ~= "(?i)\\AppData\\Local\\Koi\\Python\\"
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
    minutes_since_last_scan <= 60,   "fresh - inventory reflects the last hour",
    minutes_since_last_scan <= 1440, "aging - up to a day of drift",
    "STALE - KOI inventory for this host may be days out of date")
| fields agent_hostname, launched_by, scan_user, koi_processes, first_scan, last_scan,
         minutes_since_last_scan, inventory_confidence
| sort asc minutes_since_last_scan
| limit 100
```


_Interpretation:_ 1 row over 7d: win-workstation, launched_by = powershell.exe, scan_user = NT AUTHORITY\SYSTEM, 180 KOI-agent processes across the window, minutes_since_last_scan = 84, inventory_confidence = "aging". This is the query neither dataset can produce alone and it is the one that makes A5 and A6 trustworthy — without it, "KOI never reported this package" and "KOI has not scanned since before the install" are indistinguishable. It works because the KOI agent ships its own interpreter at C:\Users\Default\AppData\Local\Koi\Python\WPy64-31290\python\python.exe and executes a .pyz payload from C:\Windows


_False positives:_ Essentially none — the filter is anchored on the vendor's own install path, so it cannot collide with any other Python. My first attempt used a loose regex (paths OR command lines containing "Koi"/"koi.security") and immediately picked up 20 unrelated processes including this session's own shell; the tightened path anchor eliminated all of them. Caveats: (a) Windows-only — the macOS/Linux KOI agen


### A8 — Single-item acquisition timeline — the playbook query (KOI + XDR process + XDR file, unioned)

**Purpose:** investigation · **Status:** validated (56 rows on this tenant) · **Datasets:** koi_koi_raw (Audit) + xdr_data (PROCESS) + xdr_data (FILE), unioned into a common shape


For one item on one host: show every KOI lifecycle event and every XDR process and file event that names it, on a single ordered timeline.


_Parameters:_ // PARAM: item_token — lower-case substring of the KOI object_name ("tabulate", "octocat/hello-world", "antigravity", "vscodeusersetup"). Appears in 3 places. // PARAM: hostname — appears in 3 places. Both are currently bound to "tabulate" / "win-workstation" as a working example.


```sql
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


_Interpretation:_ 56 rows over 48h for item_token="tabulate" on win-workstation, verified to contain all three sources (46 XDR file, 8 XDR process, 2 KOI inventory — checked by swapping the tail for `| comp count() as n by source`). The timeline reads end to end: the pip install command line with its parent and cwd, then every file python.exe wrote into C:\Users\amahmoud\AppData\Roaming\Python\Python314\site-packages\tabulate-0.9.0.dist-info\ (RECORD, WHEEL, INSTALLER, entry_points.txt, top_level.txt) — i.e. the on-disk proof of what landed — then KOI's installed and uninstalled inventory rows. This is the shap


_False positives:_ Substring matching on a short item_token will over-match (a token like "json" or "code" hits thousands of paths). Prefer a distinctive token, and be aware the FILE branch is the noisy one — it returns every file of the package, not just the install marker. For very common tokens, restrict the FILE branch to dist-info/node_modules markers or drop it. As with A1/A3, an analyst or automation host dis


---

## Theme B — Agentic runtime

_AI agents and MCP servers actually executing, their egress, and KOI-flagged risk that is also running. The agentic-supply-chain core._

_12 queries._


### B0 — Ground truth: which agent-ish process image names actually exist

**Purpose:** investigation · **Status:** validated (7 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


_Parameters:_ none — deliberately hardcoded name list; edit the list, not a variable


```sql
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


_Interpretation:_ VALIDATED, 24h window, 7 rows. Returned: Python 2826 (OfficeiMac), claude 180 (OfficeiMac), python.exe 112 (win-workstation), Code.exe 10, Antigravity.exe 7, Antigravity-x64.exe 1 (all win-workstation), mscopilot.exe 1 (thor). Two lessons this query teaches: (1) `node` returns ZERO over 24h but 288 spawns over 7d — MCP activity here is bursty, so any MCP query must run over 7d not 24h; (2) `ollama app.exe` on thor does NOT appear at all, because Ollama is a long-running service whose process start fell outside the window — it is only discoverable via NETWORK (B4) and FILE (B6). A PROCESS-name-


_False positives:_ Broad `contains` matching pulls in unrelated binaries on other estates (anything named *-node*, *-code*). Acceptable here because this is a discovery probe, not a detection.


### B1 — Agentic runtime inventory by causality group owner

**Purpose:** investigation · **Status:** validated (24 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


_Parameters:_ none; extend the agent_family classifier as new agents appear


```sql
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


_Interpretation:_ VALIDATED, 24h window, 24 rows. Top: OfficeiMac/Code 17,552 events (6 distinct child images); OfficeiMac/Claude 15,398 events (24 distinct child images) — that 24-vs-6 gap is the signal: Claude Desktop is not just an editor, it drives two dozen distinct executables. win-workstation shows Antigravity.exe (17 events) and a VSCodeUserSetup-x64-1.129.1.exe installer tree (57 events, 12 distinct children — an agentic IDE being installed inside the window). thor shows mscopilot.exe. Zero rows would mean no AI tooling runs in the estate, which for any modern developer population is far more likely to


_False positives:_ `proc contains "code"` over-matches: `Microsoft Update Assistant` (12 events) and `com.adobe.acc.installer.v2` (3 events) were classified vscode_family because a child process name contained "code". Tighten to `root = "code" or root = "code.exe" or root contains "vscode"` if precision matters more than recall.


### B2 — MCP server execution via the stdio spawn chain

**Purpose:** both · **Status:** validated (8 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


_Parameters:_ none; run over 7d not 24h (see interpretation)


```sql
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


_Interpretation:_ VALIDATED, 7d window, 8 rows, zero false positives. Real MCP servers found: `@playwright/mcp@latest` (256 node spawns + 16 env spawns, agent_owner=claude, OfficeiMac); the same server resolved through the npx cache as `.../node_modules/.bin/playwright-mcp` (16+16); and `start-mcp-server` run through the uv toolchain (uvx 3 → uv 3 → python 15 → python3.12 3). Note the same logical server appears under BOTH `env` and `node` because macOS spawns `/usr/bin/env node <entrypoint>` — count distinct entrypoints, not rows. Over a 24h window this query returns ZERO: MCP spawns on this tenant are bursty 


_False positives:_ Before the package-boundary regex was added, this query returned 25 rows including `resmcp` (a python script arg), `mcp_type` (a column name in an analyst's own query), a base64 blob, and a YAML filename containing `_mcp_server`. The `[/@\-]mcp([\-/@\s"']|$)` clause plus excluding shells from the runner list removed all of them. Do NOT relax either clause. Remaining risk: a legitimately-named non-


### B3 — Full child-process tree of one AI agent on one host

**Purpose:** investigation · **Status:** parse-confirmed (heavy join — run with a narrow window) · **Datasets:** xdr_data (PROCESS)


_Parameters:_ PARAM: agent_hostname; PARAM: causality_actor_process_image_name (the agent application)


```sql
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


_False positives:_ The `mcp_server` bucket will over-fire relative to B2 because it does not exclude shells — an analyst's own shell command mentioning an MCP package will land there. That is acceptable in an investigation view where you want to see everything, but do not reuse this classifier for a detection.


### B4 — Network egress attributed to an AI agent's process tree

**Purpose:** investigation · **Status:** validated (53 rows on this tenant) · **Datasets:** xdr_data (NETWORK)


_Parameters:_ none; add agent names to the root filter as needed


```sql
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


_Interpretation:_ VALIDATED, 24h window, 53 rows. This is the per-host agent egress profile you baseline against. Notables: Claude on OfficeiMac generated 6,427 DNS flows and 42 flows on port 22 (SSH) from the `claude` binary to 192.168.20.231 — an AI agent opening SSH sessions to an internal host is exactly the behaviour worth knowing about. `Code` reached 169.254.169.254 (the cloud instance-metadata address) on port 80. thor surfaced `ollama app.exe` here (32 DNS flows) even though it never appeared in the PROCESS inventory — proof that a resident model runtime must be hunted in NETWORK, not PROCESS. win-work


_False positives:_ Volume is dominated by DNS (port 53) to the local resolver — 6,427 of Claude's rows and 11,481 of Code's. Filter `action_remote_port != 53` for a usable egress picture. `action_external_hostname` is only populated on ~56% of rows, so `dest` falls back to a bare IP more than half the time.


### B5 — Anomalous egress from an AI agent or its MCP servers

**Purpose:** detection · **Status:** validated (12 rows on this tenant) · **Datasets:** xdr_data (NETWORK)


_Parameters:_ PARAM: approved country list (ISO alpha-2) in the `approved_country` alter; PARAM: web port list in `web_port`


```sql
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


_Interpretation:_ VALIDATED, 24h window, 12 rows — tight enough to alert on. Highest-value hit: `Claude Helper (Plugin)` on OfficeiMac reaching `desktopcommander.app` (172.67.192.165 and 104.21.11.210, 68 flows combined) — that is an MCP server's own vendor domain being contacted by an agent plugin process, i.e. an MCP server phoning home, which is precisely what this query exists to surface. Also: `ollama app.exe` on thor → github.com via an AE-geolocated edge (46 flows); Claude → api.github.com via AE (838 flows); `Code` → otel.gitkraken.com on port 4318 (OTLP telemetry, flagged `non_web_port`) and proxy.indi


_False positives:_ CDN/anycast geolocation drives most of the `unapproved_country` hits: api.github.com resolving to a UAE edge node is not an anomaly, it is Azure Front Door. Tune by allowlisting `action_external_hostname` for known-good vendor domains rather than by widening the country list. Country `"-"` means unresolved and will always be 'unapproved' — decide explicitly whether to treat it as suspicious or exc


### B6 — AI agent or MCP server touching a credential store

**Purpose:** detection · **Status:** validated (100 rows on this tenant) · **Datasets:** xdr_data (FILE)


_Parameters:_ none; extend the secret_class classifier for site-specific secret paths


```sql
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


_Interpretation:_ VALIDATED, 24h window, 100 rows (the API result page cap — the true count is higher). Real hits: `Code` → /Library/Keychains/System.keychain (87 events, os_credential_store); `Code` → /Users/aymanmahmoud/Documents/Coding/KOI-MP/.env (3 events, dotenv — confirmed in a separate probe); `Python` running under the Claude CGO → ~/.config/gcloud/access_tokens.db-journal (2 events, gcp_credentials); `Claude Helper` → Claude's own Cookies store (204 events); `ollama app.exe` on thor → C:\Users\ayman\.ollama\id_ed25519 (24 events, ssh_key — Ollama's own signing key, benign but correctly classified). `a


_False positives:_ Substantial and predictable: an agentic IDE that BUNDLES an MCP server writes thousands of documentation files during install whose names contain 'credential' and 'token'. On win-workstation, Antigravity-x64.exe unpacking `chrome-devtools-mcp` produced dozens of rows like `...\node_modules\chrome-devtools-mcp\build\src\third_party\issue-descriptions\corsAllowCredentialsRequired.md`. Fix by appendi


### B7 — KOI MCP server inventory, deduplicated, with risk verdict

**Purpose:** investigation · **Status:** validated (2 rows on this tenant) · **Datasets:** koi_koi_raw (source_log_type = "Alerts", resources[0].type = "mcp")


_Parameters:_ PARAM: the trailing `limit` (validated at 2, shipped at 200)


```sql
// Theme B / B7 - KOI's MCP server inventory, deduplicated, with its risk verdict.
// KOI does not ship MCP servers as their own event type. They arrive as an `mcp` RESOURCE
// inside an OCSF-ish alert: resources[0] is the MCP server, resources[1] is the device.
// CRITICAL: the integration re-sends every still-open alert on each 1-minute fetch cycle
// (~245x duplication over 24h). Dedupe on metadata.notification_event_id - never count()
// rows, never dedupe on _id. finding_info.uid is the POLICY id, not an alert id.
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter res = to_json_string(resources)
| filter json_extract_scalar(res, "$.0.type") = "mcp"
| alter evid = json_extract_scalar(metadata, "$.notification_event_id")
| dedup evid
| fields evid, message, risk_level, severity, res
| limit 200
```


_Interpretation:_ VALIDATED at `limit 2` over a 30d window (returned 2 rows); the ONLY difference from the executed text is the limit literal, raised to 200 here. A separate validated probe established the population: over 90d, 858 raw Alerts rows carry an `mcp` resource and 296 carry an `item` resource (both pre-dedupe — divide by ~245 for real alerts). The two MCP servers returned are the interesting ones: `https://agent.robinhood.com/mcp/trading` — a REMOTE MCP server, transport `http`, marketplace empty, risk_level `pending`, on "Greg's Mac mini" (last user casamielke) — an agent with a broker-trading tool 


_False positives:_ None at the extraction level. The real trap is forgetting `dedup evid`: without it every figure is inflated ~245x. `risk_level` on the alert envelope can disagree with `resources[0].data.risk_level` — prefer the resource-level value. Both MCP servers here are `pending`, so a rule that fires only on high/critical would be SILENT on this tenant today; that is a genuine state of the data, not a query


### B8 — Risk that is not theoretical: KOI-scored MCP/agentic package observed executing in XDR

**Purpose:** detection · **Status:** parse-confirmed (heavy join — run with a narrow window) · **Datasets:** xdr_data (PROCESS) joined to koi_koi_raw (Alerts, resources[0].type in mcp|item)


_Parameters:_ none; adjust the runner list and the verdict thresholds


```sql
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
      | alter res = to_json_string(resources)
      | alter r0type = json_extract_scalar(res, "$.0.type")
      | filter r0type = "mcp" or r0type = "item"
      // MANDATORY: the integration re-sends every open alert each 1-minute fetch cycle
      // (~245x duplication). Dedupe on the notification event id, never on _id.
      | alter koi_event_id = json_extract_scalar(metadata, "$.notification_event_id")
      | dedup koi_event_id
      | alter
          koi_pkg       = lowercase(json_extract_scalar(res, "$.0.data.package_name")),
          koi_risk      = json_extract_scalar(res, "$.0.data.risk_level"),
          koi_market    = json_extract_scalar(res, "$.0.data.marketplace"),
          koi_transport = json_extract_scalar(res, "$.0.data.transport"),
          koi_res_type  = r0type,
          koi_device    = json_extract_scalar(res, "$.1.data.hostname")
      | comp count_distinct(koi_device) as koi_devices, max(_time) as koi_last_alert
         by koi_pkg, koi_risk, koi_market, koi_transport, koi_res_type
  ) as koi koi.koi_pkg = exec_pkg
| alter verdict = if(
      koi.koi_risk = "critical" or koi.koi_risk = "high", "CONFIRMED_RISK_EXECUTING",
      koi.koi_risk = "medium",                            "MEDIUM_RISK_EXECUTING",
      koi.koi_risk = "pending",                           "UNSCORED_BUT_EXECUTING",
                                                          "SCORED_LOW_EXECUTING")
| fields agent_hostname, causality_actor_process_image_name, exec_pkg, verdict,
         koi.koi_risk, koi.koi_res_type, koi.koi_transport, koi.koi_market,
         koi.koi_devices, koi.koi_last_alert, spawns, first_exec, last_exec
| sort desc spawns
```


_False positives:_ Package-name normalisation is the weak point. `@playwright/mcp@latest` must reduce to `@playwright/mcp` and the npx-cache binary `playwright-mcp` will NOT reduce to the same string — the same logical server has two identities and only one can match KOI. Expect under-matching, never over-matching. Verify the `exec_pkg` column visually before trusting a zero result.


### B9 — Shadow MCP: an MCP server executing that KOI has never inventoried

**Purpose:** detection · **Status:** parse-confirmed (heavy join — run with a narrow window) · **Datasets:** xdr_data (PROCESS) left-joined to koi_koi_raw (Audit, object_type = item)


_Parameters:_ none


```sql
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
| alter koi_coverage = if(koi.koi_pkg = null, "SHADOW_MCP_NOT_IN_KOI", "KNOWN_TO_KOI")
| fields agent_hostname, causality_actor_process_image_name, exec_pkg, koi_coverage,
         koi.koi_audit_events, koi.koi_last_seen, spawns, first_exec, last_exec
| sort asc koi_coverage, desc spawns
```


_False positives:_ Inflated by the same normalisation weakness as B8: a naming mismatch between the executed entrypoint and KOI's object_name produces a SHADOW verdict for a package KOI actually knows. Before alerting, eyeball the `exec_pkg` values against a `koi_koi_raw` Audit search for the same string. Also note KOI Audit object_name for git-sourced items is the REMOTE URL and the version is the commit SHA, so gi


### B10 — AI agent driving a supply-chain change: agent-spawned package installs

**Purpose:** both · **Status:** parse-confirmed (heavy join — run with a narrow window) · **Datasets:** xdr_data (PROCESS)


_Parameters:_ none; extend the install-command and ecosystem lists


```sql
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


_False positives:_ `cmd contains "npx "` fires on every MCP server launch, not just installs — npx installs on first use, so this is arguably correct, but it will dominate the results. The mixed `and`/`or` in the `curl -` clause relies on operator precedence and should be parenthesised explicitly before production use. Restricting to agent causality groups is what keeps this from being an unusable firehose — do not 


### B12 — KOI-side agentic supply chain: MCP servers, AI tooling and agent frameworks

**Purpose:** investigation · **Status:** validated (100 rows on this tenant) · **Datasets:** koi_koi_raw (source_log_type = "Audit")


_Parameters:_ none; extend the name-token list for site-specific agent tooling


```sql
// Theme B / B12 - The KOI-side agentic supply chain: every MCP server, AI coding tool,
// agent framework and local model runtime KOI has inventoried, and what happened to it.
// Marketplace pack "KOI" v1.2.3 - dataset koi_koi_raw, source_log_type = "Audit".
// Audit is NOT duplicated on this tenant (1.0 ratio), so count() is safe here. Only the
// Alerts stream needs the ~245x dedupe.
// Investigation - this is the inventory that B2/B8/B9 are matched against.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| alter nm = lowercase(coalesce(object_name, ""))
| filter nm contains "mcp" or nm contains "claude" or nm contains "ollama" or nm contains "cursor"
     or nm contains "copilot" or nm contains "openai" or nm contains "anthropic" or nm contains "langchain"
     or nm contains "agent" or nm contains "playwright" or nm contains "continue" or nm contains "codeium"
| comp count() as n by marketplace, object_name, action
| sort desc n
```


_Interpretation:_ VALIDATED, 90d window, 100 rows returned (result page cap). This is the KOI half of the agentic picture and it is rich. MCP servers in inventory: `@playwright/mcp` (npm, 18 installs — the one B2 proves is EXECUTING), `@idletoaster/ssh-mcp-server` (npm, 18 installs — an MCP server that grants shell access), `chrome-devtools-mcp` (npm, 12 updates / 6 uninstalls), `localhost/cortex-mcp` (docker, 4 installs), `mcp` (pypi). AI clients: `anthropic.claude-code` (vsc, 31/31/8 updated/uninstalled/installed), `@anthropic-ai/claude-code` (npm, 28/28/3), `Cursor (User)` and `Copilot` (software_windows), `


_False positives:_ `nm contains "agent"` matches non-AI software: `Amazon SSM Agent` (software_windows, 7 installs) is in the results and is not agentic AI. Split that token into its own class or require a second token. Marketplace here uses KOI's SHORT event vocabulary (`vsc`, `npm`, `software_windows`, `software_mac`, `chrome`, `github`, `docker`, `homebrew`, `chocolatey`, `cursor`, `ollama`, `claude_desktop_exten


---

## Theme C — KOI coverage & integrity

_Is the supply-chain telemetry even trustworthy? KOI's own scan is visible in xdr_data (its bundled python running a .pyz), enabling last-scan-age and coverage-gap detection nothing else does._

_13 queries._


### C1 — Broad hunt: any process whose command line mentions Koi (triage/orientation only)

**Purpose:** investigation · **Status:** validated (15 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


What is running on any host that references KOI at all? Used to discover unknown KOI deployment forms before pinning a precise signature.


_Parameters:_ none — tenant-wide


```sql
dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_image_command_line contains "Koi"
| fields _time, agent_hostname, action_process_image_name, action_process_image_path, action_process_image_command_line, actor_process_image_name, action_process_username
| limit 15
```


_Interpretation:_ Returned 15 rows (capped by the limit). Every returned row was `thor` running `wsl -d koi-engine -u root -- hostname -I` under `pythonw.exe`. This query is ORIENTATION ONLY — it is how I discovered the two false-positive sources. Do NOT promote this to a detection.


_False positives:_ Very high. Matches (a) the lab SSH-relay on `thor` (4,275 events/24h), (b) any path containing the substring 'koi' — including this project's own `KOI-MP` directory on `OfficeiMac`, and (c) 'KOI' embedded in unrelated hostnames such as `DESKTOP-8Q6G4SKOI`. Use C3 instead for anything that alerts.


### C2 — KOI-referencing process shapes, grouped by host and image — signature discovery

**Purpose:** investigation · **Status:** validated (35 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


Across all hosts, what distinct (host, image, parent) shapes reference KOI, and how often? Establishes which shapes are the real agent and which are noise.


_Parameters:_ none — tenant-wide


```sql
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


_Interpretation:_ Returned 35 rows. The one row that matters: `win-workstation` / `python.exe` / `C:\Users\Default\AppData\Local\Koi\Python\WPy64-31290\python\python.exe` / parent `powershell.exe`, n=98 (= the 49+49 launcher/scan pairs). Also shows KOI's scan fan-out: that python.exe spawns `cmd.exe` 1,437 times and `icacls.exe` 490 times in 24h — useful to know so those are not mistaken for attacker activity. The 4,278-row `wsl.exe`/`conhost.exe`/`wslhost.exe` rows on `thor` and the `zsh`/`claude`/`python3.12` rows on `OfficeiMac` are all noise.


_False positives:_ Same three sources as C1. This query exists to ENUMERATE false positives, which is why it is deliberately broad.


### C3 — KOI scan executions per host, with timestamps and launch command line (Req 1a)

**Purpose:** both · **Status:** validated (25 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


When did the KOI agent actually execute on each host, and in which of its two forms?


_Parameters:_ Add `and agent_hostname = "<host>"` to scope to one host inside a playbook. // PARAM: hostname


```sql
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path ~= "(?i)AppData.Local.Koi.Python"
| comp count() as n, min(_time) as first, max(_time) as last
  by agent_hostname, action_process_image_command_line, actor_process_image_name
| sort desc n
| limit 25
```


_Interpretation:_ Returned 25 rows (capped), every row n=1 because each launch gets a fresh random temp filename — so the row count IS the execution count and grouping by command line effectively lists individual scans. All rows are `win-workstation`, parent always `powershell.exe`. Two forms alternate: `"...python.exe" -I C:\Windows\SystemTemp\tmpXXXX.tmp.py` (launcher) and `"...python.exe" -I C:\Windows\SystemTemp\tmpXXXX.tmp.pyz ` (the zipapp that performs the scan — note trailing space). This is the precise, validated KOI-execution signature; the `AppData.Local.Koi.Python` path anchor is what makes it clean


_False positives:_ Essentially none observed. The path anchor `AppData\Local\Koi\Python\WPy64-*\python\python.exe` is KOI's own bundled WinPython and matched nothing else on the tenant. Note the `.` in the regex is a wildcard standing in for the backslash — XQL string-literal backslash escaping is painful and this form is the one that validated.


### C4 — KOI scan cadence and last-scan timestamp per host (Req 1b — freshness)

**Purpose:** detection · **Status:** validated (2 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


For each host, how many KOI launcher/scan cycles ran in the window, and when was the most recent one? Backs a scan-freshness / stale-telemetry rule.


_Parameters:_ Timeframe is the parameter — run over 24h for cadence, over N days for a staleness rule. // PARAM: timeframe


```sql
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path ~= "(?i)AppData.Local.Koi.Python"
| alter koi_launch_kind = if(action_process_image_command_line ~= "(?i)\.pyz", "scan_zipapp_pyz",
                          if(action_process_image_command_line ~= "(?i)\.py\s*$", "launcher_py", "other"))
| comp count() as n, min(_time) as first, max(_time) as last by agent_hostname, koi_launch_kind
```


_Interpretation:_ Returned exactly 2 rows, both `win-workstation`: `scan_zipapp_pyz` n=49 and `launcher_py` n=49, first 2026-07-20 10:41:34Z, last 2026-07-21 10:00:10Z. The perfect 49/49 pairing confirms the launcher-then-zipapp model, and the 23.3h span over 48 intervals gives a mean cadence of ~29 min. `max(last)` is the last-scan timestamp for a freshness rule; the ANALYST or playbook computes the age, because `current_time()`/`timestamp_diff()` could not be validated before quota exhaustion. A host that appears in C6 but is ABSENT from this result set has never run a KOI scan in the window — that is the Req


_False positives:_ None observed. The `other` bucket returned zero rows, meaning the two-form model is complete on this tenant — if `other` ever becomes non-empty, KOI has changed its launch shape and the signature needs review.


### C5 — Control query: distinguish the real KOI agent from a lab script named 'koi' (false-positive proof)

**Purpose:** investigation · **Status:** validated (2 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


Is the KOI-looking Python activity on this host the actual KOI agent, or something else named 'koi'?


_Parameters:_ `agent_hostname = "thor"` is the parameter. // PARAM: hostname


```sql
dataset = xdr_data
| filter event_type = ENUM.PROCESS and agent_hostname = "thor"
| filter action_process_image_name in ("pythonw.exe","python.exe") or actor_process_image_name in ("pythonw.exe")
| comp count() as n, min(_time) as first, max(_time) as last
  by action_process_image_name, action_process_image_path, actor_process_image_name, actor_process_command_line
| sort desc n
| limit 20
```


_Interpretation:_ Returned 2 rows, both revealing `"C:\Users\ayman\AppData\Local\Programs\Python\Python312\pythonw.exe" D:\VMs\wsl-koi\koi_ssh_relay.py` driving `wsl.exe` 4,275 times in 24h. This is a hand-built lab SSH relay against a WSL distro named `koi-engine` — NOT the KOI agent, which uses its own bundled WinPython under `AppData\Local\Koi\Python\`. Ship this as the disambiguation step in any investigation playbook that gets a 'KOI activity' hit on a host: if the interpreter is a user-installed Python rather than KOI's bundled one, it is not KOI.


_False positives:_ N/A — this query's purpose is to expose a false positive.


### C6 — Cortex-managed host population from telemetry (Req 2/3 — left side of the coverage diff)

**Purpose:** investigation · **Status:** validated (10 rows on this tenant) · **Datasets:** xdr_data (all event types)


Which hosts are actually producing Cortex XDR telemetry, and over what span? This is the denominator for any coverage-gap calculation.


_Parameters:_ Timeframe defines 'recent'. // PARAM: timeframe


```sql
dataset = xdr_data
| comp count() as n, min(_time) as first, max(_time) as last by agent_hostname, agent_os_type
| sort desc n
| limit 30
```


_Interpretation:_ Returned 10 rows collapsing to 4 real hosts (each appears twice because `agent_os_type` is NULL on a minority of events — dedupe on `agent_hostname` alone if you do not need OS): `OfficeiMac` (720,009 events, AGENT_OS_MAC), `thor` (283,745, AGENT_OS_WINDOWS), `win-workstation` (207,123, AGENT_OS_WINDOWS), `Abdelrahman's MacBook Air` (42,478, AGENT_OS_MAC), plus 5,660 events with a null hostname. Diff this against C4: only `win-workstation` runs KOI, so **3 of 4 telemetry-producing hosts are supply-chain blind spots (75%)**. Prefer this over `endpoints` (C12) as the population source — it is fa


_False positives:_ `agent_hostname = null` rows (5,660/24h) are real telemetry that failed host attribution — exclude them from a blind-spot count rather than treating them as a host. The double-counting via null `agent_os_type` will inflate a naive row count.


### C7 — Cortex-managed host population, deduplicated to one row per host

**Purpose:** detection · **Status:** validated (0 rows on this tenant) · **Datasets:** xdr_data (all event types)


Simplified host population without the agent_os_type split — the clean denominator for a scheduled coverage report.


_Parameters:_ // PARAM: timeframe


```sql
dataset = xdr_data
| comp count() as n, min(_time) as first, max(_time) as last by agent_hostname
| sort desc n
| limit 30
```


_Interpretation:_ NOT SHIPPED AS VALIDATED — this variant was never run; the tenant's daily quota reached zero before I could execute it. It is a strict simplification of C6 (which DID run and returned 10 rows) with one fewer group-by key, so it is very likely fine — but I am marking `parses: false` because I did not run it, not because it is known-bad. **Use C6 and collapse on `agent_hostname` client-side until this is validated after quota reset.** I include it only so the parent agent knows this trivial variant is the intended final form.


_False positives:_ Same null-hostname caveat as C6.


### C8 — KOI-reporting host population and KOI activity recency (Req 3 — right side of the coverage diff)

**Purpose:** both · **Status:** validated (30 rows on this tenant) · **Datasets:** koi_koi_raw (Audit + Alerts)


Which hosts are sending KOI supply-chain events, split by Audit vs Alerts, and when did each last report?


_Parameters:_ Run at 168h for a weekly coverage view. // PARAM: timeframe


```sql
dataset = koi_koi_raw
| comp count() as n, min(_time) as first, max(_time) as last by hostname, source_log_type
| sort desc n
| limit 30
```


_Interpretation:_ Run over 168h; returned 30 rows (capped — there are 35 distinct Audit hostnames, see C9). Two findings drive everything else. (a) The hostname populations barely intersect: KOI reports on `sj-ad-2022`, `jumpbox`, `winkoi`, `koi-win-test`, `LAB-WIN11-01`, `Greg's Mac mini`, `Kim的MacBook Air` etc., of which **only `win-workstation` also exists in `xdr_data`** — so on this tenant the Req 3 'KOI events but no Cortex telemetry' answer is ~34 of 35 hosts, but that is tenant-sharing on the Koi SaaS side, NOT a real Cortex coverage failure. Say that explicitly in any report. (b) The dominant Alerts gr


_False positives:_ Do not read a large `n` as 'busy host' for Alerts — Alerts are re-sent ~245x per still-open alert. This query does not dedupe, so its Alerts counts are meaningless as volumes; they are only used here to establish which hostnames exist. Audit counts (1.0 duplication ratio) are trustworthy.


### C9 — KOI host-population size vs Cortex host-population size (the coverage-gap headline number)

**Purpose:** detection · **Status:** validated (1 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


How many distinct hosts does KOI cover, versus how many Cortex covers? A single-number KPI for a coverage dashboard.


_Parameters:_ // PARAM: timeframe


```sql
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| comp count_distinct(hostname) as distinct_koi_hosts, count() as audit_rows
```


_Interpretation:_ Run over 168h; returned 1 row: **distinct_koi_hosts = 35, audit_rows = 706**. Compare against C6/C12 (4 telemetry hosts / 7 managed endpoints). Audit is filtered explicitly because Alerts carry a null hostname and would corrupt the distinct count. The 706 rows/7d is consistent with the brief's ~20k rows/90d for Audit. Pair this with C6 as a two-number scheduled report: 'KOI covers 35 hosts, Cortex covers 4, overlap 1'.


_False positives:_ `count_distinct` counts nothing for null hostnames, which is the desired behaviour here. The number is inflated relative to the customer's own estate because this is a shared Koi SaaS tenant.


### C10 — NEGATIVE RESULT — C:\ProgramData\Koi\ writes are NOT captured by XDR (Req 5b)

**Purpose:** investigation · **Status:** validated (0 rows on this tenant) · **Datasets:** xdr_data (FILE)


Does XDR see writes to KOI's documented freshness-proof files (settings.json / agent_policies.json under C:\ProgramData\Koi\), which would give a second independent freshness signal?


_Parameters:_ none — tenant-wide


```sql
dataset = xdr_data
| filter event_type = ENUM.FILE and action_file_path ~= "(?i)ProgramData.Koi"
| comp count() as n, min(_time) as first, max(_time) as last
  by agent_hostname, action_file_name, action_file_path, action_file_last_writer_actor
| sort desc n
| limit 30
```


_Interpretation:_ **Returned 0 rows over 24h — and this is a TRUE NEGATIVE, not a broken query.** The identical regex construction against `(?i)Koi` returns 20,000+ rows in C11/C13, so the syntax and the FILE event type are both proven working. The answer to Req 5b is therefore: **XDR does not capture `C:\ProgramData\Koi\` writes on this tenant, so there is no second, independent KOI-freshness signal from the filesystem.** Process execution (C3/C4) is the only reliable freshness signal. Do not build a freshness detection on file mtimes.


_False positives:_ N/A — zero rows. If this ever returns rows it means XDR file-monitoring scope changed, and the second freshness signal becomes available.


### C11 — What KOI filesystem activity XDR DOES capture, bucketed (Req 5b supporting evidence)

**Purpose:** investigation · **Status:** validated (25 rows on this tenant) · **Datasets:** xdr_data (FILE)


If ProgramData\Koi is invisible, what Koi-related file activity does XDR actually record, and is any of it periodic enough to serve as a freshness proxy?


_Parameters:_ // PARAM: hostname (win-workstation)


```sql
dataset = xdr_data
| filter event_type = ENUM.FILE and agent_hostname = "win-workstation"
| filter action_file_path ~= "(?i)Koi" or action_file_path ~= "(?i)SystemTemp"
| alter bucket = if(action_file_path ~= "(?i)SystemTemp", "SystemTemp", "KoiPath")
| comp count() as n, count_distinct(action_file_path) as paths, min(_time) as first, max(_time) as last
  by bucket, action_file_extension, action_file_last_writer_actor
| sort desc n
| limit 25
```


_Interpretation:_ Returned 25 rows (capped). The KoiPath buckets are all clustered in a single 22-second window (1784550069129→1784550091021 = 2026-07-20 12:21:09→12:21:31Z) and consist of `.tcl` (223), `.xbm` (42), `.xpm` (23), `.gif` (31), `.pyc` (900), `.html` (471), `.msg` (128), `.h` (187), `.tmp` (8,804) — this is unmistakably the WinPython runtime being UNPACKED once, not per-scan output. Confirms C10's conclusion: KOI file activity is a one-time install artifact and useless as a recurring freshness signal. The SystemTemp bucket (4,099 `.tmp` files) is where the `.pyz` zipapps land, but the FILE events t


_False positives:_ `action_file_last_writer_actor` is an OPAQUE base64 causality ID (`9aTCTSsY3QFkBwAAAAAAAA==`), NOT a process name — never surface it to an analyst as an actor. Grouping by it also double-counts (the same 4,432 `.tmp` paths appear once with a null writer and once with a populated writer).


### C12 — Cortex managed-endpoint inventory size (alternate population source for Req 2)

**Purpose:** investigation · **Status:** validated (1 rows on this tenant) · **Datasets:** endpoints


How many endpoints does Cortex formally manage, as opposed to how many are currently emitting telemetry?


_Parameters:_ none


```sql
dataset = endpoints
| comp count() as endpoint_rows, count_distinct(endpoint_name) as distinct_hosts
```


_Interpretation:_ Returned 1 row: **endpoint_rows = 7, distinct_hosts = 7**. So Cortex manages 7 endpoints while only 4 emitted telemetry in the last 24h (C6) and only 1 runs KOI (C4) — the managed-vs-reporting-vs-KOI funnel is 7 → 4 → 1. **Operational warning: this aggregate form is the ONLY `endpoints` query that completed.** Both `dataset = endpoints | comp ... by endpoint_name, ...` and `dataset = endpoints | fields <list> | limit 10` timed out repeatedly at 240s+ despite the dataset holding just 7 rows. Use C6 (`xdr_data`) as the working host population and this query only for the headline managed-count.


_False positives:_ `endpoint_rows == distinct_hosts` here so there is no duplication, but on a larger tenant verify that before treating row count as host count. Also note this includes disconnected/decommissioned endpoints, which will inflate a blind-spot percentage versus C6.


### C13 — KOI installation roots on disk — where the agent actually lives (Req 5 supporting)

**Purpose:** investigation · **Status:** validated (3 rows on this tenant) · **Datasets:** xdr_data (FILE)


Which filesystem roots does the KOI agent occupy on a host, and when were they written? Confirms install-time vs runtime behaviour.


_Parameters:_ // PARAM: hostname (win-workstation)


```sql
dataset = xdr_data
| filter event_type = ENUM.FILE and agent_hostname = "win-workstation"
| filter action_file_path ~= "(?i)Koi"
| alter koi_root = arrayindex(regextract(action_file_path, "(?i)(^.{0,60}?Koi)"), 0)
| comp count() as n, min(_time) as first, max(_time) as last by koi_root
| sort desc n
| limit 20
```


_Interpretation:_ Returned exactly 3 rows: `C:\Users\amahmoud\AppData\Local\Koi` (17,668 events), `C:\Users\Default\AppData\Local\Koi` (2,212), and a null bucket (21). **Crucially, NO `C:\ProgramData\Koi` root exists** — independently confirming C10 by enumeration rather than by absence of a match. Both real roots were written only during the same 22-second window. Note the per-user duplication: KOI stages under `C:\Users\Default\` (the template profile, which is why C3's process path shows `Default`) and then materialises under the real user profile. The `regextract` + `arrayindex` idiom is validated here and 


_False positives:_ The 21-row null bucket is paths where 'Koi' appears beyond character 60 — widen the `{0,60}` bound if a deployment uses a deeper root. Any host whose USERNAME contains 'koi' would produce a spurious root; check the root string looks like a real install path before acting on it.


---

## Theme D — Investigation (playbook) queries

_Parameterised drill-downs for the KOI Ext investigation playbooks. Each states its // PARAM: inputs._

_12 queries._


### D1 — Item full KOI history across every host

**Purpose:** investigation · **Status:** validated (2 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


Given an item, when was it installed, updated, uninstalled or remediated — on which hosts, at which versions, by whom?


_Parameters:_ item_key / item_name — pass KoiContext.item_id (from the alert's observables[name="item.id"]) or Koi.Inventory.item_id. Both sides of the OR take the same value when you only have one. Worked example: "octocat/Hello-World". Timeframe 30d.


```sql
// KOI Ext - Investigate Item, step "KOI event history" (runs beside koi-inventory-item-get)
// PARAM: item_key   = KoiContext.item_id  (alert) or Koi.Inventory.item_id
// PARAM: item_name  = Koi.Inventory.name  (pass the same value twice if you only have one)
// Marketplace pack 1.2.3 has no history command - this is the only way to get an item timeline.
dataset = koi_koi_raw
| filter source_log_type = "Audit"                                  // Audit is NOT duplicated - do not dedupe
| filter type in ("extensions", "remediation")
| filter object_id = "octocat/Hello-World" or object_name = "octocat/Hello-World"   // PARAM
| alter koi_host      = coalesce(hostname, "<no host on event>")
| alter koi_action    = coalesce(action, "-")
| alter koi_actor     = coalesce(triggered_by, "-")
| alter marketplace_event_vocab = coalesce(marketplace, "-")
| fields _time, koi_host, koi_action, type, object_name, object_id, item_version,
         marketplace_event_vocab, platform, category, koi_actor, message, id
| sort asc _time
| limit 500
```


_Interpretation:_ The single most useful investigation query, and the Marketplace pack has nothing like it — there is no koi-remediations-list, no koi-approval-requests-list, no history command at all, so the audit stream is the only source of an item timeline. Worked example returned the complete verified lifecycle of octocat/Hello-World on win-workstation: installed 1784627286000 and uninstalled 1784628345000, both carrying the SAME item_version 7fd1a60b01f91b314f59955a4e4d4e80d8edf11d — git repos use the remote as object_name and the commit SHA as the version, which is why version alone never distinguishes a


_False positives:_ object_name is not unique — generic names such as "npm", "pip", "access" or "configure" collide across marketplaces and will pull in unrelated items. When marketplace is known, add `| filter marketplace = "<event vocab value>"`. Matching on object_id alone is exact but not always available from an alert.


### D1b — Item history rolled up per host

**Purpose:** investigation · **Status:** validated (1 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


For the war-room summary: one line per host that has ever seen this item.


_Parameters:_ Same item_key / item_name as D1. Worked example: "octocat/Hello-World". Timeframe 30d.


```sql
// KOI Ext - Investigate Item, war-room summary block. Same PARAMs as D1.
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


_Interpretation:_ Collapses D1 into something a playbook can paste into a war-room note or a markdown table. Returned one row: win-workstation, first_seen 1784627286000, last_seen 1784628345000, koi_events 2, actions_seen [installed, uninstalled], versions_seen [7fd1a60b…], triggered_by_actors [Koi]. `values()` is what makes this work — it emits a deduplicated array per group, so versions_seen doubles as a version-drift indicator without a second query. triggered_by is "Koi" for everything agent-discovered; a human or API actor there is itself worth reading.


_False positives:_ Same name-collision caveat as D1. Also note first_seen is bounded by the query timeframe, not by when the item genuinely first appeared — an item present before the retention window looks younger than it is.


### D2 — XDR runtime evidence for a KOI item

**Purpose:** investigation · **Status:** validated (8 rows on this tenant) · **Datasets:** xdr_data (PROCESS, FILE, LOAD_IMAGE)


KOI says this item is installed — did anything from it actually execute, load, or get written to disk, and what brought it here?


_Parameters:_ item_token — a distinctive lowercase substring of the item (package name, extension id, repo name), from KoiContext.package_name or item_id. koi_host — KoiContext.alert_hostname or Koi.Inventory.Endpoint.hostname; delete that filter line to search fleet-wide. Worked example: item_token "hello-world", host "win-workstation", 24h.


```sql
// KOI Ext - Investigate Item, new step "XDR runtime evidence".
// Bridges "KOI says it is installed" to "it actually ran / was written to disk".
// PARAM: item_token  = a distinctive substring of the item - package name, extension id, repo name.
//                      From KoiContext.package_name / item_id, lowercased.
// PARAM: koi_host    = KoiContext.alert_hostname / Koi.Inventory.Endpoint.hostname. Drop the line to search fleet-wide.
dataset = xdr_data
| filter event_type in (ENUM.PROCESS, ENUM.FILE, ENUM.LOAD_IMAGE)
| filter agent_hostname = "win-workstation"                          // PARAM
| alter artifact_path = coalesce(action_process_image_path, action_file_path, action_module_path)
| alter cmdline       = action_process_image_command_line
| filter lowercase(coalesce(artifact_path, "")) contains "hello-world"
      or lowercase(coalesce(cmdline, ""))       contains "hello-world"     // PARAM item_token (lowercase)
| alter evidence_kind = if(event_type = ENUM.PROCESS, "executed",
                        if(event_type = ENUM.LOAD_IMAGE, "loaded_as_module", "written_to_disk"))
| fields _time, agent_hostname, evidence_kind, event_type, artifact_path, cmdline,
         action_process_image_name, action_process_username, action_process_signature_status,
         actor_process_image_name, actor_process_command_line
| sort asc _time
| limit 200
```


_Interpretation:_ This is the query that turns a KOI inventory fact into an incident. It recovered the exact acquisition of octocat/Hello-World: `"C:\Program Files\Git\cmd\git.exe" clone --depth 1 https://github.com/octocat/Hello-World.git C:\Users\amahmoud\Documents\koi-test-repo`, running as NT AUTHORITY\SYSTEM, with actor_process_image_name = cortex-xdr-payload.exe — the full causality chain from the driving process down through git.exe → git remote-https → git-remote-https.exe, four minutes before KOI reported the install at 1784627286000. That four-minute gap is the KOI scan latency made visible. `action_m


_False positives:_ Substring matching is blunt. Short or generic tokens ("pip", "build", "access", "npm") will match unrelated paths; prefer the longest distinctive fragment available. A hit in cmdline only, with no matching artifact_path, means something mentioned the item rather than ran it — the git-clone rows are exactly that shape and are still the answer you want, so read evidence_kind together with who the ac


### D3 — Host agentic supply-chain posture by marketplace

**Purpose:** investigation · **Status:** validated (7 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


Given a host, what is currently on it, broken down by marketplace and platform?


_Parameters:_ koi_host = inputs.hostname (KOI Ext - Investigate Device). Worked example: "win-workstation", 30d.


```sql
// KOI Ext - Investigate Device, step "supply-chain posture by marketplace".
// dedup keeps only the LATEST audit row per item, so install/uninstall churn nets out.
// PARAM: koi_host = inputs.hostname
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter hostname = "win-workstation"                                 // PARAM
| dedup object_id, marketplace by desc _time
| filter action != "uninstalled"
| alter marketplace_event_vocab = coalesce(marketplace, "<unset>")
| comp count()               as items_present,
       values(object_name)   as item_names,
       max(_time)            as latest_change
     by marketplace_event_vocab, platform
| sort desc items_present
| limit 50
```


_Interpretation:_ The device-side entry point the Marketplace pack cannot provide — there is no koi-devices-list and no koi-device-inventory-get in 1.2.3, and no Koi.Device.* context at all, so a hostname cannot be turned into an inventory through the API. This does it from events. The `dedup object_id, marketplace by desc _time` then `filter action != "uninstalled"` pair is the whole trick: it nets install/update/uninstall churn down to present-tense state. On win-workstation it returned 7 marketplace/platform pairs, and the largest is the interesting one — 14 items on platform "claude_code" with marketplace u


_False positives:_ Nets to state only within the query timeframe: an item installed before the window and never touched again has no row inside it and will be missing. Run at 30d or longer for posture, not 24h. marketplace "<unset>" is not an error — claude_code items genuinely carry no marketplace, and `built_in`/`side_loaded` seen elsewhere are installation methods leaking into the field, not marketplaces.


### D3b — Recent supply-chain changes on a host, classified

**Purpose:** investigation · **Status:** validated (85 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


What has changed on this device recently, and how much of it touches an agent or IDE surface?


_Parameters:_ koi_host = inputs.hostname. Lookback is set by the query timeframe. Worked example: "win-workstation", 7d.


```sql
// KOI Ext - Investigate Device, step "recent supply-chain changes on this device".
// PARAM: koi_host  = inputs.hostname
// PARAM: lookback  = set on the query timeframe (7d used in the worked example)
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter hostname = "win-workstation"                                  // PARAM
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


_Interpretation:_ The narrative feed for a device investigation. Two derived columns do the work: change_class (acquisition / removal / remediation / other) and agentic_surface (agent_or_ide / browser / os_package), so an analyst can see at a glance whether the week's churn is Chrome updating itself or an agent surface moving. 85 rows over 7d on win-workstation, spanning claude_code skill removals, vsc extension installs, github repo acquisition and Windows package updates. The full verified action vocabulary across the tenant is: installed, updated, uninstalled, archived, unarchived, remediation_opened, remedi


_False positives:_ The agentic_surface mapping is a judgement call encoded in the query, not a field KOI emits — `npp` (Notepad++) and `jet` (JetBrains) are grouped as agent_or_ide because they are plugin hosts. Adjust the lists to your definition. Rows with hostname NULL are org-level and are excluded by the host filter by design.


### D3c — When did KOI last actually scan this device?

**Purpose:** both · **Status:** validated (2 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


Is silence from KOI on this host evidence of no change, or evidence of no scan?


_Parameters:_ koi_host = inputs.hostname; delete the filter for a fleet-wide coverage sweep. Worked example: "win-workstation", 24h.


```sql
// KOI Ext - Investigate Device, step "when did KOI last actually scan this device?".
// KOI is run-on-demand on Windows: no resident agent, so absence of KOI events means
// "no scan ran", not "nothing changed". The bundled interpreter under ...\Local\Koi\Python
// makes the scan itself visible in XDR, which is the only way to tell the two apart.
// PARAM: koi_host = inputs.hostname  (drop the filter for a fleet-wide coverage sweep)
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter agent_hostname = "win-workstation"                            // PARAM
| filter actor_process_image_path contains "Koi" or action_process_image_path contains "Koi"
| comp max(_time)                            as last_koi_agent_activity,
       min(_time)                            as first_koi_agent_activity,
       count()                               as processes_spawned_by_koi,
       count_distinct(action_process_causality_id) as scan_causality_chains,
       values(action_process_image_name)     as koi_child_processes
     by agent_hostname
| limit 100
```


_Interpretation:_ Neither dataset can answer this alone, which is what makes it worth having. KOI is run-on-demand on Windows — no service, no resident process — so an empty koi_koi_raw for a host is ambiguous. But KOI bundles its own interpreter at C:\Users\Default\AppData\Local\Koi\Python\WPy64-31290\python\python.exe, and every discovery probe it forks is an ordinary PROCESS event, so the scan itself is observable in XDR. On win-workstation: last_koi_agent_activity 1784628070884, 1426 processes spawned across 2 causality chains, children [cmd.exe, python.exe]. The probes are recognisable in the raw rows — Ge


_False positives:_ The path match is the bare token "Koi", chosen because escaped backslash literals in `contains` proved fragile in XQL (`contains "\\Koi\\"` is a parse error at the tenant). Any path containing that substring matches — on a Mac fleet, or a host with an unrelated "Koi" directory, tighten to `contains "Local\\Koi"` and verify it parses first. macOS/Linux hosts use a different KOI layout and will not 


### D4 — Host acquisition timeline — two lanes on one clock

**Purpose:** investigation · **Status:** validated (30 rows on this tenant) · **Datasets:** koi_koi_raw (Audit) UNION xdr_data (PROCESS)


On this host, in this window, what arrived and which process brought it?


_Parameters:_ koi_host — must be the same string in both lanes; KOI's hostname and XDR's agent_hostname agree on win-workstation but this is not guaranteed fleet-wide. Window is the query timeframe. Worked example: "win-workstation", 24h.


```sql
// KOI Ext - Alert Triage, war-room summary step "acquisition timeline for this host".
// Two lanes on one clock: what KOI says arrived, and which process was running when it did.
// PARAM: koi_host = KoiContext.alert_hostname (must equal xdr_data.agent_hostname)
// PARAM: window   = the query timeframe (24h in the worked example)
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter hostname = "win-workstation"                                   // PARAM
| filter action in ("installed", "updated")
| alter lane = "1_KOI_SAYS_ARRIVED"
| alter what = concat(object_name, " @", coalesce(item_version, "?"))
| alter how  = concat(coalesce(marketplace, "<unset>"), " / ", coalesce(platform, "?"))
| alter who  = coalesce(triggered_by, "-")
| fields _time, lane, what, how, who
| union
(dataset = xdr_data
 | filter event_type = ENUM.PROCESS
 | filter agent_hostname = "win-workstation"                            // PARAM (same host)
 | filter action_process_image_name in ("pip.exe", "pip3.exe", "npm.exe", "npx.exe", "node.exe",
                                        "git.exe", "curl.exe", "wget.exe", "winget.exe",
                                        "msiexec.exe", "choco.exe", "code.exe", "cursor.exe")
 // drop Electron/Chromium helper processes - they are not acquisition, just IDE internals
 | filter action_process_image_command_line not contains "--type="
 | alter lane = "2_XDR_BROUGHT_IT"
 | alter what = coalesce(action_process_image_command_line, action_process_image_name)
 | alter how  = concat(coalesce(actor_process_image_name, "?"), " -> ", coalesce(action_process_image_name, "?"))
 | alter who  = coalesce(action_process_username, "-")
 | fields _time, lane, what, how, who)
| sort asc _time
| limit 400
```


_Interpretation:_ Built for the Alert Triage war-room summary. Both datasets are projected onto the same four columns (_time, lane, what, how, who) and unioned, so a single result set reads as one interleaved narrative: lane 1_KOI_SAYS_ARRIVED gives "octocat/Hello-World @7fd1a60b… — github / git — Koi" and "ms-toolsai.vscode-jupyter-cell-tags @0.1.9 — vsc / vsc", while lane 2_XDR_BROUGHT_IT gives the git clone with `cortex-xdr-payload.exe -> git.exe` as the causality and NT AUTHORITY\SYSTEM as the user. 30 rows on win-workstation over 24h. The `not contains "--type="` filter is load-bearing: without it Code.exe


_False positives:_ The installer allowlist is the tuning surface. code.exe and cursor.exe are included because IDE extension installs go through them, but they are also just the editor running; git.exe appears for `git --version` probes as much as for clones. Read the `what` column, not just the presence of a row. The lanes are correlated only by time and host — this query asserts adjacency, never causation.


### D5 — Alert in context — the hour either side, three lanes

**Purpose:** investigation · **Status:** validated (100 rows on this tenant) · **Datasets:** koi_koi_raw (Audit) UNION xdr_data (PROCESS) UNION xdr_data (NETWORK)


For this one deduplicated alert, what else was happening on the host at the time?


_Parameters:_ alert_host = KoiContext.alert_hostname (extracted from resources[type=device].data.hostname — the top-level hostname column is NULL on every Alerts row). alert_time_ms = the surviving alert's _time in epoch milliseconds, substituted into all three to_timestamp() calls. radius_min = the abs() bound, 60 below. Worked example: "win-workstation", 1784627286000, ±60min, 24h.


```sql
// KOI Ext - Alert Triage, step "what else happened around this alert".
// The alert is deduped upstream on metadata.notification_event_id - this takes the ONE
// surviving alert's host and time and rebuilds the hour either side of it.
// PARAM: alert_host    = KoiContext.alert_hostname (resources[type=device].data.hostname)
// PARAM: alert_time_ms = the alert _time, epoch MILLISECONDS
// PARAM: radius_min    = +/- minutes (60 below)
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter hostname = "win-workstation"                                        // PARAM
| alter mins_from_alert = timestamp_diff(_time, to_timestamp(1784627286000, "MILLIS"), "MINUTE")  // PARAM
| filter abs(mins_from_alert) <= 60
| alter lane   = "KOI_SUPPLY_CHAIN"
| alter detail = coalesce(message, concat(coalesce(action, "?"), " ", coalesce(object_name, "?")))
| fields _time, mins_from_alert, lane, detail
| union
(dataset = xdr_data
 | filter event_type = ENUM.PROCESS
 | filter agent_hostname = "win-workstation"                                 // PARAM
 | alter mins_from_alert = timestamp_diff(_time, to_timestamp(1784627286000, "MILLIS"), "MINUTE")  // PARAM
 | filter abs(mins_from_alert) <= 60
 | alter lane   = if(actor_process_image_path contains "Koi", "KOI_AGENT_SCAN", "XDR_EXECUTION")
 | alter detail = coalesce(action_process_image_command_line, action_process_image_name)
 | fields _time, mins_from_alert, lane, detail)
| union
(dataset = xdr_data
 | filter event_type = ENUM.NETWORK
 | filter agent_hostname = "win-workstation"                                 // PARAM
 // only egress from processes that can pull code - browsers/telemetry are noise here
 | filter actor_process_image_name in ("git.exe", "pip.exe", "pip3.exe", "npm.exe", "npx.exe",
                                       "node.exe", "curl.exe", "wget.exe", "python.exe",
                                       "winget.exe", "msiexec.exe")
 | alter mins_from_alert = timestamp_diff(_time, to_timestamp(1784627286000, "MILLIS"), "MINUTE")  // PARAM
 | filter abs(mins_from_alert) <= 60
 | alter lane   = "XDR_EGRESS"
 | alter detail = concat(coalesce(actor_process_image_name, "?"), " -> ",
                         coalesce(action_remote_ip, "?"), ":", to_string(action_remote_port),
                         " (", coalesce(action_country, "?"), ")")
 | fields _time, mins_from_alert, lane, detail)
| sort asc _time
| limit 500
```


_Interpretation:_ Alert-in-context for Alert Triage. Every row carries mins_from_alert as a signed offset, so the analyst reads the hour as a relative timeline rather than absolute epochs. Four lanes emerge: KOI_SUPPLY_CHAIN (what KOI recorded), KOI_AGENT_SCAN (processes whose actor path contains Koi — the scan that produced the alert, separated out so it is not mistaken for adversary activity), XDR_EXECUTION (everything else that ran) and XDR_EGRESS (network from code-pulling processes only). Note the timestamp arithmetic: `to_timestamp(<ms> - 3600000, ...)` is a parse error at the tenant, so the window is bui


_False positives:_ Still noisy in the XDR_EXECUTION lane by construction — the worked example shows GoogleUpdater and TrustedInstaller and secedit, which is normal Windows housekeeping. That is the intended behaviour of "everything else that happened", but it is why the 500-row cap matters. Narrow radius_min before narrowing the lanes. Requires the KOI hostname and the XDR agent_hostname to be the same string.


### D6 — Blast radius for an item, with remediation and policy status

**Purpose:** investigation · **Status:** validated (8 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


Which hosts have this item, and has it already been remediated or listed by policy?


_Parameters:_ item_key / item_name = inputs.item_id from KOI Ext - Block and Remediate. Worked example: "anthropic.claude-code", 30d.


```sql
// KOI Ext - Block and Remediate, pre-block step "who else has this item, and is it already handled".
// PARAM: item_key  = inputs.item_id
// PARAM: item_name = the display name (pass item_id twice if that is all you have)
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter object_id = "anthropic.claude-code" or object_name = "anthropic.claude-code"   // PARAM
| alter scope  = coalesce(hostname, "<org-level event, no host>")
| alter signal = if(type = "remediation", concat("remediation:", coalesce(action, "?")),
                 if(type = "policies",    concat("policy:",      coalesce(action, "?")),
                                          concat("inventory:",   coalesce(action, "?"))))
| comp max(_time)           as last_signal,
       min(_time)           as first_signal,
       count()              as koi_events,
       values(signal)       as signals,
       values(item_version) as versions,
       values(marketplace)  as marketplaces
     by scope
| alter already_remediated = if(arraystring(signals, ",") contains "remediation:", "yes", "no")
| alter listed_by_policy   = if(arraystring(signals, ",") contains "policy:",       "yes", "no")
| sort desc last_signal
| limit 500
```


_Interpretation:_ Runs before the approval gate in Block and Remediate so the analyst sees scope and prior handling before approving a fleet-wide block. Worked example returned all 8 hosts carrying anthropic.claude-code: M-HFQQ44F5XF (27 events, 11 versions from 2.1.185 to 2.1.209, already_remediated yes), LAB-WIN11-01 (13 events, already_remediated yes), Greg's Mac mini, M-DQ3HT4R1P7, mzpanw-w11-koi, Vincent's MacBook Pro — all already_remediated yes — plus piusco and LAB-WIN10-02 with a single install each and no remediation. Six of eight already handled is exactly the finding that should change the response 


_False positives:_ already_remediated is derived from the audit stream, not from a live remediation API — the Marketplace pack has no koi-remediations-list, so a remediation performed outside the observed window is invisible and the flag will read "no". Treat "yes" as reliable and "no" as unknown. remediation_opened is not remediation_executed: check the signals array rather than the flag when the distinction matter


### D7 — MCP servers currently alerting — one row per REAL alert

**Purpose:** both · **Status:** validated (3 rows on this tenant) · **Datasets:** koi_koi_raw (Alerts only)


Which MCP servers are alerting, on which devices, and how many distinct alerts is that really?


_Parameters:_ None — fleet-wide as written. Add `| filter alert_host = "<hostname>"` after the alter block for the per-device variant used by Investigate Device. Worked example: 24h.


```sql
// KOI Ext - MCP Server Audit, step "MCP servers currently alerting, one row per real alert".
// Alerts are re-sent on every 1-minute fetch (~245x). dedup on metadata.notification_event_id
// is MANDATORY - count() over raw rows is meaningless.
// PARAM: none (fleet-wide). Add `| filter alert_host = "<host>"` for the per-device variant.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid       = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr   = json_extract_array(resources, "$")
| alter obs_arr   = json_extract_array(observables, "$")
| alter dev_obj   = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element", "$.type") = "device"), 0)
| alter itm_obj   = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element", "$.type") != "device"), 0)
| alter item_kind = json_extract_scalar(itm_obj, "$.type")
| filter item_kind = "mcp"
| dedup nid by desc _time
| alter alert_host   = json_extract_scalar(dev_obj, "$.data.hostname")
| alter device_id    = json_extract_scalar(dev_obj, "$.data.id")
| alter device_os    = json_extract_scalar(dev_obj, "$.data.os")
| alter last_user    = json_extract_scalar(dev_obj, "$.data.last_logged_on_user")
| alter mcp_name     = json_extract_scalar(itm_obj, "$.name")
| alter mcp_id       = json_extract_scalar(itm_obj, "$.data.mcp_id")
| alter mcp_type     = json_extract_scalar(itm_obj, "$.data.mcp_type")
| alter mcp_transport= json_extract_scalar(itm_obj, "$.data.transport")
| alter mcp_risk     = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter item_id      = arrayindex(arraymap(arrayfilter(obs_arr, json_extract_scalar("@element", "$.name") = "item.id"), json_extract_scalar("@element", "$.value")), 0)
| alter policy_id    = json_extract_scalar(finding_info, "$.uid")
| alter policy_title = json_extract_scalar(finding_info, "$.title")
| fields _time, nid, policy_id, policy_title, severity, risk_level,
         alert_host, device_id, device_os, last_user,
         mcp_name, mcp_id, mcp_type, mcp_transport, mcp_risk, item_id
| sort desc _time
| limit 200
```


_Interpretation:_ The canonical Alerts-parsing idiom for this dataset, and the one query where getting it wrong changes the answer by two orders of magnitude: 734 raw Alerts rows in 24h collapse to exactly 3 real alerts. `dedup nid by desc _time` is what does it. Every field an analyst needs is a JSON string that has to be unpacked — and the top-level `hostname` column is NULL on every Alerts row, so alert_host can ONLY come from resources[type=device].data.hostname. Resource order is not fixed (device was index 1 in the samples inspected, but nothing guarantees it), so arrayfilter on @element is used rather th


_False positives:_ None from deduplication — nid is the correct identity. The `item_kind != "device"` heuristic for itm_obj picks the first non-device resource; an alert carrying several non-device resources would only surface the first. risk_level "pending" on all three rows means Koi has not finished scoring them, not that they are safe.


### D8 — MCP server runtime evidence in XDR

**Purpose:** investigation · **Status:** validated (26 rows on this tenant) · **Datasets:** xdr_data (PROCESS)


KOI found an MCP server in a config file — has it actually been launched?


_Parameters:_ koi_host = alert_host from D7; the filter is omitted below so the worked example sweeps the fleet. Optionally narrow further with the mcp_name from D7. Worked example: fleet-wide, 24h.


```sql
// KOI Ext - MCP Server Audit, step "is this MCP server actually running here".
// KOI reports MCP servers from configuration files; only XDR proves one executed.
// Matches the standard MCP launch shapes rather than the bare token "mcp", which also
// matches any analyst tooling that happens to mention it.
// PARAM: koi_host  = alert_host from D7 (drop the filter to sweep the fleet)
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter cmd_lc = lowercase(coalesce(action_process_image_command_line, ""))
| filter cmd_lc contains "@modelcontextprotocol"
     or cmd_lc contains "mcp-server"
     or cmd_lc contains "mcp_server"
     or cmd_lc contains "mcp-gateway"
     or cmd_lc contains "-m mcp"
| alter mcp_launcher = if(cmd_lc contains "npx", "npx",
                       if(cmd_lc contains "uvx", "uvx",
                       if(cmd_lc contains "node", "node",
                       if(cmd_lc contains "python", "python", "other"))))
| fields _time, agent_hostname, mcp_launcher, action_process_image_name, action_process_image_path,
         action_process_image_command_line, action_process_username, action_process_cwd,
         action_process_signature_status, actor_process_image_name, actor_process_command_line
| sort desc _time
| limit 200
```


_Interpretation:_ The intended pairing for D7: KOI discovers MCP servers by reading configuration, which proves declaration but not execution; only PROCESS telemetry proves a server was launched. BE HONEST ABOUT WHAT THIS RETURNED — all 26 rows on this tenant are FALSE POSITIVES. The three MCP-alerting devices from D7 (M-DQ3HT4R1P7, M-HFQQ44F5XF, Gary's MacBook Air) are Macs with no Cortex XDR agent, so there is zero genuine MCP runtime telemetry available to correlate. Every hit is analyst tooling on OfficeiMac whose command line happens to contain "mcp-server" or "mcp-gateway" — python one-liners reading play


_False positives:_ Substantial, and demonstrated above: any command line mentioning an MCP package name matches, including the analyst's own investigation. Mitigations that would cut it sharply — require actor_process_image_name to be a known agent host (claude, code.exe, cursor.exe, Claude.app), exclude interactive `-c` inline scripts, and pin agent_hostname to a device D7 actually flagged. `-m mcp` will also match


### D9 — Item version drift — current state per host

**Purpose:** investigation · **Status:** validated (8 rows on this tenant) · **Datasets:** koi_koi_raw (Audit only)


Which version of this item is on each host right now, and is it still there at all?


_Parameters:_ item_key / item_name = inputs.item_id (KOI Ext - Investigate Item / Enrich Item). Worked example: "anthropic.claude-code", 30d.


```sql
// KOI Ext - Investigate Item / Enrich Item, step "which version is where right now".
// dedup keeps the newest audit row per host, so this is CURRENT state, not history.
// PARAM: item_key / item_name = inputs.item_id (pass twice if that is all you have)
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter object_id = "anthropic.claude-code" or object_name = "anthropic.claude-code"   // PARAM
| filter hostname != null
| dedup hostname by desc _time
| alter still_present   = if(action = "uninstalled", "no", "yes")
| alter current_version = item_version
| alter days_since_change = timestamp_diff(current_time(), _time, "DAY")
| fields hostname, still_present, current_version, action, marketplace, platform,
         _time as last_change_time, days_since_change, triggered_by, message
| sort desc last_change_time
| limit 500
```


_Interpretation:_ The present-tense complement to D1/D6 — those give every version ever seen, this gives the one that is there now. `dedup hostname by desc _time` reduces to the newest audit row per host and still_present reads its action. On anthropic.claude-code: 4 hosts still carry it at four different versions — mzpanw-w11-koi at 2.1.207 (8 days stale), M-HFQQ44F5XF at 2.1.209 (6 days), piusco at 2.1.201 (14 days), LAB-WIN10-02 at 2.1.185 (28 days) — while Greg's Mac mini, M-DQ3HT4R1P7, Vincent's MacBook Pro and LAB-WIN11-01 have removed it. A four-version spread across four hosts with the oldest 24 release


_False positives:_ days_since_change measures time since the last KOI-observed change, not time since the last scan — on a host where KOI has not run recently (check with D3c) a large value means "no scan", not "stable". Bounded by the query timeframe: a host whose only event predates the window is missing entirely, so run at 30d or longer. still_present "yes" on an `updated` or `installed` row is a safe read; there


---

## Summary

45 queries across 4 themes — 41 validated against live data, 4 parse-confirmed heavy joins (B10, B3, B8, B9). Per theme: A=8, B=12, C=13, D=12.


Query bodies are in `docs/xql/<id>.xql`. Highest value: **B8** (KOI-scored risk observed executing), **B9** (shadow MCP — running but never inventoried), **C4** (KOI last-scan-age per host), **A5/A6** (bidirectional coverage gaps).
