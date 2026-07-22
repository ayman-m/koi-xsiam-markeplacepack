// KOI Ext - MCP Server Audit, step "is this MCP server actually running here".
// KOI reports MCP servers from configuration files; only XDR proves one executed.
// Matches the standard MCP launch shapes rather than the bare token "mcp", which also
// matches any analyst tooling that happens to mention it.
// PARAM: koi_host  = alert_host from D7 (drop the filter to sweep the fleet)
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter cmd_lc = lowercase(coalesce(action_process_image_command_line, ""))
| filter cmd_lc contains "@modelcontextprotocol"
     or cmd_lc contains "mcp-server"
     or cmd_lc contains "mcp_server"
     or cmd_lc contains "mcp-gateway"
     or cmd_lc contains "-m mcp"
| alter mcp_launcher = if(cmd_lc contains "npx", "npx",
                       if(cmd_lc contains "uvx", "uvx",
                       if(cmd_lc contains "node", "node",
                       if(cmd_lc contains "python", "python", "other"))))
| fields _time, agent_hostname, mcp_launcher, action_process_image_name, action_process_image_path,
         action_process_image_command_line, action_process_username, action_process_cwd,
         action_process_signature_status, actor_process_image_name, actor_process_command_line
| sort desc _time
| limit 200
