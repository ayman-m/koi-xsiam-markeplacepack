dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_image_command_line contains "Koi"
| fields _time, agent_hostname, action_process_image_name, action_process_image_path, action_process_image_command_line, actor_process_image_name, action_process_username
| limit 15
