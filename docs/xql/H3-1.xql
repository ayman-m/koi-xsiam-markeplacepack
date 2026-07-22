// H3-1 HYPOTHESIS: an AI agent app or a locally-spawned MCP/interpreter runtime
// (node/npx/python/uv/deno/bun) should rarely launch an OS shell. A shell child of an
// agent tree = agent-initiated shell execution (prompt-injection / poisoned-tool pivot).
// HIT = a shell an AI agent or interpreter caused to run; triage its cmdline + children.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter child  = lowercase(coalesce(action_process_image_name, "")),
        parent = lowercase(coalesce(actor_process_image_name, "")),
        root   = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter child in ("cmd.exe","powershell.exe","pwsh.exe","powershell","pwsh","bash","sh","zsh","dash","ksh")
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root contains "copilot"
      or root contains "ollama" or root = "code" or root = "code.exe"
      or parent in ("node","node.exe","npx","npx.cmd","python","python.exe","python3","uv","uvx","uv.exe","uvx.exe","bun","deno")
| alter agent_owner = if(
      root contains "claude","claude", root contains "cursor","cursor",
      root contains "antigravity","antigravity", root contains "windsurf","windsurf",
      root contains "codex","codex", root contains "copilot","copilot",
      root contains "ollama","ollama", root contains "code","vscode_family","runtime_parent")
| comp count() as shell_spawns,
       count_distinct(action_process_image_command_line) as distinct_cmdlines,
       min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, agent_owner, causality_actor_process_image_name, parent, child
| sort desc shell_spawns
| limit 50
