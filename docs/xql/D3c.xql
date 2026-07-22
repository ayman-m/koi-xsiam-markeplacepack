// KOI Ext - Investigate Device, step "when did KOI last actually scan this device?".
// KOI is run-on-demand on Windows: no resident agent, so absence of KOI events means
// "no scan ran", not "nothing changed". The bundled interpreter under ...\Local\Koi\Python
// makes the scan itself visible in XDR, which is the only way to tell the two apart.
// PARAM: koi_host = inputs.hostname  (drop the filter for a fleet-wide coverage sweep)
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter agent_hostname = "win-workstation"                            // PARAM
| filter actor_process_image_path contains "Koi" or action_process_image_path contains "Koi"
| comp max(_time)                            as last_koi_agent_activity,
       min(_time)                            as first_koi_agent_activity,
       count()                               as processes_spawned_by_koi,
       count_distinct(action_process_causality_id) as scan_causality_chains,
       values(action_process_image_name)     as koi_child_processes
     by agent_hostname
| limit 100
