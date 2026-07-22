/* HUNT H1.5 - Version rollback / downgrade on a host (non-monotonic version).
   HYPOTHESIS: a supply-chain item whose version moved BACKWARDS on a host - the version
   present now is older than one that host previously ran - is suspicious: a forced
   downgrade to a vulnerable release, or a poisoned "update" that re-publishes a lower
   number. Semver only; git SHAs and hash versions are excluded by the ^d+.d+ filter.
   Method (single pass): pack major.minor.patch into one integer (vnum); compare the LATEST
   event's packed version (recovered from a time-sortable key) against the MAX vnum ever
   seen for that item on that host.
   HIT MEANS: current_vnum < peak_vnum on a host = that item was rolled back there. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions" and action in ("installed","updated")
| filter item_version != null and item_version ~= "^[0-9]+\.[0-9]+"
| alter vmaj = to_integer(arrayindex(regextract(item_version, "([0-9]+)"), 0))
| alter vmin = to_integer(arrayindex(regextract(item_version, "([0-9]+)"), 1))
| alter vpat = to_integer(arrayindex(regextract(item_version, "([0-9]+)"), 2))
| alter vnum = add(add(multiply(coalesce(vmaj,0), 1000000000), multiply(coalesce(vmin,0), 100000)), coalesce(vpat,0))
| alter tkey = concat(format_timestamp("%Y%m%d%H%M%S", _time), "#", to_string(add(vnum, 100000000000000)))
| comp max(vnum)  as peak_vnum,
       max(tkey)  as latest_tkey,
       count_distinct(item_version) as nver,
       values(item_version) as versions
     by object_id, object_name, hostname, platform
| filter nver > 1
| alter current_vnum = subtract(to_integer(arrayindex(regextract(latest_tkey, "#([0-9]+)$"), 0)), 100000000000000)
| filter current_vnum < peak_vnum
| sort desc peak_vnum
| limit 200
