// H3-6 HYPOTHESIS: a BARE runtime (node/python/uv/deno/bun) running as an MCP server or
// agent-spawned script - NOT the IDE binary itself - has no reason to read ~/.ssh, .aws, .env,
// .npmrc or a browser credential DB. Narrows B6 to the runtime actor and excludes the
// node_modules/site-packages build-doc FP class. HIT = an MCP/agent tool read a secret store.
dataset = xdr_data
| filter event_type = ENUM.FILE
| alter actor = lowercase(coalesce(actor_process_image_name, "")),
        root  = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter actor in ("node","node.exe","npx","npx.cmd","python","python.exe","python3","python3.12",
                   "python3.13","uv","uvx","uv.exe","uvx.exe","bun","deno")
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root contains "copilot"
      or root contains "ollama" or root contains "code"
| alter p = lowercase(coalesce(action_file_path, ""))
| filter not (p contains "node_modules" or p contains "site-packages" or p contains "dist-info")
| alter secret_class = if(
      p contains ".ssh" or p contains "id_rsa" or p contains "id_ed25519", "ssh_key",
      p contains ".aws", "aws_credentials",
      p contains "gcloud", "gcp_credentials",
      p contains ".kube", "kubeconfig",
      p contains ".npmrc" or p contains ".pypirc" or p contains ".netrc", "registry_token",
      p contains "login data" or p contains "cookies" or p contains "web data", "browser_creds",
      p contains ".env", "dotenv", null)
| filter secret_class != null
| comp count() as events, min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, root, actor, secret_class, action_file_path
| sort desc events
| limit 50
