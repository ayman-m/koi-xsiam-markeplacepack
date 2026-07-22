dataset = xdr_data
| filter event_type = ENUM.FILE and action_file_path ~= "(?i)ProgramData.Koi"
| comp count() as n, min(_time) as first, max(_time) as last
  by agent_hostname, action_file_name, action_file_path, action_file_last_writer_actor
| sort desc n
| limit 30
