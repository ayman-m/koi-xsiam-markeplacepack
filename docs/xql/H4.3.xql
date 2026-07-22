/* HUNT H4.3 — AI agent driving a supply-chain change, escalated by KOI's verdict.
   HYPOTHESIS: an AI agent autonomously running pip/npm/uv install is the frontier risk; if the
     installed package is one KOI SCORES as risky, the agent imported a known-bad dependency.
   HIT MEANS: AGENT_INSTALLED_KOI_HIGH_RISK = an agent pulled a KOI-flagged package (investigate);
     AGENT_INSTALLED_UNSCORED_BY_KOI = agent installed something KOI never scored (shadow supply).
   JOIN LOGIC: xdr PROCESS installs whose causality-group owner is an AI agent (detection B10's
     validated agent-tree detector) -> extract package name (A6's validated regex) -> LEFT join KOI
     Alerts scored inventory (deduped, resources[0].data.package_name + numeric risk) by package
     name -> rank agent installs by the KOI risk of what was installed. DISTINCT FROM B10 (xdr-only,
     lists agent installs): this is the CROSS-DATASET escalation — B10 tells you the agent installed
     something, H4.3 tells you KOI already knew it was dangerous.
   Datasets: xdr_data (PROCESS) x koi_koi_raw (Alerts). Composed of validated sub-patterns (B10 +
     A6 + the H4.6/B8-validated Alerts dedup+risk join); not run end-to-end (CU budget). */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter cmd = lowercase(coalesce(action_process_image_command_line, "")),
        root= lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity" or root contains "windsurf" or root contains "codex" or root = "code" or root = "code.exe"
| filter cmd contains "pip install" or cmd contains "pip3 install" or cmd contains "npm install" or cmd contains "npm i " or cmd contains "yarn add" or cmd contains "pnpm add" or cmd contains "uv pip install" or cmd contains "uv add"
| alter pkg_name = lowercase(arrayindex(regextract(cmd, "(?:pip3?|npm|uv pip|uv|yarn|pnpm)\s+(?:install|add|i)\s+(?:(?:-{1,2}\S+|\S*[\\/:]\S*)\s+)*([a-z@][a-z0-9._@/-]{1,})"), 0))
| filter pkg_name != null and pkg_name != ""
| comp count() as installs, min(_time) as first_install, max(_time) as last_install by agent_hostname, causality_actor_process_image_name, action_process_username, pkg_name
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Alerts"
    | alter evid = json_extract_scalar(metadata, "$.notification_event_id")
    | dedup evid
    | alter res = to_json_string(resources)
    | alter kn = lowercase(json_extract_scalar(res, "$.0.data.package_name")),
            rn = to_number(json_extract_scalar(res, "$.0.data.risk"))
    | filter kn != null and kn != ""
    | comp max(rn) as koi_risk by kn
  ) as koi koi.kn = pkg_name
| alter verdict = if(koi_risk = null, "AGENT_INSTALLED_UNSCORED_BY_KOI", if(koi_risk >= 7, "AGENT_INSTALLED_KOI_HIGH_RISK", if(koi_risk >= 4, "AGENT_INSTALLED_KOI_MEDIUM_RISK", "agent_installed_koi_low")))
| alter hunt_score = multiply(coalesce(koi_risk, 1.0), installs)
| fields agent_hostname, causality_actor_process_image_name, action_process_username, pkg_name, installs, first_install, last_install, koi_risk, verdict, hunt_score
| sort desc hunt_score
| limit 100
