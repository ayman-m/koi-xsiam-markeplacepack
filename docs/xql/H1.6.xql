/* HUNT H1.6 - Remediation that did not stick (reappearance after removal).
   HYPOTHESIS: an item KOI remediated (type=remediation) that later shows a fresh `installed`
   event on the SAME host has returned after removal - persistence, a re-push, or an
   ineffective remediation. A control-efficacy hunt with no signature required.
   HIT MEANS: object reinstalled AFTER its last remediation on that host - the removal did
   not hold; re-open the case. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type in ("remediation","extensions")
| filter object_id != null and hostname != null
| comp max(if(type = "remediation", _time, null))                          as last_remediation,
       max(if(type = "extensions" and action = "installed", _time, null))  as last_install,
       values(action)       as actions,
       values(item_version) as versions
     by object_id, object_name, hostname, platform
| filter last_remediation != null and last_install != null and last_install > last_remediation
| alter days_reappeared_after = timestamp_diff(last_install, last_remediation, "DAY")
| sort desc last_install
| limit 200
