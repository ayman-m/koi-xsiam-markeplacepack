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
