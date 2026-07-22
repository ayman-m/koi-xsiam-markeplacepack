// H3-5 HYPOTHESIS: Windows LOLBins (certutil/bitsadmin/mshta/regsvr32/rundll32/wmic/msiexec/
// curl/wscript/cscript) are the standard download-and-run primitives. One launched inside an
// AI-agent tree or by a package-manager/interpreter parent is almost never legit build activity.
// HIT = a LOLBin in an agent/pkg-mgr context; download_intent flags a URL/decode in its cmdline.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter proc   = lowercase(coalesce(action_process_image_name, "")),
        cmd    = lowercase(coalesce(action_process_image_command_line, "")),
        root   = lowercase(coalesce(causality_actor_process_image_name, "")),
        parent = lowercase(coalesce(actor_process_image_name, ""))
| filter proc in ("certutil.exe","bitsadmin.exe","mshta.exe","regsvr32.exe","rundll32.exe",
                  "wmic.exe","msiexec.exe","curl.exe","hh.exe","installutil.exe","wscript.exe","cscript.exe")
| alter agent_ctx = if(root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root contains "copilot"
      or root contains "ollama" or root contains "code", "agent_tree", null)
| alter pkg_ctx = if(parent in ("npm","npm.cmd","npx","npx.cmd","pnpm","yarn","pip","pip3",
      "python","python.exe","node","node.exe","uv","uvx","git","git.exe","gem","cargo"), "pkgmgr_parent", null)
| filter agent_ctx != null or pkg_ctx != null
| alter ctx = coalesce(agent_ctx, pkg_ctx)
| alter download_intent = if(cmd contains "http" or cmd contains "-urlcache" or cmd contains "-decode"
      or cmd contains "/transfer" or cmd contains "base64" or cmd contains "downloadstring"
      or cmd contains "webclient", "download_or_decode", "other")
| comp count() as execs, count_distinct(action_process_image_command_line) as distinct_cmds,
       min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, proc, ctx, download_intent, parent
| sort desc execs
| limit 50
