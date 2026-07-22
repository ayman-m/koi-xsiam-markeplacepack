// Theme B / B11 - KOI's agentic supply-chain churn: what AI tooling is being installed,
// updated and removed across the estate, from the Audit stream.
// Audit is NOT duplicated (1.0 ratio) - one row per real change, so count() is safe here.
// This is the KOI-only baseline that B8 and B9 are measured against.
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| alter nm = lowercase(coalesce(object_name, ""))
| alter agentic_class = if(
      nm contains "mcp" or nm contains "modelcontextprotocol",             "mcp_server",
      nm contains "claude" or nm contains "anthropic",                     "claude_tooling",
      nm contains "copilot",                                              "copilot_tooling",
      nm contains "cursor" or nm contains "windsurf" or nm contains "antigravity", "agentic_ide",
      nm contains "openai" or nm contains "chatgpt" or nm contains "codex", "openai_tooling",
      nm contains "ollama" or nm contains "llama" or nm contains "llm",     "local_model_runtime",
      nm contains "langchain" or nm contains "langgraph" or nm contains "llamaindex"
        or nm contains "crewai" or nm contains "autogen",                   "agent_framework",
      nm contains "agent" or nm contains "subagent",                        "agent_named_item",
      null)
| filter agentic_class != null
// marketplace is null for Claude Code skills/plugins on this tenant - keep them, label them.
| alter source = coalesce(marketplace, "local_agent_config")
| comp count() as events,
       count_distinct(hostname) as devices,
       count_distinct(item_version) as versions,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agentic_class, source, object_name, action
| sort desc devices, desc events
