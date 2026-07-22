/* THEME A - Q8 : ONE-ITEM ACQUISITION TIMELINE - the playbook query.
   Purpose : investigation. Parameterise on an item and a host and get every KOI lifecycle
             event and every XDR process/file event that names it, on one timeline.
   Datasets: koi_koi_raw (Audit) + xdr_data (PROCESS, FILE), unioned into a common shape.
   Inputs  : // PARAM: item_token  - lower-case substring of the KOI object_name, e.g. "tabulate",
             //                      "octocat/hello-world", "antigravity", "vscodeusersetup"
             // PARAM: hostname    - as KOI reports it AND as XDR reports it; they agree on this
             //                      tenant, but normalise if your estate differs.
   Pack    : Marketplace KOI pack (demisto/content Packs/Koi) v1.2.3 -> dataset koi_koi_raw.
             There is no Koi.Device.* context in this pack; endpoints hang off an item, so the
             item is the correct pivot. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter lowercase(hostname) = "win-workstation"                 // PARAM: hostname
| filter lowercase(object_name) contains "tabulate"              // PARAM: item_token
| alter evt_time = _time,
        source   = "KOI inventory",
        actor    = triggered_by,
        detail   = message,
        extra    = concat(marketplace, " / ", platform, " / v", item_version)
| fields evt_time, source, actor, detail, extra
| union (
    dataset = xdr_data
    | filter event_type = ENUM.PROCESS
    | filter lowercase(agent_hostname) = "win-workstation"        // PARAM: hostname
    | filter lowercase(action_process_image_command_line) contains "tabulate"   // PARAM: item_token
    | alter evt_time = _time,
            source   = "XDR process",
            actor    = action_process_username,
            detail   = action_process_image_command_line,
            extra    = concat("parent=", coalesce(causality_actor_process_image_name, "?"),
                              " cwd=", coalesce(action_process_cwd, "?"))
    | fields evt_time, source, actor, detail, extra
  )
| union (
    dataset = xdr_data
    | filter event_type = ENUM.FILE
    | filter lowercase(agent_hostname) = "win-workstation"        // PARAM: hostname
    | filter lowercase(action_file_path) contains "tabulate"      // PARAM: item_token
    | alter evt_time = _time,
            source   = "XDR file",
            actor    = actor_effective_username,
            detail   = action_file_path,
            extra    = concat("written by ", coalesce(actor_process_image_name, "?"))
    | fields evt_time, source, actor, detail, extra
  )
| dedup evt_time, source, detail by asc evt_time
| sort asc evt_time
| limit 300
