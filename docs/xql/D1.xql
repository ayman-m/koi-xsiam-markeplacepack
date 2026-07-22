// Theme D / D1 - Item full KOI history across every host.
// Marketplace KOI pack 1.2.3 has NO history command, no koi-remediations-list and no
// koi-approval-requests-list - the Audit stream is the only source of an item timeline.
// Audit is NOT duplicated on this tenant (1.0 ratio) - do not dedupe.
// PARAM: item_key  = KoiContext.item_id (from the alert's observables[name="item.id"])
//                    or Koi.Inventory.item_id
// PARAM: item_name = Koi.Inventory.name (pass the same value twice if you only have one)
// Investigation. Suggested timeframe 30d.
dataset = koi_koi_raw
| filter source_log_type = "Audit"
| filter type in ("extensions", "remediation")
| filter object_id = "octocat/Hello-World" or object_name = "octocat/Hello-World"   // PARAM
| alter koi_host      = coalesce(hostname, "<no host on event>")
| alter koi_action    = coalesce(action, "-")
| alter koi_actor     = coalesce(triggered_by, "-")
// EVENTS emit the short marketplace vocabulary (github, vsc, chrome, software_windows);
// the KOI API and UI use the long forms (github_mcp_registry, vscode, chrome_web_store,
// windows). Do NOT feed this value straight into a koi-* command argument.
| alter marketplace_event_vocab = coalesce(marketplace, "-")
| fields _time, koi_host, koi_action, type, object_name, object_id, item_version,
         marketplace_event_vocab, platform, category, koi_actor, message, id
| sort asc _time
| limit 500
