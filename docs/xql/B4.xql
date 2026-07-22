// Theme B / B4 - Network egress attributed to an AI agent's process tree.
// NOTE ON FIELDS (verified on this tenant): on NETWORK events action_process_image_name is
// ALWAYS NULL - the process identity is actor_process_image_name, and the owning application
// is causality_actor_process_image_name. dns_query_name is NOT populated here (0 of 15616
// agent-owned NETWORK rows), so DNS-name pivots are unavailable; use action_external_hostname.
// Detection (unexpected country / port) + Investigation (per-host egress profile).
dataset = xdr_data
| filter event_type = ENUM.NETWORK
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root = "code" or root = "code.exe"
| filter action_network_is_loopback = false or action_network_is_loopback = null
| alter dest = coalesce(action_external_hostname, action_remote_ip)
| comp count() as flows,
       count_distinct(action_remote_ip) as distinct_ips,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, actor_process_image_name,
      action_country, action_remote_port, dest
| sort desc flows
