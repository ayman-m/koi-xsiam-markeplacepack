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
