/* HUNT H4.5 — Risky item with matching egress: KOI network finding x agent egress, same host.
   HYPOTHESIS: a KOI network-capability finding (Unrestricted/Bypasses/Exfils/Intercepts/MITM) is
     latent until the host actually egresses. Correlating the finding with observed agent-tree
     public egress on the same host promotes capability to behaviour.
   HIT MEANS: a dual-covered host with a KOI network-exfil/bypass finding that is ALSO egressing to
     the public internet from an agent process tree — the shortlist to pull B4/B5 flow detail on.
   JOIN LOGIC: KOI Alerts (deduped) whose resources[0].data.findings JSON contains a network
     finding_id -> inner join to xdr NETWORK egress (public only: loopback/RFC1918/link-local
     excluded via incidr) from agent causality trees, aggregated per host. Ranked by risk x flows.
     DISTINCT from B5 (xdr-only anomalous egress): this is gated on KOI's supply-chain verdict.
   Datasets: koi_koi_raw (Alerts) x xdr_data (NETWORK). */
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter evid = json_extract_scalar(metadata, "$.notification_event_id")
| dedup evid
| alter res = to_json_string(resources)
| alter fjson = coalesce(to_json_string(json_extract(res, "$.0.data.findings")), "")
| filter fjson contains "UnrestrictedNetworkAccess" or fjson contains "BypassesNetworkControl" or fjson contains "DynamicNetworkDestination" or fjson contains "InterceptsNetworkTraffic" or fjson contains "NetworkInterception" or fjson contains "Exfils" or fjson contains "VulnerabletoMITM"
| alter koi_host = lowercase(json_extract_scalar(res, "$.1.data.hostname")),
        koi_item = coalesce(json_extract_scalar(res, "$.0.data.package_name"), json_extract_scalar(res, "$.0.name")),
        koi_risk = to_number(json_extract_scalar(res, "$.0.data.risk")),
        koi_type = json_extract_scalar(res, "$.0.type")
| filter koi_host != null
| comp max(koi_risk) as koi_risk, count_distinct(koi_item) as flagged_items by koi_host, koi_type
| join type = inner (
    dataset = xdr_data
    | filter event_type = ENUM.NETWORK
    | alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
    | filter root contains "claude" or root contains "cursor" or root contains "code" or root contains "antigravity" or root contains "ollama" or root contains "node" or root contains "python"
    | filter action_network_is_loopback = false or action_network_is_loopback = null
    | filter action_remote_ip != null
    | filter not (incidr(action_remote_ip, "10.0.0.0/8") or incidr(action_remote_ip, "172.16.0.0/12") or incidr(action_remote_ip, "192.168.0.0/16") or incidr(action_remote_ip, "127.0.0.0/8") or incidr(action_remote_ip, "169.254.0.0/16"))
    | alter nhost = lowercase(agent_hostname)
    | comp count() as egress_flows, count_distinct(action_remote_ip) as distinct_dsts, count_distinct(action_remote_port) as distinct_ports by nhost
  ) as net net.nhost = koi_host
| alter hunt_score = multiply(koi_risk, add(1, egress_flows))
| fields koi_host, koi_type, koi_risk, flagged_items, egress_flows, distinct_dsts, distinct_ports, hunt_score
| sort desc hunt_score
| limit 100
