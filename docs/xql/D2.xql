// Theme D / D2 - XDR runtime evidence for a KOI item.
// Bridges "KOI says it is installed" to "it actually ran / loaded / was written to disk".
// action_module_path is confirmed present on LOAD_IMAGE (action_module_file_name is NOT);
// coalescing the three path fields into one artifact_path lets a single filter cover
// execution, module load and file write.
// PARAM: item_token = a distinctive LOWERCASE substring of the item - package name,
//                     extension id, repo name. From KoiContext.package_name / item_id.
// PARAM: koi_host   = KoiContext.alert_hostname / Koi.Inventory.Endpoint.hostname.
//                     Delete that filter line to search fleet-wide.
// Investigation.
dataset = xdr_data
| filter event_type in (ENUM.PROCESS, ENUM.FILE, ENUM.LOAD_IMAGE)
| filter agent_hostname = "win-workstation"                          // PARAM: koi_host
| alter artifact_path = coalesce(action_process_image_path, action_file_path, action_module_path)
| alter cmdline       = action_process_image_command_line
| filter lowercase(coalesce(artifact_path, "")) contains "hello-world"
      or lowercase(coalesce(cmdline, ""))       contains "hello-world"     // PARAM: item_token
| alter evidence_kind = if(event_type = ENUM.PROCESS, "executed",
                        if(event_type = ENUM.LOAD_IMAGE, "loaded_as_module", "written_to_disk"))
| fields _time, agent_hostname, evidence_kind, event_type, artifact_path, cmdline,
         action_process_image_name, action_process_username, action_process_signature_status,
         actor_process_image_name, actor_process_command_line
| sort asc _time
| limit 200
