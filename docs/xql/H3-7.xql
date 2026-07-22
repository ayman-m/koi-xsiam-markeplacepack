// H3-7 HYPOTHESIS: a signed interpreter/agent (python.exe/node.exe/code.exe/ollama) loads its
// modules (.dll/.pyd/.node) from its own signed install tree. A LOAD_IMAGE of an UNSIGNED module
// from a user-writable path (node_modules/site-packages/appdata/systemtemp/tmp/.cache/downloads/
// .cargo/.ollama) into a signed process = native-module SIDELOADING by a malicious package.
// HIT = signed process loaded an unsigned module from a writable path.
dataset = xdr_data
| filter event_type = ENUM.LOAD_IMAGE
| alter mpath = lowercase(coalesce(action_module_path, "")),
        msig  = to_string(action_module_signature_status),
        actor = lowercase(coalesce(actor_process_image_name, "")),
        asig  = to_string(actor_process_signature_status)
| filter mpath contains "node_modules" or mpath contains "site-packages" or mpath contains "appdata"
      or mpath contains "systemtemp" or mpath contains "/tmp/" or mpath contains ".cache"
      or mpath contains "downloads" or mpath contains ".cargo" or mpath contains ".ollama"
| filter msig != "SIGNED"
| filter actor in ("python.exe","node.exe","node","python","python3","pythonw.exe",
                   "claude.exe","cursor.exe","code.exe","ollama.exe","ollama app.exe")
| comp count() as loads, count_distinct(action_module_path) as distinct_modules,
       min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, actor, asig, msig, action_module_signature_vendor, action_module_path
| sort desc loads
| limit 50
