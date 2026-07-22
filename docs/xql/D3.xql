// KOI Ext - Investigate Device, step "supply-chain posture by marketplace".
// dedup keeps only the LATEST audit row per item, so install/uninstall churn nets out.
// PARAM: koi_host = inputs.hostname
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter hostname = "win-workstation"                                 // PARAM
| dedup object_id, marketplace by desc _time
| filter action != "uninstalled"
| alter marketplace_event_vocab = coalesce(marketplace, "<unset>")
| comp count()               as items_present,
       values(object_name)   as item_names,
       max(_time)            as latest_change
     by marketplace_event_vocab, platform
| sort desc items_present
| limit 50
