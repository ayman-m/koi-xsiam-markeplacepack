dataset = xdr_data
| filter event_type = ENUM.FILE and agent_hostname = "win-workstation"
| filter action_file_path ~= "(?i)Koi" or action_file_path ~= "(?i)SystemTemp"
| alter bucket = if(action_file_path ~= "(?i)SystemTemp", "SystemTemp", "KoiPath")
| comp count() as n, count_distinct(action_file_path) as paths, min(_time) as first, max(_time) as last
  by bucket, action_file_extension, action_file_last_writer_actor
| sort desc n
| limit 25
