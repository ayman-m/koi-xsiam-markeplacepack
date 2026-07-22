// KOI Ext - Block and Remediate, pre-block step "who else has this item, and is it already handled".
// PARAM: item_key  = inputs.item_id
// PARAM: item_name = the display name (pass item_id twice if that is all you have)
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter object_id = "anthropic.claude-code" or object_name = "anthropic.claude-code"   // PARAM
| alter scope  = coalesce(hostname, "<org-level event, no host>")
| alter signal = if(type = "remediation", concat("remediation:", coalesce(action, "?")),
                 if(type = "policies",    concat("policy:",      coalesce(action, "?")),
                                          concat("inventory:",   coalesce(action, "?"))))
| comp max(_time)           as last_signal,
       min(_time)           as first_signal,
       count()              as koi_events,
       values(signal)       as signals,
       values(item_version) as versions,
       values(marketplace)  as marketplaces
     by scope
| alter already_remediated = if(arraystring(signals, ",") contains "remediation:", "yes", "no")
| alter listed_by_policy   = if(arraystring(signals, ",") contains "policy:",       "yes", "no")
| sort desc last_signal
| limit 500
