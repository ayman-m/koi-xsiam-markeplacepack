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
