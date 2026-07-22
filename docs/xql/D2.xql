// KOI Ext - Investigate Item, new step "XDR runtime evidence".
// Bridges "KOI says it is installed" to "it actually ran / was written to disk".
// PARAM: item_token  = a distinctive substring of the item - package name, extension id, repo name.
//                      From KoiContext.package_name / item_id, lowercased.
// PARAM: koi_host    = KoiContext.alert_hostname / Koi.Inventory.Endpoint.hostname. Drop the line to search fleet-wide.
dataset = xdr_data
| filter event_type in (ENUM.PROCESS, ENUM.FILE, ENUM.LOAD_IMAGE)
| filter agent_hostname = "win-workstation"                          // PARAM
| alter artifact_path = coalesce(action_process_image_path, action_file_path, action_module_path)
| alter cmdline       = action_process_image_command_line
| filter lowercase(coalesce(artifact_path, "")) contains "hello-world"
      or lowercase(coalesce(cmdline, ""))       contains "hello-world"     // PARAM item_token (lowercase)
| alter evidence_kind = if(event_type = ENUM.PROCESS, "executed",
                        if(event_type = ENUM.LOAD_IMAGE, "loaded_as_module", "written_to_disk"))
| fields _time, agent_hostname, evidence_kind, event_type, artifact_path, cmdline,
         action_process_image_name, action_process_username, action_process_signature_status,
         actor_process_image_name, actor_process_command_line
| sort asc _time
| limit 200
