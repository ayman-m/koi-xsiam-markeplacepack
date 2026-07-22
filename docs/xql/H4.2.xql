dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    proc = lowercase(coalesce(action_process_image_name, "")),
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, ""))
| alter kind = if(
      cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd contains "mcp-server" or cmd contains "modelcontextprotocol", "mcp_server",
      proc contains "claude" or proc contains "cursor" or proc contains "ollama" or proc contains "windsurf" or proc contains "antigravity" or proc contains "copilot" or proc contains "codex", "ai_agent",
      null)
| filter kind != null
| alter mcp_entry = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
| alter exec_token = lowercase(if(kind = "mcp_server",
        if(mcp_entry contains "/node_modules/" or mcp_entry contains "/bin/", arrayindex(regextract(mcp_entry, "([^/]+)$"), 0), arrayindex(regextract(mcp_entry, "([^/@]+)$"), 0)),
        arrayindex(regextract(proc, "([a-z0-9]+)"), 0)))
| filter exec_token != null and exec_token != ""
| comp count() as spawns, min(_time) as first_exec, max(_time) as last_exec by agent_hostname, kind, exec_token, causality_actor_process_image_name
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter khost = lowercase(hostname)
    | comp count() as koi_events by khost
  ) as cov cov.khost = lowercase(agent_hostname)
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and object_type = "item"
    | alter nm = lowercase(coalesce(object_name, ""))
    | alter koi_token = arrayindex(regextract(nm, "([a-z0-9][a-z0-9._+-]*)$"), 0)
    | filter koi_token != null and koi_token != ""
    | comp count() as koi_seen by koi_token
  ) as koi koi.koi_token = exec_token
| alter coverage = if(koi_seen = null, "SHADOW_NOT_IN_KOI", "known_to_koi")
| fields agent_hostname, kind, exec_token, causality_actor_process_image_name, spawns, first_exec, last_exec, koi_seen, coverage
| sort asc coverage, desc spawns
| limit 100
