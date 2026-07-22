// HUNT H2.6 - Critical/high known-bad that is NOT under governance.
// HYPOTHESIS: KOI alerts on critical/high items, but the tenant blocklist is EMPTY (verified:
//   0 blocklist_items_added audit actions) and many carry no remediation. Known-bad with no
//   block and no remediation = an open, accepted risk.
// HIT = a critical/high alerting item with NO remediation audit record.
// Left anti-join: Alerts(known-bad) vs Audit(remediation). Blocklist governance is null here.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_key = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_name= json_extract_scalar(itm_obj, "$.name")
| alter item_risk= json_extract_scalar(itm_obj, "$.data.risk_level")
| alter alert_host = json_extract_scalar(dev_obj, "$.data.hostname")
| filter item_risk in ("critical","high") and item_key != null
| dedup item_key by desc _time
| fields item_key, item_name, item_risk, alert_host
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "remediation"
    | alter rem_key = object_id, rem_action = action
    | dedup rem_key by desc _time
    | fields rem_key, rem_action
  ) as rem  rem.rem_key = item_key
| filter rem_action = null
| fields item_name, item_key, item_risk, alert_host, rem_action
| sort desc item_risk
| limit 200
