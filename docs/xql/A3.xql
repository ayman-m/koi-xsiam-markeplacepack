/* THEME A - Q3 : `git clone` in XDR joined to KOI's GitHub inventory event.
   Purpose : investigation
   Datasets: xdr_data (PROCESS) + koi_koi_raw (Audit)
   Why     : KOI records a git item as owner/repo with the COMMIT SHA in item_version, but has
             no idea who ran the clone or where it landed. XDR has the command line, the user,
             the causality parent and the destination path, but never resolves the SHA.
             Joined on the repo slug + host you get the whole acquisition in one row.
   Pack    : Marketplace KOI pack (demisto/content Packs/Koi) v1.2.3 -> dataset koi_koi_raw.
   Vocab   : the EVENT field marketplace = "github" / platform = "git". The KOI API and UI call
             the same thing "github_mcp_registry" - do not filter on the API spelling here.
   Syntax  : after `join ... as koi`, joined columns are referenced by their BARE name, not
             `koi.name`, and the joined side's _time overwrites the left _time - hence the
             explicit clone_time alias below. */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)git(\.exe)?[\s\"]+clone"
// owner/repo, lower-cased so it lines up with KOI's object_name
| alter repo_slug = lowercase(arrayindex(regextract(action_process_image_command_line, "(?i)github\.com[:/]([A-Za-z0-9._-]+/[A-Za-z0-9._-]+?)(?:\.git|[\s\"]|$)"), 0))
| filter repo_slug != null
// whatever token follows the remote URL is the clone destination, when one was supplied
| alter clone_dest  = arrayindex(regextract(action_process_image_command_line, "(?i)github\.com\S+\s+(\S+)"), 0)
| alter clone_time  = _time,
        clone_host  = lowercase(agent_hostname),
        clone_user  = action_process_username,
        clone_cmd   = action_process_image_command_line,
        clone_parent = coalesce(causality_actor_process_image_name, actor_process_image_name)
// one row per (host, repo, command) - git clone spawns remote-https / index-pack children
// that all carry the parent's command line
| dedup clone_host, repo_slug, clone_cmd by asc clone_time
| fields clone_time, clone_host, agent_hostname, agent_id, repo_slug, clone_dest,
         clone_user, clone_parent, clone_cmd, action_process_cwd
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "extensions" and marketplace = "github"
    | alter koi_repo = lowercase(object_name),
            koi_host = lowercase(hostname),
            koi_time = _time,
            koi_action = action,
            commit_sha = item_version,
            koi_message = message
    | fields koi_repo, koi_host, koi_time, koi_action, commit_sha, koi_message
  ) as koi koi.koi_repo = repo_slug and koi.koi_host = clone_host
| alter koi_lag_minutes = timestamp_diff(koi_time, clone_time, "MINUTE")
| alter koi_saw_it = if(koi_time = null, "NO - not in KOI inventory", "yes")
| fields clone_time, agent_hostname, repo_slug, clone_dest, clone_user, clone_parent,
         clone_cmd, action_process_cwd, koi_saw_it, koi_action, commit_sha,
         koi_time, koi_lag_minutes, koi_message
| sort desc clone_time
| limit 200
