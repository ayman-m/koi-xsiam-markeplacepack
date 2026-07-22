// KOI Ext - Investigate Item, step "KOI event history" (runs beside koi-inventory-item-get)
// PARAM: item_key   = KoiContext.item_id  (alert) or Koi.Inventory.item_id
// PARAM: item_name  = Koi.Inventory.name  (pass the same value twice if you only have one)
// Marketplace pack 1.2.3 has no history command - this is the only way to get an item timeline.
dataset = koi_koi_raw
| filter source_log_type = "Audit"                                  // Audit is NOT duplicated - do not dedupe
| filter type in ("extensions", "remediation")
| filter object_id = "octocat/Hello-World" or object_name = "octocat/Hello-World"   // PARAM
| alter koi_host      = coalesce(hostname, "<no host on event>")
| alter koi_action    = coalesce(action, "-")
| alter koi_actor     = coalesce(triggered_by, "-")
| alter marketplace_event_vocab = coalesce(marketplace, "-")
| fields _time, koi_host, koi_action, type, object_name, object_id, item_version,
         marketplace_event_vocab, platform, category, koi_actor, message, id
| sort asc _time
| limit 500
