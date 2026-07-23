/* THEME G - Q4 : System guardrail remediation fired (not a custom policy).
   Purpose        : detection
   Datasets       : koi_koi_raw (Audit, type = remediation)
   Status         : validated 2026-07-23 - 11 rows on tenant paet
   What it answers: where did Koi's OWN built-in protections act, as opposed to a
                    customer-authored policy?

   WHY SPLIT SYSTEM FROM CUSTOM. The `reason` column on a remediation row is overloaded:
   it holds EITHER a snake_case system-guardrail identifier OR the free-text NAME of a
   custom policy. Live vocabulary 2026-07-23 (90 d):
     system  : system_malware_protection, system_auto_remediated_delisted,
               system_sideloading_protection, system_mcp_registry_protection,
               mcp_registry_protection   <- note: NO system_ prefix, a Koi inconsistency
     custom  : "NPM Block CS" (89), "Block List Pre Blocked" (49), "Block AI-powered
               items" (27), "Base Policy" (23), "JGA - Block Password Manager
               Extensions" (8), "Manual remediation" (12), "Block Gemini", ...
   A detection that does not separate them fires on routine policy hygiene. This one
   isolates the system guardrails, which are Koi asserting a threat rather than a
   customer asserting a preference.

   Live result 2026-07-23 (90 d), 11 rows:
     system_malware_protection        17 (12 pending + 2 executed + brave/edge/talon 1 ea)
     system_auto_remediated_delisted   4
     system_mcp_registry_protection    2   mcp_registry_protection  2
     system_sideloading_protection     1  (marketplace side_loaded, platform vsc)

   `action` tells you whether Koi finished the job: remediation_opened -> pending ->
   executed. A backlog of remediation_pending on system_malware_protection is the single
   most actionable row shape here - malware Koi has flagged but NOT yet removed.

   platform != marketplace. Live pairs include marketplace=chrome/platform=talon and
   marketplace=homebrew/platform=vsc. Group by both or you will misattribute. */
dataset = koi_koi_raw
| filter type = "remediation"
// Anchored ^ so a custom policy merely mentioning the word "system" cannot match.
// mcp_registry_protection is listed explicitly because Koi emits it without the prefix.
| filter reason ~= "^(system_|mcp_registry_protection)"
| comp count() as cnt by reason, action, marketplace, platform
| sort desc cnt
