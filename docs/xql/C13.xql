dataset = xdr_data
| filter event_type = ENUM.FILE and agent_hostname = "win-workstation"
| filter action_file_path ~= "(?i)Koi"
| alter koi_root = arrayindex(regextract(action_file_path, "(?i)(^.{0,60}?Koi)"), 0)
| comp count() as n, min(_time) as first, max(_time) as last by koi_root
| sort desc n
| limit 20
