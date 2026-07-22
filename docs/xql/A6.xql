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
