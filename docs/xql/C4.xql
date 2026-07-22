dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path ~= "(?i)AppData.Local.Koi.Python"
| alter koi_launch_kind = if(action_process_image_command_line ~= "(?i)\.pyz", "scan_zipapp_pyz",
                          if(action_process_image_command_line ~= "(?i)\.py\s*$", "launcher_py", "other"))
| comp count() as n, min(_time) as first, max(_time) as last by agent_hostname, koi_launch_kind
