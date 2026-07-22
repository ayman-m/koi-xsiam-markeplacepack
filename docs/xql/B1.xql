// Theme B / B1 - Agentic runtime inventory: which AI-agent / coding-agent software is
// actually EXECUTING in the estate. Run this first; it defines the surface every other
// Theme B detection is tuned against.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    proc = lowercase(coalesce(action_process_image_name, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, "")),
    cmd  = lowercase(coalesce(action_process_image_command_line, ""))
// Classify by the CAUSALITY GROUP OWNER (the root of the tree), not the leaf: an MCP
// server is a bare `node`/`python`, and only the CGO says which agent owns it.
| alter agent_family = if(
      root contains "claude"      or proc contains "claude",      "claude",
      root contains "cursor"      or proc contains "cursor",      "cursor",
      root contains "antigravity" or proc contains "antigravity", "antigravity",
      root contains "windsurf"    or proc contains "windsurf",    "windsurf",
      root contains "copilot"     or proc contains "copilot",     "copilot",
      root contains "codex"       or proc contains "codex",       "codex",
      root contains "ollama"      or proc contains "ollama",      "ollama",
      root contains "code"        or proc contains "code",        "vscode_family",
      cmd contains "mcp",                                         "mcp_unattributed",
      null)
| filter agent_family != null
| comp count() as events,
       count_distinct(action_process_image_name) as distinct_child_images,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, agent_family, causality_actor_process_image_name
| sort desc events
