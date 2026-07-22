// KOI Ext - MCP Server Audit, step "MCP servers currently alerting, one row per real alert".
// Alerts are re-sent on every 1-minute fetch (~245x). dedup on metadata.notification_event_id
// is MANDATORY - count() over raw rows is meaningless.
// PARAM: none (fleet-wide). Add `| filter alert_host = "<host>"` for the per-device variant.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid       = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr   = json_extract_array(resources, "$")
| alter obs_arr   = json_extract_array(observables, "$")
| alter dev_obj   = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element", "$.type") = "device"), 0)
| alter itm_obj   = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element", "$.type") != "device"), 0)
| alter item_kind = json_extract_scalar(itm_obj, "$.type")
| filter item_kind = "mcp"
| dedup nid by desc _time
| alter alert_host   = json_extract_scalar(dev_obj, "$.data.hostname")
| alter device_id    = json_extract_scalar(dev_obj, "$.data.id")
| alter device_os    = json_extract_scalar(dev_obj, "$.data.os")
| alter last_user    = json_extract_scalar(dev_obj, "$.data.last_logged_on_user")
| alter mcp_name     = json_extract_scalar(itm_obj, "$.name")
| alter mcp_id       = json_extract_scalar(itm_obj, "$.data.mcp_id")
| alter mcp_type     = json_extract_scalar(itm_obj, "$.data.mcp_type")
| alter mcp_transport= json_extract_scalar(itm_obj, "$.data.transport")
| alter mcp_risk     = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter item_id      = arrayindex(arraymap(arrayfilter(obs_arr, json_extract_scalar("@element", "$.name") = "item.id"), json_extract_scalar("@element", "$.value")), 0)
| alter policy_id    = json_extract_scalar(finding_info, "$.uid")
| alter policy_title = json_extract_scalar(finding_info, "$.title")
| fields _time, nid, policy_id, policy_title, severity, risk_level,
         alert_host, device_id, device_os, last_user,
         mcp_name, mcp_id, mcp_type, mcp_transport, mcp_risk, item_id
| sort desc _time
| limit 200
