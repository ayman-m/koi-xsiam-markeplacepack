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
