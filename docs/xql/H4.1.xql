dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter evid = json_extract_scalar(metadata, "$.notification_event_id")
| dedup evid
| alter res = to_json_string(resources)
| alter koi_name = lowercase(coalesce(json_extract_scalar(res, "$.0.data.package_name"), json_extract_scalar(res, "$.0.name"))),
        koi_host = lowercase(json_extract_scalar(res, "$.1.data.hostname")),
        risk_num = to_number(json_extract_scalar(res, "$.0.data.risk")),
        risk_lvl = json_extract_scalar(res, "$.0.data.risk_level"),
        item_type= json_extract_scalar(res, "$.0.type")
| filter koi_name != null and koi_name != "" and koi_host != null
| alter koi_token = lowercase(arrayindex(regextract(koi_name, "^([a-z0-9][a-z0-9._+-]{3,})"), 0))
| filter koi_token != null and koi_token != ""
| comp max(risk_num) as koi_risk by koi_host, koi_name, koi_token, item_type, risk_lvl
| join type = inner (
    dataset = xdr_data
    | alter cov_host = lowercase(agent_hostname)
    | comp count() as xdr_events by cov_host
  ) as cov cov.cov_host = koi_host
| join type = left (
    dataset = xdr_data
    | filter event_type = ENUM.PROCESS
    | alter proc = lowercase(coalesce(action_process_image_name, "")),
            pcmd = lowercase(coalesce(action_process_image_command_line, "")),
            ppath= lowercase(coalesce(action_process_image_path, ""))
    | filter proc in ("node","node.exe","npx","npx.cmd","python","python.exe","python3","uv","uvx","uv.exe","uvx.exe","bun","deno","pip","pip3") or pcmd contains "mcp"
    | alter phost = lowercase(agent_hostname)
    | dedup phost, pcmd by asc _time
    | fields phost, pcmd, ppath
  ) as p p.phost = koi_host
| alter names_it = if(p.pcmd != null and (p.pcmd contains koi_token or p.ppath contains koi_token), 1, 0)
| comp sum(names_it) as runtime_hits, max(koi_risk) as koi_risk by koi_host, koi_name, koi_token, item_type, risk_lvl
| alter hunt_score = multiply(koi_risk, add(1, runtime_hits))
| fields koi_host, koi_name, item_type, koi_risk, risk_lvl, runtime_hits, hunt_score
| sort desc hunt_score
| limit 100
