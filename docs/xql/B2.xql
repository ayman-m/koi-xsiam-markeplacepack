// Theme B / B2 - MCP server execution (stdio transport).
// A local MCP server has no service of its own: the AI client spawns it as a CHILD process.
// So the signal is a generic runtime (node / npx / python / uv / docker) whose command line
// names an MCP entrypoint, sitting under an agent causality group owner.
// Detection + Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, ""))
// Only generic runtimes. Deliberately EXCLUDES shells: an analyst's own `grep mcp` in a
// zsh command line is the single biggest false positive in this dataset.
| filter proc in ("node", "node.exe", "npx", "npx.cmd", "env", "python", "python.exe",
                  "python3", "python3.12", "python3.13", "uv", "uvx", "uv.exe", "uvx.exe",
                  "bun", "deno", "docker", "podman")
// "mcp" must sit on a package-name boundary (@scope/mcp, foo-mcp, mcp-server-x), otherwise
// any file called mcp_type.py or resmcp.py matches. This one clause removes ~all noise.
| filter cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd ~= "mcp-server" or cmd contains "modelcontextprotocol"
// Pull the package/entrypoint token that carries "mcp" out of the command line.
| alter mcp_entrypoint = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
| alter agent_owner = if(
      root contains "claude",      "claude",
      root contains "cursor",      "cursor",
      root contains "antigravity", "antigravity",
      root contains "windsurf",    "windsurf",
      root contains "code",        "vscode_family",
      root contains "ollama",      "ollama",
      "UNATTRIBUTED")
| comp count() as spawns,
       min(_time) as first_spawn,
       max(_time) as last_spawn,
       count_distinct(agent_hostname) as hosts
   by agent_hostname, agent_owner, causality_actor_process_image_name, proc, mcp_entrypoint
| sort desc spawns
