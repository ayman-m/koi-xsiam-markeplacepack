// Theme D / D3b - Recent supply-chain changes on a host, classified.
// The narrative feed for a device investigation: change_class says what kind of change it
// was, agentic_surface says whether it touched an agent/IDE surface or is just Chrome
// updating itself.
// Verified action vocabulary on this tenant: installed, updated, uninstalled, archived,
// unarchived, remediation_opened, remediation_executed, remediation_pending, created,
// allowlist_items_added, enabled, disabled, email_sent - plus approval_requests rows where
// action is NULL, which is why the if-chain ends in "other".
// PARAM: koi_host = inputs.hostname
// PARAM: lookback = set on the query timeframe (7d in the worked example)
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter hostname = "win-workstation"                                  // PARAM: koi_host
| alter change_class = if(type = "remediation", "remediation",
                       if(action in ("installed", "updated"), "acquisition",
                       if(action = "uninstalled", "removal", "other")))
| alter agentic_surface = if(platform in ("claude_code", "vsc", "cursor", "jet", "npp"), "agent_or_ide",
                          if(platform in ("chrome", "edge"), "browser", "os_package"))
| fields _time, change_class, agentic_surface, action, type, object_name, object_id,
         item_version, marketplace, platform, category, triggered_by, message
| sort desc _time
| limit 300
