// Theme D / D1b - Item history rolled up per host, for a war-room summary block.
// Same PARAMs as D1. `values()` emits a deduplicated array per group, so versions_seen
// doubles as a version-drift indicator without a second query.
// Investigation. Suggested timeframe 30d.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type in ("extensions", "remediation")
| filter object_id = "octocat/Hello-World" or object_name = "octocat/Hello-World"   // PARAM
| alter koi_host = coalesce(hostname, "<no host on event>")
| comp min(_time)               as first_seen,
       max(_time)               as last_seen,
       count()                  as koi_events,
       values(action)           as actions_seen,
       values(item_version)     as versions_seen,
       values(marketplace)      as marketplaces_seen,
       values(triggered_by)     as triggered_by_actors
     by koi_host
| sort desc last_seen
| limit 200
