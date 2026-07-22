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
