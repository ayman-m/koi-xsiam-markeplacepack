// Theme B / B12 - The KOI-side agentic supply chain: every MCP server, AI coding tool,
// agent framework and local model runtime KOI has inventoried, and what happened to it.
// Marketplace pack "KOI" v1.2.3 - dataset koi_koi_raw, source_log_type = "Audit".
// Audit is NOT duplicated on this tenant (1.0 ratio), so count() is safe here. Only the
// Alerts stream needs the ~245x dedupe.
// Investigation - this is the inventory that B2/B8/B9 are matched against.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| alter nm = lowercase(coalesce(object_name, ""))
| filter nm contains "mcp" or nm contains "claude" or nm contains "ollama" or nm contains "cursor"
     or nm contains "copilot" or nm contains "openai" or nm contains "anthropic" or nm contains "langchain"
     or nm contains "agent" or nm contains "playwright" or nm contains "continue" or nm contains "codeium"
| comp count() as n by marketplace, object_name, action
| sort desc n
