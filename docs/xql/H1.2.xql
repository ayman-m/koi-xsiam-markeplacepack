/* HUNT H1.2 - Brand-new items with reach (fast propagation).
   HYPOTHESIS: an item first_seen very recently that is ALREADY on several hosts propagated
   fast. Fast fan-out of a NEW item is the shape of a compromised-update push, not the slow
   organic spread of a normal dependency.
   HIT MEANS: a newly-appeared item on 3+ hosts within days - confirm it is an intended
   rollout, not a poisoned auto-update.
   NOTE: identical comp base to validated H1.1; differs only in the final filter. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter object_id != null
| filter platform in ("npm","claude_code","git","homebrew","cur","talon","chrome")
| dedup object_id, hostname by desc _time
| filter action != "uninstalled"
| comp count_distinct(hostname) as hosts,
       values(hostname) as host_list,
       min(_time) as first_seen,
       max(_time) as last_seen,
       values(item_version) as versions,
       values(triggered_by) as installed_by
     by object_id, object_name, platform, marketplace
| alter days_since_first = timestamp_diff(current_time(), first_seen, "DAY")
| filter days_since_first <= 7 and hosts >= 3
| sort desc hosts, asc days_since_first
| limit 200
