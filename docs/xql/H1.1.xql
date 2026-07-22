/* HUNT H1.1 - Rare items within a widely-used marketplace.
   HYPOTHESIS: an item present on only 1-2 endpoints, inside a platform that is otherwise
   broadly deployed across the org (npm 14 hosts, claude_code 15, git 13, homebrew 9, cur
   11, talon 10 - measured), is a supply-chain outlier: targeted, freshly planted, or a
   dependency nobody else pulls. Rarity is a signal that needs no KOI finding to have fired.
   HIT MEANS: an org-wide outlier item; pivot to who installed it and whether KOI scored it.
   Triage surface, not a standalone detection. */
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
| filter hosts <= 2
| sort asc hosts, desc last_seen
| limit 200
