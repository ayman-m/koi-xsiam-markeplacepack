// Theme B / B6 - An AI agent or one of its MCP servers touching a secret store.
// This is the concrete harm behind "agentic runtime risk": an MCP server runs with the full
// privilege of the user who started it, so a poisoned tool or an injected prompt reads
// ~/.ssh, .env, cloud tokens or a browser profile with no further exploitation needed.
// Detection.
dataset = xdr_data
| filter event_type = ENUM.FILE
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
// Scope to agent-owned process trees FIRST. An unscoped FILE scan on this tenant is ~115k
// rows/day on one host alone and the aggregation will not return.
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root contains "codex" or root = "code" or root = "code.exe"
| alter p = lowercase(coalesce(action_file_path, ""))
// Separator-free tokens on purpose: one expression then matches both the POSIX and the
// Windows form of each path. Do NOT write backslashes inside XQL string literals here -
// "\\temp\\" is a parse error; only comments may contain them.
| alter secret_class = if(
      p contains ".ssh" or p contains "id_rsa" or p contains "id_ed25519",      "ssh_key",
      p contains ".aws",                                                        "aws_credentials",
      p contains "gcloud",                                                      "gcp_credentials",
      p contains ".kube",                                                       "kubeconfig",
      p contains ".npmrc" or p contains ".pypirc" or p contains ".netrc",       "package_registry_token",
      p contains "keychain" or p contains "credentials" or p contains "vaults", "os_credential_store",
      p contains "login data" or p contains "cookies" or p contains "web data", "browser_profile",
      p contains ".env",                                                        "dotenv",
      p contains "token",                                                       "token_file",
      null)
| filter secret_class != null
| alter access = to_string(event_sub_type)
| comp count() as events,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, actor_process_image_name,
      secret_class, access, action_file_path
| sort desc events
