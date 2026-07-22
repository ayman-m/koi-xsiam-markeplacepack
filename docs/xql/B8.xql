// Theme B / B8 - RISK THAT IS NOT THEORETICAL.
// A KOI-scored MCP server or agentic package that is ALSO observed EXECUTING in XDR endpoint
// telemetry. KOI alone says "you own something dangerous". XDR alone says "something ran".
// Only the intersection says "the dangerous thing is live on this host, right now".
// Detection - the highest-value query in the Theme B set.
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
// Normalise the executed entrypoint to the bare package name KOI would inventory:
//   "@playwright/mcp@latest"                     -> "@playwright/mcp"   (stop at the @version)
//   ".../node_modules/.bin/playwright-mcp"       -> "playwright-mcp"    (last path segment)
//   "start-mcp-server"                           -> "start-mcp-server"
| alter exec_pkg = if(mcp_entrypoint contains "/node_modules/" or mcp_entrypoint contains "/bin/",
        arrayindex(regextract(mcp_entrypoint, "([^/]+)$"), 0),
        arrayindex(regextract(mcp_entrypoint, "^(@?[a-z0-9._\-]+/?[a-z0-9._\-]*)"), 0))
| comp count() as spawns, min(_time) as first_exec, max(_time) as last_exec
   by agent_hostname, causality_actor_process_image_name, exec_pkg
// KOI's verdict for the same package. Alerts carry the scored inventory in resources[0],
// as either an `mcp` resource (MCP servers) or an `item` resource (everything else);
// both expose data.package_name and data.risk_level, so handle them together.
| join type = inner (
      dataset = koi_koi_raw
      | filter source_log_type = "Alerts"
      | alter res = to_json_string(resources)
      | alter r0type = json_extract_scalar(res, "$.0.type")
      | filter r0type = "mcp" or r0type = "item"
      // MANDATORY: the integration re-sends every open alert each 1-minute fetch cycle
      // (~245x duplication). Dedupe on the notification event id, never on _id.
      | alter koi_event_id = json_extract_scalar(metadata, "$.notification_event_id")
      | dedup koi_event_id
      | alter
          koi_pkg       = lowercase(json_extract_scalar(res, "$.0.data.package_name")),
          koi_risk      = json_extract_scalar(res, "$.0.data.risk_level"),
          koi_market    = json_extract_scalar(res, "$.0.data.marketplace"),
          koi_transport = json_extract_scalar(res, "$.0.data.transport"),
          koi_res_type  = r0type,
          koi_device    = json_extract_scalar(res, "$.1.data.hostname")
      | comp count_distinct(koi_device) as koi_devices, max(_time) as koi_last_alert
         by koi_pkg, koi_risk, koi_market, koi_transport, koi_res_type
  ) as koi koi.koi_pkg = exec_pkg
| alter verdict = if(
      koi.koi_risk = "critical" or koi.koi_risk = "high", "CONFIRMED_RISK_EXECUTING",
      koi.koi_risk = "medium",                            "MEDIUM_RISK_EXECUTING",
      koi.koi_risk = "pending",                           "UNSCORED_BUT_EXECUTING",
                                                          "SCORED_LOW_EXECUTING")
| fields agent_hostname, causality_actor_process_image_name, exec_pkg, verdict,
         koi.koi_risk, koi.koi_res_type, koi.koi_transport, koi.koi_market,
         koi.koi_devices, koi.koi_last_alert, spawns, first_exec, last_exec
| sort desc spawns
