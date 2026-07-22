// Theme B / B5 - Anomalous egress from an AI agent or its MCP servers.
// An agent talking to its own model API is normal. The detection is an agent-owned process
// reaching the public internet on a NON-WEB port, or to a country outside the approved set -
// the shape a rogue MCP server or a prompt-injection-driven exfil attempt takes.
// Detection.
dataset = xdr_data
| filter event_type = ENUM.NETWORK
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root contains "codex" or root = "code" or root = "code.exe"
// public destinations only - drop loopback, RFC1918 and link-local
| filter action_network_is_loopback = false or action_network_is_loopback = null
| filter action_remote_ip != null
| filter not (incidr(action_remote_ip, "10.0.0.0/8") or incidr(action_remote_ip, "172.16.0.0/12")
           or incidr(action_remote_ip, "192.168.0.0/16") or incidr(action_remote_ip, "127.0.0.0/8")
           or incidr(action_remote_ip, "169.254.0.0/16"))
// action_country is an ENUM column. It must be cast before any string comparison, and
// to_string() yields the ISO-3166 ALPHA-2 CODE ("US"), not the label ("UNITED_STATES") that
// `comp ... by action_country` prints. Comparing against the label silently matches nothing.
// "-" is the code this tenant emits for an unresolved/private destination.
| alter country = to_string(action_country)
// PARAM: approved egress countries for AI/agent traffic (ISO alpha-2)
| alter approved_country = if(country in ("US", "IE", "GB", "NL"), true, false)
| alter web_port = if(action_remote_port in (80, 443, 8443), true, false)
| filter approved_country = false or web_port = false
| alter reason = if(approved_country = false and web_port = false, "off_country_and_off_port",
                    approved_country = false,                      "unapproved_country",
                                                                   "non_web_port")
| comp count() as flows, min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, actor_process_image_name,
      country, action_remote_ip, action_remote_port, action_external_hostname, reason
| sort desc flows
