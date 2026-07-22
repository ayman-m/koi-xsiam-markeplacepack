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
