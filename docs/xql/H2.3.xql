// HUNT H2.3 - Exfiltration-capable items living on AGENTIC platforms.
// HYPOTHESIS: an exfil-flagged item is far more dangerous inside an AI agent / MCP host
//   (claude_code, cursor/cur, openclaw, talon) - the agent feeds it secrets, source, AI chats.
// HIT = an Exfils*/DataExport-flagged item whose install PLATFORM is an agentic runtime.
// RECONSTRUCTED: the curation input truncated the source mid-query. The Alerts/findings
//   extraction is verbatim from validated H2.1; the Audit join follows the validated A3
//   bare-column pattern. STATUS: not-run - VALIDATE before production use.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_name = json_extract_scalar(itm_obj, "$.name")
| alter item_key  = lowercase(json_extract_scalar(itm_obj, "$.data.item_id"))
| alter alert_host= json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
| alter exfil = arrayfilter(f_ids, "@element" in (
      "ExfilsCloudandRemoteAccessSecrets", "ExfilsAIChatConversations", "ExfilsBrowsingHistory",
      "17c8aecd-789e-4673-b819-a188803ef742", "c9effed6-8317-4778-a801-b787a5847bb5",
      "DataExportCapability"))
| alter exfil_cnt = array_length(exfil)
| dedup nid by desc _time
| filter exfil_cnt > 0
| fields item_name, item_key, alert_host, exfil, nid, _time
// cross to KOI's inventory side (Audit) for the install PLATFORM of the same item_id.
// join key alert item.data.item_id == audit object_id is verified; joined cols referenced BARE.
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "extensions" and action != "uninstalled"
    | alter ag_key = lowercase(object_id)
    | filter ag_key != null
    | comp values(platform) as platforms, values(hostname) as audit_hosts by ag_key
  ) as ag ag.ag_key = item_key
// PARAM: agentic runtime platform set - widen with claude, claude_desktop, cur, kiro, ollama
| alter on_agent = arrayfilter(platforms, "@element" in ("claude_code","cur","openclaw","talon"))
| filter array_length(on_agent) > 0
| fields _time, item_name, item_key, alert_host, exfil, platforms, audit_hosts, nid
| sort desc _time
| limit 200
