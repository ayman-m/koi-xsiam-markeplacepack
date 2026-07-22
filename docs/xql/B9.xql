// Theme B / B9 - Shadow MCP: an MCP server EXECUTING on an endpoint that KOI has not
// inventoried. KOI is run-on-demand on Windows - no resident agent - so a server installed
// and used between two scans is invisible on the supply-chain side while fully visible in
// endpoint telemetry. This is the coverage-gap detection neither dataset can produce alone.
// Detection.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, ""))
| filter proc in ("node", "node.exe", "npx", "npx.cmd", "env", "python", "python.exe",
                  "python3", "python3.12", "python3.13", "uv", "uvx", "uv.exe", "uvx.exe",
                  "bun", "deno", "docker", "podman")
| filter cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd ~= "mcp-server" or cmd contains "modelcontextprotocol"
| alter mcp_entrypoint = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
| alter exec_pkg = if(mcp_entrypoint contains "/node_modules/" or mcp_entrypoint contains "/bin/",
        arrayindex(regextract(mcp_entrypoint, "([^/]+)$"), 0),
        arrayindex(regextract(mcp_entrypoint, "^(@?[a-z0-9._\-]+/?[a-z0-9._\-]*)"), 0))
| comp count() as spawns, min(_time) as first_exec, max(_time) as last_exec
   by agent_hostname, causality_actor_process_image_name, exec_pkg
// LEFT join against everything KOI knows about, from BOTH streams:
// Audit object_name (the reliable, non-duplicated install/update record) and the scored
// Alerts inventory. A null right side means KOI has never seen this package at all.
| join type = left (
      dataset = koi_koi_raw
      | filter source_log_type = "Audit" and object_type = "item"
      | alter koi_pkg = lowercase(object_name)
      | comp count() as koi_audit_events, max(_time) as koi_last_seen by koi_pkg
  ) as koi koi.koi_pkg = exec_pkg
| alter koi_coverage = if(koi_pkg = null, "SHADOW_MCP_NOT_IN_KOI", "KNOWN_TO_KOI")
| fields agent_hostname, causality_actor_process_image_name, exec_pkg, koi_coverage,
         koi_audit_events, koi_last_seen, spawns, first_exec, last_exec
| sort asc koi_coverage, desc spawns
