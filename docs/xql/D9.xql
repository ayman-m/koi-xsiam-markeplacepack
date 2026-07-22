// KOI Ext - Investigate Item / Enrich Item, step "which version is where right now".
// dedup keeps the newest audit row per host, so this is CURRENT state, not history.
// PARAM: item_key / item_name = inputs.item_id (pass twice if that is all you have)
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter object_id = "anthropic.claude-code" or object_name = "anthropic.claude-code"   // PARAM
| filter hostname != null
| dedup hostname by desc _time
| alter still_present   = if(action = "uninstalled", "no", "yes")
| alter current_version = item_version
| alter days_since_change = timestamp_diff(current_time(), _time, "DAY")
| fields hostname, still_present, current_version, action, marketplace, platform,
         _time as last_change_time, days_since_change, triggered_by, message
| sort desc last_change_time
| limit 500
