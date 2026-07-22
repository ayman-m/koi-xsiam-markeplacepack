/* HUNT H1.7 - Publisher / namespace anomalies.
   HYPOTHESIS (a): a genuine publisher lives in ONE ecosystem; a namespace whose items span
   multiple platforms is unusual (cross-registry name reuse / impersonation).
   HYPOTHESIS (b): a publisher with exactly ONE item that is nonetheless on many hosts is a
   one-package author with sudden org-wide reach - the shape of a single planted or
   compromised package propagating.
   Publisher derived structurally from object_id: npm scope (@scope/..) or owner (owner/..
   for git and homebrew taps). HIT MEANS: inspect that namespace and how it reached hosts. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions" and action != "uninstalled"
| filter platform in ("npm","git","homebrew")
| alter npm_scope = arrayindex(regextract(object_id, "^@([^/]+)/"), 0)
| alter owner     = arrayindex(regextract(object_id, "^([^/@][^/]*)/"), 0)
| alter publisher = coalesce(npm_scope, owner)
| filter publisher != null
| comp count_distinct(object_id) as items,
       count_distinct(platform)  as platforms,
       count_distinct(hostname)  as hosts,
       values(platform)          as platform_list,
       values(object_id)         as item_ids
     by publisher
| filter platforms >= 2 or (items = 1 and hosts >= 3)
| sort desc hosts, desc platforms
| limit 200
