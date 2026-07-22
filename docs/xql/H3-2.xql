// H3-2 HYPOTHESIS: a package manager (npm/pnpm/yarn/pip/uv/gem/cargo/go/git/brew) resolving
// & unpacking files should not spawn a shell or a network-download tool. Such a child is a
// package LIFECYCLE HOOK executing code (npm pre/postinstall, pip setup.py, git hook) -
// the classic malicious-package delivery vector.
// HIT = a supply-chain install spawned code exec / egress via a lifecycle hook.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter child  = lowercase(coalesce(action_process_image_name, "")),
        parent = lowercase(coalesce(actor_process_image_name, "")),
        pcmd   = lowercase(coalesce(actor_process_image_command_line, ""))
| filter parent in ("npm","npm.cmd","pnpm","yarn","pip","pip3","uv","uvx","uv.exe","uvx.exe","gem","cargo","go","git","git.exe","brew")
| filter child in ("cmd.exe","powershell.exe","pwsh.exe","powershell","pwsh","bash","sh","zsh","dash",
                   "curl","curl.exe","wget","wget.exe","certutil.exe","bitsadmin.exe","mshta.exe","nc","ncat")
| alter child_class = if(
      child in ("curl","curl.exe","wget","wget.exe","certutil.exe","bitsadmin.exe","nc","ncat"), "network_download",
      child = "mshta.exe", "lolbin_exec", "shell")
| alter is_install_ctx = if(pcmd contains "install" or pcmd contains " add " or pcmd contains "postinstall"
      or pcmd contains "preinstall" or pcmd contains "setup.py", "install_ctx", "other_ctx")
| comp count() as spawns, count_distinct(action_process_image_command_line) as distinct_child_cmds,
       min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, parent, child, child_class, is_install_ctx
| sort desc spawns
| limit 50
