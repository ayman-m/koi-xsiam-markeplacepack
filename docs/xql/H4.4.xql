/* HUNT H4.4 — Scan-integrity anomaly: KOI scan ran in xdr, KOI reported nothing after.
   HYPOTHESIS: KOI is run-on-demand; its bundled python runs a .pyz (visible in xdr PROCESS under
     AppData\Local\Koi\Python). If that scan ran but koi_koi_raw has no event dated after it
     (beyond ingestion lag), the scan found no change (benign) OR failed/was tampered (malign).
     A silent scan is indistinguishable from a broken one without joining the two datasets.
   HIT MEANS: last scan newer than last KOI event by > lag budget -> review this host.
   JOIN LOGIC: xdr scan timestamps (path-anchored on the KOI-bundled interpreter, detection A7's
     anchor) LEFT-joined to the newest koi_koi_raw Audit event time per host; flag the delta.
     DISTINCT from A5 (per-item gap) and A7 (scan freshness from xdr alone): this compares scan
     time to REPORTING time across both datasets. Lag budget 15 min covers the 4-10 min ingest lag.
   Datasets: xdr_data (PROCESS) x koi_koi_raw (Audit). */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter pth = lowercase(coalesce(action_process_image_path, ""))
| filter pth contains "appdata" and pth contains "koi" and pth contains "python"
| alter shost = lowercase(agent_hostname)
| comp count() as scan_processes, max(_time) as last_scan, min(_time) as first_scan by shost
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter khost = lowercase(hostname)
    | comp count() as koi_events, max(_time) as last_koi_event by khost
  ) as k k.khost = shost
| alter lag_min = timestamp_diff(last_scan, last_koi_event, "MINUTE")
| alter verdict = if(last_koi_event = null, "SCAN_RAN_ZERO_KOI_EVENTS", if(lag_min > 15, "SCAN_NEWER_THAN_LAST_REPORT", "reported_after_scan"))
| fields shost, scan_processes, first_scan, last_scan, koi_events, last_koi_event, lag_min, verdict
| sort desc lag_min
| limit 100
