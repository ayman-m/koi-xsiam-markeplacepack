// H3-4 HYPOTHESIS: agent process trees repeatedly hit a small set of destinations (model APIs,
// registries, telemetry). A destination reached by an agent tree that is estate-RARE (few flows,
// single host) is an outlier: new C2, exfil endpoint, or a rogue MCP phoning home. Data-driven
// rarity, NOT B5's static country/port allowlist. HIT = agent egress to a near-unique dest.
dataset = xdr_data
| filter event_type = ENUM.NETWORK
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root contains "codex" or root = "code" or root = "code.exe"
| filter action_network_is_loopback = false or action_network_is_loopback = null
| filter action_remote_ip != null
| filter action_remote_port != 53
| filter not (incidr(action_remote_ip, "10.0.0.0/8") or incidr(action_remote_ip, "172.16.0.0/12")
           or incidr(action_remote_ip, "192.168.0.0/16") or incidr(action_remote_ip, "127.0.0.0/8")
           or incidr(action_remote_ip, "169.254.0.0/16"))
| alter dest = coalesce(action_external_hostname, action_remote_ip),
        country = to_string(action_country)
| comp count() as flows,
       count_distinct(agent_hostname) as hosts,
       count_distinct(causality_actor_process_image_name) as agents,
       min(_time) as first_seen, max(_time) as last_seen
   by dest, action_remote_port, country
| filter flows <= 5 and hosts = 1
| sort asc flows
| limit 50
