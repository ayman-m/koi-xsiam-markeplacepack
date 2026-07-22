// HUNT H2.1 - Compromise-grade findings present but unactioned (known-bad, un-triaged).
// HYPOTHESIS: KOI already scored an item with a risk 9-10 compromise-indicator finding,
//   yet it is still installed and no one has triaged it.
// HIT = a live installed item KOI itself calls malicious/spyware/exfil/typosquat, on a host.
// Pack: Marketplace KOI pack v1.2.3 -> koi_koi_raw (Alerts). Findings live on the item resource
//   at data.findings.findings[].finding_id. Alerts are re-sent ~245x/24h -> dedup is mandatory.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_kind   = json_extract_scalar(itm_obj, "$.type")
| alter item_name   = json_extract_scalar(itm_obj, "$.name")
| alter item_id     = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_risk   = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter marketplace = json_extract_scalar(itm_obj, "$.data.marketplace")
| alter alert_host  = json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
// PARAM: the compromise-grade finding_id set (all from scratchpad/findings_hunt.json, risk 9-10)
| alter hits  = arrayfilter(f_ids, "@element" in (
      "AssociatedwithMaliciousCampaign",              // 10
      "d0a50fdc-62f7-4b94-bb1a-600fec5959bc",         // 10 Malicious Activity Detected
      "ExfilsCloudandRemoteAccessSecrets",            // 10
      "RansomwareBehaviorDetected",                   // 10
      "SpywareActivity",                              // 10
      "ExfilsAIChatConversations",                    // 9
      "HighRiskManifestConfusion",                    // 9
      "PromptInjectionDetected",                      // 9
      "Typosquatting"))                               // 9
| alter hit_cnt = array_length(hits)
| dedup nid by desc _time
| filter hit_cnt > 0
| fields _time, item_kind, item_name, item_id, item_risk, marketplace, alert_host, hits, nid
| sort desc _time
| limit 200
