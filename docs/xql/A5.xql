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
