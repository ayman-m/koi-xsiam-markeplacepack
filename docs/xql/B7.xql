// Theme B / B7 - KOI's MCP server inventory, deduplicated, with its risk verdict.
// KOI does not ship MCP servers as their own event type. They arrive as an `mcp` RESOURCE
// inside an OCSF-ish alert: resources[0] is the MCP server, resources[1] is the device.
// CRITICAL: the integration re-sends every still-open alert on each 1-minute fetch cycle
// (~245x duplication over 24h). Dedupe on metadata.notification_event_id - never count()
// rows, never dedupe on _id. finding_info.uid is the POLICY id, not an alert id.
// Investigation.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter res = resources
| filter json_extract_scalar(res, "$[0].type") = "mcp"
| alter evid = json_extract_scalar(metadata, "$.notification_event_id")
| dedup evid
| fields evid, message, risk_level, severity, res
| limit 200
