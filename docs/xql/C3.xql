dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path ~= "(?i)AppData.Local.Koi.Python"
| comp count() as n, min(_time) as first, max(_time) as last
  by agent_hostname, action_process_image_command_line, actor_process_image_name
| sort desc n
| limit 25
