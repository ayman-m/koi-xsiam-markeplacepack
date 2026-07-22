dataset = xdr_data
| filter event_type = ENUM.PROCESS and agent_hostname = "thor"
| filter action_process_image_name in ("pythonw.exe","python.exe") or actor_process_image_name in ("pythonw.exe")
| comp count() as n, min(_time) as first, max(_time) as last
  by action_process_image_name, action_process_image_path, actor_process_image_name, actor_process_command_line
| sort desc n
| limit 20
