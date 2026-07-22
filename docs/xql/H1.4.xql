/* HUNT H1.4 - npm namespace / scope-confusion shape (structural typosquat proxy).
   HYPOTHESIS: the same base package name appearing under MORE THAN ONE scope - an unscoped
   `redis` alongside `@upstash/redis`, or two different `@x/name` owners for one base - is
   the classic dependency-confusion / scope-impersonation shape. No Levenshtein needed:
   identical base name, different owning namespace.
   HIT MEANS: one base name is claimed under multiple owners in this org's supply chain -
   verify which scope is the intended one and whether the odd one is planted. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions" and platform = "npm" and action != "uninstalled"
| filter object_id != null
| alter base_name = coalesce(arrayindex(regextract(object_id, "^@[^/]+/(.+)$"), 0), object_id)
| alter scope     = coalesce(arrayindex(regextract(object_id, "^(@[^/]+)/"), 0), "<unscoped>")
| comp count_distinct(scope) as scopes,
       values(scope)         as scope_list,
       values(object_id)     as ids,
       count_distinct(hostname) as hosts
     by base_name
| filter scopes >= 2
| sort desc scopes, desc hosts
| limit 200
