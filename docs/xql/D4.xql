// KOI Ext - Alert Triage, war-room summary step "acquisition timeline for this host".
// Two lanes on one clock: what KOI says arrived, and which process was running when it did.
// PARAM: koi_host = KoiContext.alert_hostname (must equal xdr_data.agent_hostname)
// PARAM: window   = the query timeframe (24h in the worked example)
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter hostname = "win-workstation"                                   // PARAM
| filter action in ("installed", "updated")
| alter lane = "1_KOI_SAYS_ARRIVED"
| alter what = concat(object_name, " @", coalesce(item_version, "?"))
| alter how  = concat(coalesce(marketplace, "<unset>"), " / ", coalesce(platform, "?"))
| alter who  = coalesce(triggered_by, "-")
| fields _time, lane, what, how, who
| union
(dataset = xdr_data
 | filter event_type = ENUM.PROCESS
 | filter agent_hostname = "win-workstation"                            // PARAM (same host)
 | filter action_process_image_name in ("pip.exe", "pip3.exe", "npm.exe", "npx.exe", "node.exe",
                                        "git.exe", "curl.exe", "wget.exe", "winget.exe",
                                        "msiexec.exe", "choco.exe", "code.exe", "cursor.exe")
 // drop Electron/Chromium helper processes - they are not acquisition, just IDE internals
 | filter action_process_image_command_line not contains "--type="
 | alter lane = "2_XDR_BROUGHT_IT"
 | alter what = coalesce(action_process_image_command_line, action_process_image_name)
 | alter how  = concat(coalesce(actor_process_image_name, "?"), " -> ", coalesce(action_process_image_name, "?"))
 | alter who  = coalesce(action_process_username, "-")
 | fields _time, lane, what, how, who)
| sort asc _time
| limit 400
