/* HUNT H4.6 — Coverage-weighted risk: which dual-covered host to hunt on FIRST.
   HYPOTHESIS: hosts that are BOTH agentic-active (xdr) AND KOI-risky are the highest-yield ground;
     neither dataset ranks hosts alone, the product does. Triage query — run before the other five.
   HIT MEANS: top hunt_priority = the host most likely to hide a live compromise; start there.
   JOIN LOGIC: derive the dual-covered host set from data (inner join xdr host activity to KOI-known
     hosts — resolves to win-workstation here, never hardcoded), then attach each side's posture:
     xdr agentic event volume + distinct images, KOI max/avg numeric risk from the deduped Alerts
     stream. Rank by agentic_events x (1 + max_koi_risk). NOTE: XQL arithmetic MUST be multiply()/
     add() — the a*b operator is a parse error on this tenant.
   Datasets: xdr_data (PROCESS) x koi_koi_raw (Audit + Alerts). */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter xhost = lowercase(agent_hostname),
        proc  = lowercase(coalesce(action_process_image_name, "")),
        root  = lowercase(coalesce(causality_actor_process_image_name, ""))
| alter is_agentic = if(proc in ("node","node.exe","npx","python","python.exe","python3","uv","uvx") or root contains "claude" or root contains "cursor" or root contains "code" or root contains "antigravity" or root contains "ollama", 1, 0)
| comp count() as xdr_events, sum(is_agentic) as agentic_events, count_distinct(action_process_image_name) as distinct_images by xhost
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter khost = lowercase(hostname)
    | comp count() as koi_audit_events by khost
  ) as cov cov.khost = xhost
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Alerts"
    | alter evid = json_extract_scalar(metadata, "$.notification_event_id")
    | dedup evid
    | alter res = to_json_string(resources)
    | alter ahost = lowercase(json_extract_scalar(res, "$.1.data.hostname")),
            rn    = to_number(json_extract_scalar(res, "$.0.data.risk"))
    | filter ahost != null
    | comp count() as scored_alerts, max(rn) as max_koi_risk, avg(rn) as avg_koi_risk by ahost
  ) as risk risk.ahost = xhost
| alter mr = coalesce(max_koi_risk, 0.0)
| alter hunt_priority = multiply(agentic_events, add(1.0, mr))
| fields xhost, xdr_events, agentic_events, distinct_images, koi_audit_events, scored_alerts, max_koi_risk, avg_koi_risk, hunt_priority
| sort desc hunt_priority
| limit 50
