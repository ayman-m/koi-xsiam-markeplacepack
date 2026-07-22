// H3-3 HYPOTHESIS: legit software runs from stable, signed install roots. A process whose
// image lives inside a package cache / dependency dir (node_modules, site-packages, npm-cache,
// .cargo, .ollama, systemtemp, /tmp, .cache) AND is NOT signed = a compiled binary running
// straight out of a freshly downloaded package. HIT = candidate malicious-package binary.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter ipath = lowercase(coalesce(action_process_image_path, "")),
        sig   = to_string(action_process_signature_status)
| filter ipath contains "node_modules" or ipath contains "site-packages"
      or ipath contains "npm-cache" or ipath contains ".cargo" or ipath contains ".ollama"
      or ipath contains "pypoetry" or ipath contains "systemtemp" or ipath contains "/tmp/"
      or ipath contains ".cache"
| alter path_class = if(
      ipath contains "node_modules", "npm_node_modules",
      ipath contains "site-packages" or ipath contains "pypoetry", "pypi_site_packages",
      ipath contains ".cargo", "cargo",
      ipath contains ".ollama", "ollama",
      ipath contains "systemtemp" or ipath contains "/tmp/", "temp_dir", "package_cache")
| filter sig != "SIGNED"
| comp count() as execs, count_distinct(action_process_image_command_line) as distinct_cmds,
       min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, path_class, sig, action_process_image_name, action_process_signature_vendor
| sort desc execs
| limit 50
