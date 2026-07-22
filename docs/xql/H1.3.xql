/* HUNT H1.3 - Install bursts (mass deployment in a tight window).
   HYPOTHESIS: the same item installed across many hosts inside one short window is either a
   legitimate rollout OR a compromised-update / worm-like push. Either way, the moment an
   item fans out across the estate is worth surfacing.
   HIT MEANS: N distinct hosts installed one item within the same hour - confirm it was an
   intended rollout, not an auto-update pushing a poisoned version. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions" and action = "installed"
| filter object_id != null
| alter bucket = format_timestamp("%Y-%m-%d %H:00", _time)
| comp count_distinct(hostname) as hosts,
       count()                  as install_events,
       values(hostname)         as host_list,
       values(item_version)     as versions,
       min(_time)               as window_start,
       max(_time)               as window_end
     by object_id, object_name, platform, bucket
| filter hosts >= 3
| sort desc hosts, desc install_events
| limit 200
