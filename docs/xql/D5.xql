// KOI Ext - Alert Triage, step "what else happened around this alert".
// The alert is deduped upstream on metadata.notification_event_id - this takes the ONE
// surviving alert's host and time and rebuilds the hour either side of it.
// PARAM: alert_host    = KoiContext.alert_hostname (resources[type=device].data.hostname)
// PARAM: alert_time_ms = the alert _time, epoch MILLISECONDS
// PARAM: radius_min    = +/- minutes (60 below)
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter hostname = "win-workstation"                                        // PARAM
| alter mins_from_alert = timestamp_diff(_time, to_timestamp(1784627286000, "MILLIS"), "MINUTE")  // PARAM
| filter abs(mins_from_alert) <= 60
| alter lane   = "KOI_SUPPLY_CHAIN"
| alter detail = coalesce(message, concat(coalesce(action, "?"), " ", coalesce(object_name, "?")))
| fields _time, mins_from_alert, lane, detail
| union
(dataset = xdr_data
 | filter event_type = ENUM.PROCESS
 | filter agent_hostname = "win-workstation"                                 // PARAM
 | alter mins_from_alert = timestamp_diff(_time, to_timestamp(1784627286000, "MILLIS"), "MINUTE")  // PARAM
 | filter abs(mins_from_alert) <= 60
 | alter lane   = if(actor_process_image_path contains "Koi", "KOI_AGENT_SCAN", "XDR_EXECUTION")
 | alter detail = coalesce(action_process_image_command_line, action_process_image_name)
 | fields _time, mins_from_alert, lane, detail)
| union
(dataset = xdr_data
 | filter event_type = ENUM.NETWORK
 | filter agent_hostname = "win-workstation"                                 // PARAM
 // only egress from processes that can pull code - browsers/telemetry are noise here
 | filter actor_process_image_name in ("git.exe", "pip.exe", "pip3.exe", "npm.exe", "npx.exe",
                                       "node.exe", "curl.exe", "wget.exe", "python.exe",
                                       "winget.exe", "msiexec.exe")
 | alter mins_from_alert = timestamp_diff(_time, to_timestamp(1784627286000, "MILLIS"), "MINUTE")  // PARAM
 | filter abs(mins_from_alert) <= 60
 | alter lane   = "XDR_EGRESS"
 | alter detail = concat(coalesce(actor_process_image_name, "?"), " -> ",
                         coalesce(action_remote_ip, "?"), ":", to_string(action_remote_port),
                         " (", coalesce(action_country, "?"), ")")
 | fields _time, mins_from_alert, lane, detail)
| sort asc _time
| limit 500
