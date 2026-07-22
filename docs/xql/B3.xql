// Theme B / B3 - Full child-process tree of one AI agent on one host.
// Playbook-facing: given a host (and optionally a specific agent app) this reconstructs
// everything the agent caused to run - MCP servers, shells, package managers, git, curl.
// Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
// PARAM: hostname
| filter agent_hostname = "OfficeiMac"
// PARAM: agent application (the causality group owner). Widen or drop to see all agents.
| filter causality_actor_process_image_name in ("Claude", "Cursor", "Code", "Antigravity.exe",
                                                "Windsurf.exe", "ollama app.exe")
| alter cmd = coalesce(action_process_image_command_line, "")
| alter activity = if(
      lowercase(cmd) ~= "[/@\-]mcp([\-/@\s\"']|$)" or lowercase(cmd) ~= "mcp-server", "mcp_server",
      action_process_image_name in ("npm", "npx", "pip", "pip3", "uv", "uvx", "yarn", "pnpm",
                                    "brew", "gem", "cargo", "go"),                     "package_manager",
      action_process_image_name in ("zsh", "bash", "sh", "cmd.exe", "powershell.exe"),  "shell",
      action_process_image_name in ("curl", "wget", "git", "gh", "ssh", "scp"),         "network_tool",
      action_process_image_name in ("node", "python", "python3", "python3.12", "Python"), "interpreter",
                                                                                        "other")
| comp count() as executions,
       count_distinct(action_process_image_command_line) as distinct_cmdlines,
       min(_time) as first_seen,
       max(_time) as last_seen
   by causality_actor_process_image_name, activity, actor_process_image_name,
      action_process_image_name, action_process_username
| sort desc executions
