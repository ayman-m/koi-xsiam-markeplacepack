// HUNT H2.4 - MCP servers whose DECLARED IDENTITY is a raw command / loopback / stub
//            (tool-shadowing / tool-poisoning provenance shape).
// HYPOTHESIS: a real MCP server is a named, registry-backed package. A shadow/poisoned tool
//   announces itself as a bare stdio command, a localhost URL, or a 'stub'/'poisoned' script
//   with no marketplace provenance - its tool descriptions cannot be trusted.
// HIT = an mcp-kind item with no registry provenance shape (and often critical/pending risk).
// DATA NOTE (VERIFIED): mcp-kind alert resources carry an EMPTY data.findings.findings array
//   on this tenant. The ToolShadowing/ToolDescriptionMismatch finding_ids are only in the KOI
//   API /inventory/search, NOT in koi_koi_raw. This hunt pivots on provenance SHAPE instead.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| filter json_extract_scalar(itm_obj, "$.type") = "mcp"
| alter mcp_name     = json_extract_scalar(itm_obj, "$.name")
| alter mcp_risk     = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter mcp_transport= json_extract_scalar(itm_obj, "$.data.transport")
| alter mcp_market   = json_extract_scalar(itm_obj, "$.data.marketplace")
| alter alert_host   = json_extract_scalar(dev_obj, "$.data.hostname")
| alter name_lc = lowercase(mcp_name)
| alter shape = if(name_lc contains "poison" or name_lc contains "stub", "named_malicious_stub",
                if(name_lc contains "localhost" or name_lc contains "127.0.0.1", "loopback_endpoint",
                if(name_lc contains ".js" or name_lc contains "node " or name_lc contains "python" or name_lc contains " -m ", "raw_stdio_command",
                if(mcp_market = null or mcp_market = "", "no_provenance", "registry_backed"))))
| dedup nid by desc _time
| filter shape != "registry_backed"
| fields _time, mcp_name, mcp_risk, mcp_transport, mcp_market, shape, alert_host, nid
| sort desc _time
| limit 200
