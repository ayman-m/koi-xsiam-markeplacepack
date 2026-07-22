// KOI Ext - Investigate Device, step "recent supply-chain changes on this device".
// PARAM: koi_host  = inputs.hostname
// PARAM: lookback  = set on the query timeframe (7d used in the worked example)
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter hostname = "win-workstation"                                  // PARAM
| alter change_class = if(type = "remediation", "remediation",
                       if(action in ("installed", "updated"), "acquisition",
                       if(action = "uninstalled", "removal", "other")))
| alter agentic_surface = if(platform in ("claude_code", "vsc", "cursor", "jet", "npp"), "agent_or_ide",
                          if(platform in ("chrome", "edge"), "browser", "os_package"))
| fields _time, change_class, agentic_surface, action, type, object_name, object_id,
         item_version, marketplace, platform, category, triggered_by, message
| sort desc _time
| limit 300
