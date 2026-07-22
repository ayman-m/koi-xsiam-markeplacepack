dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path contains "Koi" or action_process_image_command_line contains "Koi" or actor_process_command_line contains "Koi"
| comp count() as n,
       min(_time) as first_seen,
       max(_time) as last_seen
  by agent_hostname, action_process_image_name, action_process_image_path, actor_process_image_name
| sort desc n
| limit 40
