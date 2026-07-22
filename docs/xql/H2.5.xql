// HUNT H2.5 - Publisher-compromise / malicious-campaign blast radius.
// HYPOTHESIS: a compromised publisher / campaign-linked item is as dangerous as its reach.
//   Rank the known-bad by how many distinct hosts already carry it.
// HIT = a compromise/publisher finding present, with distinct-host reach and first/last seen.
// koi_koi_raw Alerts only; dedup on notification_event_id BEFORE any host counting.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_name = json_extract_scalar(itm_obj, "$.name")
| alter item_id   = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_risk = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter alert_host= json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
| alter hits  = arrayfilter(f_ids, "@element" in (
      "PublisherCompromised",                          // 8
      "8d581cfb-5094-476e-a112-80be82973105",          // 4  Publisher Email in Compromised List
      "PublishersDomainExpired",                       // 7
      "OwnerHasMaliciousRepo",                         // 7
      "AssociatedwithMaliciousCampaign",               // 10
      "d0a50fdc-62f7-4b94-bb1a-600fec5959bc",          // 10 Malicious Activity Detected
      "6d27a73d-460f-42f4-a53e-ce1630d6492f",          // 8  Malicious item by threat signal
      "SuspectedAsMaliciousByIntelligenceSource"))     // 8
| alter top_hit = arrayindex(hits, 0)
| dedup nid by desc _time
| filter array_length(hits) > 0
| comp count_distinct(alert_host) as host_reach, count(nid) as alert_occurrences,
        min(_time) as first_seen, max(_time) as last_seen
   by item_id, item_name, item_risk, top_hit
| sort desc host_reach
| limit 200
