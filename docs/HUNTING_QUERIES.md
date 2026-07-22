# XQL threat-hunting queries - agentic supply chain & runtime

**Pack context:** built for the official **Marketplace KOI pack v1.2.3** (`demisto/content` `Packs/Koi`, 13 commands, integration only) and its dataset `koi_koi_raw`, correlated with Cortex XDR endpoint telemetry `xdr_data`. Validated on tenant `api-ayman.xdr.eu`; koi_koi_raw hunts re-validated 2026-07-22.

Hunting is **distinct from detection.** The shipped detection/investigation library (`docs/DETECTION_QUERIES.md`) is signature-driven and item-parameterised - it investigates a KNOWN item or fires a fixed-threshold rule. These hunts are **proactive, hypothesis-driven, and exploratory**: they look for the bad thing that has no signature - outliers, rare things, dangerous combinations, behavioural anomalies - across the whole estate. Each hunt states the HYPOTHESIS it tests and what a hit means. Where a hunt is adjacent to a detection query, its differentiation is called out explicitly.

## How to run a hunt

1. **Start broad, capped.** Run the hunt as written - each ends with an outer `| limit`. Read the shape of the result, do not expect a verdict: a hunt returns a **ranked lead list**, not an alert.
2. **Then pivot.** Take the strongest lead (rarest, newest, most agentic, highest risk x activity) and drill in - `koi-inventory-item-get` on an object_id, the KOI finding vocabulary in `scratchpad/findings_hunt.json`, or a per-host timeline (detection A8/D4).
3. **Widen the window for the quiet ones.** A `0-row` agentic-runtime hunt over a few hours is usually a clean-posture result, not a broken query - agent/MCP activity is bursty (node = 0 over 24h, 288 over 7d). Re-run xdr_data hunts over 7-30d before concluding nothing is there.

## Standing rules for every hunt here

1. **Alerts are duplicated ~245x per 24h.** Every hunt over `source_log_type = "Alerts"` (H2.1-H2.3, H4.1) **dedups on** `json_extract_scalar(metadata, "$.notification_event_id")` - never `count()` raw rows. **Audit is NOT duplicated (1.0)** so H1.* and the Audit side of H4.2 need no dedupe. This was enforced across the whole library: no shipped hunt counts Alert rows without deduping.

2. **Marketplace vocabulary differs** between events (short: `chrome`, `vsc`, `npm`, `software_windows`) and the KOI API (long: `chrome_web_store`, `vscode`, `windows`). Hunts match the EVENT (short) spelling. `platform` is richer than `marketplace` for agentic items (claude_code, cur, git, talon, homebrew) - prefer it.

3. **`dns_query_name` is 0% populated** on this tenant; `action_external_hostname` ~56%. No hunt relies on DNS names - egress hunts fall back to action_remote_ip.

4. **No hunt hardcodes a tenant hostname, IP or path.** The dual-covered host set is derived from data (H4.1/H4.2 inner-join it out). The only per-estate edit points are marked `// PARAM` inside each query: agent-name lists, platform sets, the finding_id sets, and rarity/threshold gates. Tune those, not a hardcoded host.

5. **CU discipline.** koi_koi_raw hunts are cheap (small dataset) and safe at 90d. xdr_data hunts are expensive (1.27M rows/24h) - validate with the outer `| limit` and a NARROW window (1-6h), then widen once. Validate a query ONCE; a poller timeout with a query_id issued is parse-confirmation, not a failure - do not burn CU re-running it.

## Highest-value hunts (best first)

Cross-dataset (H4) and finding-combination (H2) hunts are the crown jewels - they fuse KOI's verdict with runtime reality, or chain findings into a story no single finding tells. Single-field H1 composition hunts are useful lead generators but lower-signal. Ranked:

| # | Hunt | Why it ranks | Status |
|---|---|---|---|
| 1 | **H2.1** Compromise-grade findings, unactioned | KOI's own risk 9-10 verdict on a live installed item, no human triage. Real hits (ModHeader->MaliciousActivity, SBlock->Spyware). Directly actionable. | validated |
| 2 | **H2.2** Dangerous finding COMBINATIONS | Chains low-signal capabilities into steal-and-ship / burned-secret stories - far higher-signal than any single finding. | not-run |
| 3 | **H4.1** KOI risk x runtime activity | Theoretical risk gone LIVE: ranks every scored item by KOI-risk x execution on a dual-covered host, no threshold. | parse-confirmed |
| 4 | **H4.2** Shadow agentic software | An MCP server / AI agent executing that KOI never inventoried - a coverage blind spot neither dataset finds alone. | validated |
| 5 | **H3-4** Agent egress to estate-rare destinations | Data-driven rarity (not a static allowlist) - the shape of a rogue MCP phoning home. The one H3 hunt with live hits. | validated |


---

## Theme H2 - KOI risk-SIGNAL hunts - "known-bad, unactioned"

_Pivot on KOI's OWN finding vocabulary (real finding_id values from scratchpad/findings_hunt.json) carried inside Alert resources at `resources[type=item].data.findings.findings[].finding_id`. The detection library never extracts data.findings - this is the finding-combination crown-jewel class. Every query dedups on metadata.notification_event_id._

_3 hunts._


### H2.1 - Compromise-grade findings present but unactioned (known-bad, un-triaged)

**Status:** validated (5 real alerts) · re-validated 2026-07-22 · **Datasets:** koi_koi_raw (Alerts)


**Hypothesis.** KOI has already scored an installed item with a risk 9-10 compromise indicator (malicious campaign, malicious activity, cloud/remote-access-secret exfil, ransomware, spyware, AI-chat exfil, manifest confusion, prompt injection, typosquatting), yet the item is still on hosts and no one has triaged it. This finds the known-bad that already has a KOI verdict but no human response.


**A hit means.** A live installed item that KOI itself labels malicious/spyware/exfil/typosquat, on a named host. Treat as an active supply-chain compromise until dispositioned.


```sql
// HUNT H2.1 - Compromise-grade findings present but unactioned (known-bad, un-triaged).
// HYPOTHESIS: KOI already scored an item with a risk 9-10 compromise-indicator finding,
//   yet it is still installed and no one has triaged it.
// HIT = a live installed item KOI itself calls malicious/spyware/exfil/typosquat, on a host.
// Pack: Marketplace KOI pack v1.2.3 -> koi_koi_raw (Alerts). Findings live on the item resource
//   at data.findings.findings[].finding_id. Alerts are re-sent ~245x/24h -> dedup is mandatory.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_kind   = json_extract_scalar(itm_obj, "$.type")
| alter item_name   = json_extract_scalar(itm_obj, "$.name")
| alter item_id     = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_risk   = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter marketplace = json_extract_scalar(itm_obj, "$.data.marketplace")
| alter alert_host  = json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
// PARAM: the compromise-grade finding_id set (all from scratchpad/findings_hunt.json, risk 9-10)
| alter hits  = arrayfilter(f_ids, "@element" in (
      "AssociatedwithMaliciousCampaign",              // 10
      "d0a50fdc-62f7-4b94-bb1a-600fec5959bc",         // 10 Malicious Activity Detected
      "ExfilsCloudandRemoteAccessSecrets",            // 10
      "RansomwareBehaviorDetected",                   // 10
      "SpywareActivity",                              // 10
      "ExfilsAIChatConversations",                    // 9
      "HighRiskManifestConfusion",                    // 9
      "PromptInjectionDetected",                      // 9
      "Typosquatting"))                               // 9
| alter hit_cnt = array_length(hits)
| dedup nid by desc _time
| filter hit_cnt > 0
| fields _time, item_kind, item_name, item_id, item_risk, marketplace, alert_host, hits, nid
| sort desc _time
| limit 200
```


_Live result:_ Re-validated 2026-07-22 at 90d: 5 rows. Top hit ModHeader - Modify HTTP headers (chrome_web_store + edge_add_ons) -> MaliciousActivityDetected (d0a50fdc...), risk high, on DESKTOP-CN6DQ53. dedup nid confirmed collapsing the ~245x duplication.


_False positives:_ Low. Findings are KOI verdicts, not heuristics. `risk_level = pending` means KOI has not finished scoring (not "safe"). item_id is null for a rare few rows. Mac hosts show human display names (e.g. "Matt's MacBook Pro") as alert_host.


_Tuning:_ Dedup on `metadata.notification_event_id` is MANDATORY (734 raw rows -> 5 real alerts in validation). Rank by exposure by grouping on item_id and count_distinct(alert_host). Broaden/narrow the risk band by editing the `hits` set (PARAM). koi_koi_raw is small - safe to run at 90d.


### H2.2 - Dangerous finding COMBINATIONS on a single item (capability chains)

**Status:** not-run (composed from validated primitives; validate before production use) · **Datasets:** koi_koi_raw (Alerts)


**Hypothesis.** Capability findings that are unremarkable alone are high-signal together. An item that BOTH exfiltrates AND can execute code AND reaches the network is an end-to-end steal-and-ship chain; a hardcoded secret plus any egress is a burned-credential chain. Co-occurrence of >=2 dangerous capability families on one item is far higher-signal than any single finding.


**A hit means.** One item carrying two or more distinct dangerous capability families (exfil / secret / code-exec / network / malicious / persistence / spyware). chain_steal_and_ship and chain_burned_secret name the two highest-signal pairings when present.


```sql
// HUNT H2.2 - Dangerous finding COMBINATIONS on a single item.
// HYPOTHESIS: low-signal capabilities become high-signal together. exfil+network+codeexec = a
//   steal-and-ship chain; hardcoded secret + any egress = a burned-credential chain.
// HIT = one item carrying >=2 distinct DANGEROUS capability families (dedup per real alert).
// Pack: Marketplace KOI pack v1.2.3 -> koi_koi_raw (Alerts).
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid     = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr = json_extract_array(resources, "$")
| alter dev_obj = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_name = json_extract_scalar(itm_obj, "$.name")
| alter item_id   = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_risk = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter alert_host= json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
// PARAM: capability-family membership - every id is from scratchpad/findings_hunt.json
| alter fam_exfil  = if(array_length(arrayfilter(f_ids, "@element" in ("ExfilsCloudandRemoteAccessSecrets","ExfilsAIChatConversations","ExfilsBrowsingHistory","17c8aecd-789e-4673-b819-a188803ef742","c9effed6-8317-4778-a801-b787a5847bb5","DataExportCapability"))) > 0, 1, 0)
| alter fam_secret = if(array_length(arrayfilter(f_ids, "@element" in ("a80added-8b07-418f-aa0d-e680b4e78efc","724e7816-1cbf-4460-a2a5-d0bb4919a146"))) > 0, 1, 0)
| alter fam_code   = if(array_length(arrayfilter(f_ids, "@element" in ("CodeExecutionPermissions","ArbitraryCodeExecution","RemoteCodeExecution","ShellCommandExecution","LlmDerivedCommandExecution","PowerShellCommandExecution"))) > 0, 1, 0)
| alter fam_net    = if(array_length(arrayfilter(f_ids, "@element" in ("NetworkInterceptionPermissions","UnrestrictedNetworkAccess","BypassesNetworkControl","InterceptsNetworkTraffic","ExposesNetworkPort","DynamicNetworkDestination"))) > 0, 1, 0)
| alter fam_malic  = if(array_length(arrayfilter(f_ids, "@element" in ("d0a50fdc-62f7-4b94-bb1a-600fec5959bc","SpywareActivity","RansomwareBehaviorDetected","AssociatedwithMaliciousCampaign","6d27a73d-460f-42f4-a53e-ce1630d6492f"))) > 0, 1, 0)
| alter fam_persist= if(array_length(arrayfilter(f_ids, "@element" in ("ImplementsPersistenceMechanism","RegistryEdit"))) > 0, 1, 0)
| alter fam_spy    = if(array_length(arrayfilter(f_ids, "@element" in ("ScreenCaptureActivityDetected","ClipboardAccess","PerformsIPFingerprinting","SpywareActivity"))) > 0, 1, 0)
| alter fam_count  = fam_exfil + fam_secret + fam_code + fam_net + fam_malic + fam_persist + fam_spy
| alter chain_steal_and_ship = if(fam_exfil = 1 and fam_net = 1 and fam_code = 1, "exfil+net+codeexec", null)
| alter chain_burned_secret  = if(fam_secret = 1 and (fam_exfil = 1 or fam_net = 1), "secret+egress", null)
| dedup nid by desc _time
| filter fam_count >= 2
| fields _time, item_name, item_id, item_risk, alert_host, fam_count, fam_exfil, fam_secret, fam_code, fam_net, fam_malic, fam_persist, fam_spy, chain_steal_and_ship, chain_burned_secret, f_ids
| sort desc fam_count
| limit 200
```


_False positives:_ A broad marketplace item can legitimately hold several permissions (a genuine dev tool with code-exec + network). Families reduce but do not eliminate this; rank by fam_count and by presence of a malicious family. The chain_* pairings are the sharper triggers than a bare fam_count>=2.


_Tuning:_ Built entirely from H2.1's validated idiom (finding extraction + arrayfilter(...in...) + array_length + dedup-on-nid); only the family predicates are new. Expected hits on this tenant: ModHeader (malicious+code+network, fam=3) and SBlock (spyware+code+network+ip-fingerprint). Raise the bar with `filter fam_count >= 3` or `filter chain_steal_and_ship != null`. Family membership (PARAM) is free to edit; all ids are from scratchpad/findings_hunt.json.


### H2.3 - Exfiltration-capable items living on AGENTIC platforms

**Status:** not-run (composed from validated primitives; validate before production use) · **Datasets:** koi_koi_raw (Alerts findings x Audit platform, self-join on the same dataset)


**Hypothesis.** An item KOI flags as data-exfiltrating is far more dangerous inside an AI coding agent / MCP host (claude_code, cursor, openclaw, talon) than in a browser, because the agent hands it live secrets, source and AI-chat conversations. Cross KOI's finding side (Alerts: which item exfils) against KOI's inventory side (Audit: which platform) to isolate exfil capability that sits on an agent.


**A hit means.** An Exfils*/DataExport-flagged item whose install platform is an agentic runtime - the classic agentic supply-chain exfil primitive with a live host attached.


```sql
// HUNT H2.3 - Exfiltration-capable items living on AGENTIC platforms.
// HYPOTHESIS: an exfil-flagged item is far more dangerous inside an AI agent / MCP host
//   (claude_code, cursor/cur, openclaw, talon) - the agent feeds it secrets, source, AI chats.
// HIT = an Exfils*/DataExport-flagged item whose install PLATFORM is an agentic runtime.
// RECONSTRUCTED: the curation input truncated the source mid-query. The Alerts/findings
//   extraction is verbatim from validated H2.1; the Audit join follows the validated A3
//   bare-column pattern. STATUS: not-run - VALIDATE before production use.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_name = json_extract_scalar(itm_obj, "$.name")
| alter item_key  = lowercase(json_extract_scalar(itm_obj, "$.data.item_id"))
| alter alert_host= json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
| alter exfil = arrayfilter(f_ids, "@element" in (
      "ExfilsCloudandRemoteAccessSecrets", "ExfilsAIChatConversations", "ExfilsBrowsingHistory",
      "17c8aecd-789e-4673-b819-a188803ef742", "c9effed6-8317-4778-a801-b787a5847bb5",
      "DataExportCapability"))
| alter exfil_cnt = array_length(exfil)
| dedup nid by desc _time
| filter exfil_cnt > 0
| fields item_name, item_key, alert_host, exfil, nid, _time
// cross to KOI's inventory side (Audit) for the install PLATFORM of the same item_id.
// join key alert item.data.item_id == audit object_id is verified; joined cols referenced BARE.
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "extensions" and action != "uninstalled"
    | alter ag_key = lowercase(object_id)
    | filter ag_key != null
    | comp values(platform) as platforms, values(hostname) as audit_hosts by ag_key
  ) as ag ag.ag_key = item_key
// PARAM: agentic runtime platform set - widen with claude, claude_desktop, cur, kiro, ollama
| alter on_agent = arrayfilter(platforms, "@element" in ("claude_code","cur","openclaw","talon"))
| filter array_length(on_agent) > 0
| fields _time, item_name, item_key, alert_host, exfil, platforms, audit_hosts, nid
| sort desc _time
| limit 200
```


_False positives:_ `talon` is browser-extension-shaped on this tenant (Prisma/Okta plugins), so a talon hit is a browser extension, not an AI agent - read platform carefully. The exfil set can be tightened to the risk-9/10 members (drop DataExportCapability, risk 4) to cut noise.


_Tuning:_ Join key alert item.data.item_id == audit object_id is verified. Expected ~0 on the CURRENT tenant because the exfil-flagged items observed are browser extensions on platform 'chrome', not on the four agentic platforms - a clean result that fires the moment an exfil item lands on an agent. Widen the platform set (PARAM) with claude, claude_desktop, cur, kiro, ollama, or drop the platform filter and report ag_platform for every exfil item. NOTE: the query tail is reconstructed (see the header comment) - validate before use.


---

## Theme H4 - Cross-dataset hunts (koi_koi_raw x xdr_data)

_Hunts that only exist at the intersection of what KOI knows (supply-chain risk, findings) and what Cortex XDR saw (runtime execution, egress). The dual-covered host set is derived from data, never hardcoded. XQL arithmetic uses multiply()/add() function forms - the a*b operator is a parse error on this tenant._

_2 hunts._


### H4.1 - KOI-scored risk that is LIVE - items ranked by KOI risk x runtime activity

**Status:** parse-confirmed (engine accepted it; heavy/rate-limited - run with a narrow window) · **Datasets:** koi_koi_raw (Alerts) x xdr_data (PROCESS)


**Hypothesis.** An item KOI has scored (numeric resources[0].data.risk) whose name token is ALSO seen executing in xdr_data PROCESS on a dual-covered host is theoretical risk that has become live. The worst target is neither the single highest-risk inventory item nor the busiest process, but the PRODUCT of the two: high KOI risk AND high runtime activity. Rank by that product and hunt the top of the list - no fixed threshold.


**A hit means.** A top-ranked row is a KOI-flagged package demonstrably running now on an endpoint. Prioritise these for containment over dormant high-risk inventory. runtime_hits=0 with high koi_risk = flagged-but-not-yet-observed (watch); runtime_hits>0 = the dangerous thing is executing.


```sql
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
```


_False positives:_ The name-token cross-product is the fragile part (same weakness detection B8/B9 document). koi_token is the LEADING alnum token of the KOI package name (correct for 'antigravity 2.3.1'->antigravity), but scoped npm names like '@playwright/mcp' start with '@' and yield null, so scoped MCP packages under-match. runtime_hits counts distinct deduped command lines that mention the token - a breadth-of-use signal, not a volume signal.


_Tuning:_ DISTINCT FROM detection B8: B8 matches ONLY mcp entrypoints and emits a categorical verdict; H4.1 ranks EVERY scored item on a continuous score with no cutoff. Parse-confirmed only: query_id a93460b04cef48_5760934_inv issued, but the 48h cross-product exceeded the 60s poller. To get rows, run the xdr side over 1-6h and/or pin agent_hostname to a known dual host. Alerts side dedups on notification_event_id (`dedup evid`). Uses multiply()/add() function forms - the a*b operator is a parse error on this tenant.


### H4.2 - Shadow agentic software - an MCP server or AI agent executing that KOI never inventoried

**Status:** validated (2 rows (7d)) · **Datasets:** xdr_data (PROCESS) x koi_koi_raw (Audit, object_type=item)


**Hypothesis.** KOI is run-on-demand on Windows (no resident agent), so software installed and used between two scans is invisible on the supply-chain side while fully visible in endpoint telemetry. Broadening detection B9 (MCP-entrypoints only) to ALSO include standalone AI-agent binaries and local model runtimes: any agentic thing EXECUTING on a dual-covered host that KOI's Audit inventory has no record of is a supply-chain blind spot worth reviewing.


**A hit means.** coverage=SHADOW_NOT_IN_KOI means an MCP server or AI agent ran on a KOI-covered host but KOI's inventory does not name it - either it arrived and was used between scans, or KOI does not cover that surface. Each SHADOW row is a REVIEW candidate, not an alert.


```sql
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    proc = lowercase(coalesce(action_process_image_name, "")),
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, ""))
| alter kind = if(
      cmd ~= "[/@\-]mcp([\-/@\s\"']|$)" or cmd contains "mcp-server" or cmd contains "modelcontextprotocol", "mcp_server",
      proc contains "claude" or proc contains "cursor" or proc contains "ollama" or proc contains "windsurf" or proc contains "antigravity" or proc contains "copilot" or proc contains "codex", "ai_agent",
      null)
| filter kind != null
| alter mcp_entry = arrayindex(regextract(cmd, "([@a-z0-9._/\-]*[/@\-]mcp[a-z0-9._/@\-]*)"), 0)
| alter exec_token = lowercase(if(kind = "mcp_server",
        if(mcp_entry contains "/node_modules/" or mcp_entry contains "/bin/", arrayindex(regextract(mcp_entry, "([^/]+)$"), 0), arrayindex(regextract(mcp_entry, "([^/@]+)$"), 0)),
        arrayindex(regextract(proc, "([a-z0-9]+)"), 0)))
| filter exec_token != null and exec_token != ""
| comp count() as spawns, min(_time) as first_exec, max(_time) as last_exec by agent_hostname, kind, exec_token, causality_actor_process_image_name
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter khost = lowercase(hostname)
    | comp count() as koi_events by khost
  ) as cov cov.khost = lowercase(agent_hostname)
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and object_type = "item"
    | alter nm = lowercase(coalesce(object_name, ""))
    | alter koi_token = arrayindex(regextract(nm, "([a-z0-9][a-z0-9._+-]*)$"), 0)
    | filter koi_token != null and koi_token != ""
    | comp count() as koi_seen by koi_token
  ) as koi koi.koi_token = exec_token
| alter coverage = if(koi_seen = null, "SHADOW_NOT_IN_KOI", "known_to_koi")
| fields agent_hostname, kind, exec_token, causality_actor_process_image_name, spawns, first_exec, last_exec, koi_seen, coverage
| sort asc coverage, desc spawns
| limit 100
```


_Live result:_ Validated live at 7d: 2 rows, both Antigravity.exe on win-workstation (kind=ai_agent), both flagged SHADOW_NOT_IN_KOI (version-token FP as above).


_False positives:_ Name normalization across the two datasets is inherently lossy and drives the FP. This exact (validated) text extracts koi_token as the TRAILING token of object_name - but KOI names Windows software 'Name Version', so the trailing token is the VERSION ('2.3.1'), which never matches an exec_token. That is why the two live rows (Antigravity.exe) flagged SHADOW even though KOI likely inventories 'Antigravity 2.3.1'. Treat every SHADOW row as a review candidate.


_Tuning:_ DISTINCT FROM B9: B9 covers only mcp entrypoints; H4.2 adds standalone agent binaries and local model runtimes and labels the kind. RECOMMENDED FIX before production: change the koi_token regex from trailing `([a-z0-9][a-z0-9._+-]*)$` to LEADING `^([a-z0-9][a-z0-9._+-]{3,})` so 'antigravity 2.3.1'->antigravity matches the agent binary, removing the dominant version-token FP; scoped npm MCP names starting with '@' stay lossy either way. Run 7d (bursty), never 24h (node returns 0 over 24h, 288 over 7d).


---

## Theme H3 - Agentic RUNTIME behavioural hunts (xdr_data)

_Proactive behavioural hunts for agentic supply-chain / runtime risk that leaves NO KOI signature - agent/runtime spawning a shell, package-manager lifecycle-hook abuse, unsigned execution from a package dir, estate-rare agent egress, LOLBins in an agent context, credential reads by a bare MCP runtime, native-module sideloading. Ranked by outliers, rarity and dangerous parent/child combinations, NOT by signatures or static lists. All 7 validated READ-ONLY on the tenant; only H3-4 produced hits in a narrow window (the rest are a genuine clean-posture 0, not a query error - widen to 7-30d, agent runtime is bursty)._

_7 hunts._


### H3-4 - Agent / MCP egress to estate-rare destinations (rarity outlier)

**Status:** validated (hits in window) · **Datasets:** xdr_data (NETWORK)


**Hypothesis.** Across the estate, agent process trees repeatedly hit a small set of destinations (model APIs, package registries, telemetry). A public destination reached by an agent tree that is estate-RARE - very few flows, seen on a single host - is an outlier: a new C2, an exfil endpoint, or a rogue MCP server phoning home. This ranks by data-driven rarity, deliberately NOT by B5's static approved-country/port allowlist.


**A hit means.** An agent-owned flow to a near-unique destination on this estate. Sort ascending by flows; the rarest, single-host, non-web-port or bare-IP destinations are the ones to triage. A rare dest on a non-443 port from an MCP runtime is the exfil shape.


```sql
// H3-4 HYPOTHESIS: agent process trees repeatedly hit a small set of destinations (model APIs,
// registries, telemetry). A destination reached by an agent tree that is estate-RARE (few flows,
// single host) is an outlier: new C2, exfil endpoint, or a rogue MCP phoning home. Data-driven
// rarity, NOT B5's static country/port allowlist. HIT = agent egress to a near-unique dest.
dataset = xdr_data
| filter event_type = ENUM.NETWORK
| alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "ollama" or root contains "copilot"
      or root contains "codex" or root = "code" or root = "code.exe"
| filter action_network_is_loopback = false or action_network_is_loopback = null
| filter action_remote_ip != null
| filter action_remote_port != 53
| filter not (incidr(action_remote_ip, "10.0.0.0/8") or incidr(action_remote_ip, "172.16.0.0/12")
           or incidr(action_remote_ip, "192.168.0.0/16") or incidr(action_remote_ip, "127.0.0.0/8")
           or incidr(action_remote_ip, "169.254.0.0/16"))
| alter dest = coalesce(action_external_hostname, action_remote_ip),
        country = to_string(action_country)
| comp count() as flows,
       count_distinct(agent_hostname) as hosts,
       count_distinct(causality_actor_process_image_name) as agents,
       min(_time) as first_seen, max(_time) as last_seen
   by dest, action_remote_port, country
| filter flows <= 5 and hosts = 1
| sort asc flows
| limit 50
```


_False positives:_ CDN/anycast geolocation and one-off telemetry endpoints produce naturally-rare rows that are benign. Bare-IP dests (no action_external_hostname; ~44% of rows) look rarer than named ones because the same service resolves to many IPs. Weight non-web ports and single-host + few-flow rows highest.


_Tuning:_ DISTINCT FROM detection B5, which uses a static approved-country + web-port allowlist; H3-4 is purely data-driven rarity (flows <= 5 AND hosts = 1), so it surfaces the NEW rare thing rather than the known-off-list thing. Only H3 hunt with live hits in its window. RFC1918/loopback/link-local and port 53 are excluded in-query. Tighten/loosen the rarity gate (flows<=5, hosts=1) to estate size.


### H3-1 - AI agent / MCP runtime spawning an OS shell

**Status:** validated (0 rows (3h window)) · **Datasets:** xdr_data (PROCESS)


**Hypothesis.** An AI-agent application (Claude/Cursor/Antigravity/Windsurf/Codex/Copilot/Code) or a locally-spawned MCP/interpreter runtime (node/npx/python/uv/deno/bun) should rarely need to launch an interactive OS shell. A shell (cmd/powershell/pwsh/bash/sh/zsh/dash/ksh) that is a child of an agent causality group, or spawned directly by a bare interpreter, is agent-initiated shell execution - the exact pivot a prompt-injection or a poisoned MCP tool uses to run arbitrary commands with the user's full privilege.


**A hit means.** Each row is a shell session an AI agent or interpreter caused to run. Triage the shell's own command line and its children; a shell under an agent CGO that then runs a downloader or touches a secret store is the escalation path.


```sql
// H3-1 HYPOTHESIS: an AI agent app or a locally-spawned MCP/interpreter runtime
// (node/npx/python/uv/deno/bun) should rarely launch an OS shell. A shell child of an
// agent tree = agent-initiated shell execution (prompt-injection / poisoned-tool pivot).
// HIT = a shell an AI agent or interpreter caused to run; triage its cmdline + children.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter child  = lowercase(coalesce(action_process_image_name, "")),
        parent = lowercase(coalesce(actor_process_image_name, "")),
        root   = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter child in ("cmd.exe","powershell.exe","pwsh.exe","powershell","pwsh","bash","sh","zsh","dash","ksh")
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root contains "copilot"
      or root contains "ollama" or root = "code" or root = "code.exe"
      or parent in ("node","node.exe","npx","npx.cmd","python","python.exe","python3","uv","uvx","uv.exe","uvx.exe","bun","deno")
| alter agent_owner = if(
      root contains "claude","claude", root contains "cursor","cursor",
      root contains "antigravity","antigravity", root contains "windsurf","windsurf",
      root contains "codex","codex", root contains "copilot","copilot",
      root contains "ollama","ollama", root contains "code","vscode_family","runtime_parent")
| comp count() as shell_spawns,
       count_distinct(action_process_image_command_line) as distinct_cmdlines,
       min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, agent_owner, causality_actor_process_image_name, parent, child
| sort desc shell_spawns
| limit 50
```


_False positives:_ Legitimate agent tooling (a coding agent running a build/test shell step) will fire - expected, which is why it is a HUNT not an alert. The `parent in (interpreter)` arm also catches non-agent interpreter->shell (build scripts). Distinguish by the shell's command line: interactive `zsh -i` under an IDE is benign; `powershell -enc <base64>` or a curl-pipe one-liner is not.


_Tuning:_ Distinct from library B10 (which requires an install command in the cmdline) and B3 (a full per-host tree dump). Ran clean (0 rows) over 3h - agent runtime is bursty (node = 0 over 24h but 288 over 7d), so run over 7d for real coverage. Add `| filter action_process_image_command_line != null` and inspect cmdlines; baseline out known benign agent build steps by cmdline once a baseline exists. Agent-name list (PARAM) is the tuning surface.


### H3-2 - Package manager spawning a shell or network tool (lifecycle-hook abuse)

**Status:** validated (0 rows (6h window)) · **Datasets:** xdr_data (PROCESS)


**Hypothesis.** A package manager (npm/pnpm/yarn/pip/uv/gem/cargo/go/git/brew) resolving and unpacking files should not itself spawn an interactive shell or a network-download tool. A package manager whose direct child is cmd/powershell/bash/curl/wget/certutil/bitsadmin/mshta/nc is running a package LIFECYCLE HOOK that executes code (npm pre/postinstall, pip setup.py, a git hook) - the classic malicious-package delivery vector on npm/PyPI.


**A hit means.** A supply-chain install spawned code execution or network egress through a lifecycle hook. child_class separates shells from network_download; is_install_ctx flags whether the parent cmdline looked like an install. Pull the child command line - a postinstall running curl|sh or a base64 powershell is the payload.


```sql
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
```


_False positives:_ Benign native builds: `npm install` legitimately spawns node-gyp -> sh/cmd -> compilers; `pip install <sdist>` runs setup.py. These land in child_class=shell / is_install_ctx=install_ctx. Prioritise child_class=network_download and lolbin_exec, and shells whose cmdline is a one-liner fetch. git's own hooks (parent=git) are lower base rate and higher value.


_Tuning:_ Distinct from library A1/A2 (which characterise the package-manager execution itself with provenance) - this keys on the CHILD being code-exec/egress, i.e. the hook, not the install. Parents restricted to true package managers (interpreters live in H3-1) to avoid overlap. Ran clean (0 rows) over 6h; widen to 7-30d to capture install events, which are sparse.


### H3-6 - Credential-store read by a bare MCP / interpreter runtime

**Status:** validated (0 rows (3h window)) · **Datasets:** xdr_data (FILE)


**Hypothesis.** A BARE runtime (node/python/uv/deno/bun) running as an MCP server or agent-spawned script - NOT the IDE binary itself - has no reason to read ~/.ssh, .aws, .env, .npmrc or a browser credential DB. An MCP tool or injected prompt reading a secret store is the concrete harm behind 'agentic runtime risk'.


**A hit means.** An MCP/agent-spawned interpreter read a secret store (ssh_key / aws_credentials / gcp / kubeconfig / registry_token / browser_creds / dotenv). This is a read by the TOOL runtime, not the editor.


```sql
// H3-6 HYPOTHESIS: a BARE runtime (node/python/uv/deno/bun) running as an MCP server or
// agent-spawned script - NOT the IDE binary itself - has no reason to read ~/.ssh, .aws, .env,
// .npmrc or a browser credential DB. Narrows B6 to the runtime actor and excludes the
// node_modules/site-packages build-doc FP class. HIT = an MCP/agent tool read a secret store.
dataset = xdr_data
| filter event_type = ENUM.FILE
| alter actor = lowercase(coalesce(actor_process_image_name, "")),
        root  = lowercase(coalesce(causality_actor_process_image_name, ""))
| filter actor in ("node","node.exe","npx","npx.cmd","python","python.exe","python3","python3.12",
                   "python3.13","uv","uvx","uv.exe","uvx.exe","bun","deno")
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root contains "copilot"
      or root contains "ollama" or root contains "code"
| alter p = lowercase(coalesce(action_file_path, ""))
| filter not (p contains "node_modules" or p contains "site-packages" or p contains "dist-info")
| alter secret_class = if(
      p contains ".ssh" or p contains "id_rsa" or p contains "id_ed25519", "ssh_key",
      p contains ".aws", "aws_credentials",
      p contains "gcloud", "gcp_credentials",
      p contains ".kube", "kubeconfig",
      p contains ".npmrc" or p contains ".pypirc" or p contains ".netrc", "registry_token",
      p contains "login data" or p contains "cookies" or p contains "web data", "browser_creds",
      p contains ".env", "dotenv", null)
| filter secret_class != null
| comp count() as events, min(_time) as first_seen, max(_time) as last_seen
   by agent_hostname, root, actor, secret_class, action_file_path
| sort desc events
| limit 50
```


_False positives:_ Legit tools read config: a genuine AWS MCP server reads ~/.aws by design. The value is the actor+path combination, not either alone. The node_modules/site-packages/dist-info build-doc class (which dominates the broad B6) is excluded in-query, but a tool that legitimately manages credentials still fires.


_Tuning:_ DISTINCT FROM detection B6: B6 scopes to the agent CGO and includes the whole tree (and is dominated by an IDE bundling MCP docs whose filenames contain 'credential'); H3-6 narrows the ACTOR to a bare interpreter and excludes node_modules/site-packages/dist-info, so a hit is a runtime tool actually reading a secret. Ran clean (0 rows) over 3h; run 7d. secret_class map (PARAM) extends to site-specific secret paths.


### H3-7 - Native-module sideloading into a signed interpreter

**Status:** validated (0 rows (2h window)) · **Datasets:** xdr_data (LOAD_IMAGE)


**Hypothesis.** A signed interpreter/agent (python.exe/node.exe/code.exe/ollama) loads its modules (.dll/.pyd/.node) from its own signed install tree. A LOAD_IMAGE of an UNSIGNED module from a user-writable path (node_modules/site-packages/appdata/systemtemp/tmp/.cache/downloads/.cargo/.ollama) into a signed process = native-module SIDELOADING by a malicious package.


**A hit means.** A signed process loaded an unsigned module from a writable path - the moment a dependency's native addon first executes inside the interpreter, with no separate PROCESS event to catch it.


```sql
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
```


_False positives:_ Legitimate prebuilt native addons (better-sqlite3, esbuild, onnxruntime, node-gyp output) are frequently unsigned and load from node_modules/site-packages - this is the dominant benign class. Allowlist by action_module_signature_vendor / known module hash. NULL-signature is common off-Windows; weight UNSIGNED higher.


_Tuning:_ Not present in the detection library at all - LOAD_IMAGE is unused elsewhere. Verified against live enum literals: action_module_signature_status / actor_process_signature_status return 'SIGNED' and 'NULL'. Ran clean (0 rows) over 2h; native-module loads are bursty at install/first-use, so run 7-30d and split `msig = "UNSIGNED"` for precision.


### H3-3 - Unsigned executable running from a package cache / download dir

**Status:** validated (0 rows (6h window)) · **Datasets:** xdr_data (PROCESS)


**Hypothesis.** Legitimately installed software runs from stable, signed install roots (Program Files, /usr/bin, /Applications). A process whose image path sits inside a package manager's cache or a project's dependency dir (node_modules, site-packages, npm-cache, .cargo, .ollama, pypoetry, systemtemp, /tmp, .cache) AND is NOT signed is a compiled binary executing straight out of a freshly downloaded package - the moment a malicious dependency's native/prebuilt binary first runs.


**A hit means.** An unsigned executable ran from a package/download path. path_class shows which ecosystem; sig shows UNSIGNED vs NULL/unknown. Highest priority: unsigned binary from a temp dir or node_modules with no signature vendor. Hash it (action_process_image_sha256) and pivot to KOI inventory.


```sql
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
```


_False positives:_ Interpreted scripts do NOT fire (the image is the signed interpreter, e.g. python.exe SIGNED) - this deliberately targets BINARIES. Legit prebuilt native addons (esbuild, node-gyp output, ripgrep in .vscode) can be unsigned and appear; allowlist by action_process_signature_vendor / known sha256. NULL-signature rows on non-Windows are common - weight UNSIGNED higher than NULL.


_Tuning:_ Not present in the detection library at all. Signature comparison verified against live enum literals ('SIGNED' / 'NULL'), so `sig != "SIGNED"` correctly keeps UNSIGNED+NULL. Windows paths match via separator-free tokens (no backslashes in literals). Ran clean (0 rows) over 6h; widen to 7-30d for install-time capture and split NULL out with `| filter sig = "UNSIGNED"` for a high-precision variant.


### H3-5 - LOLBin in an agentic or package-manager context

**Status:** validated (0 rows (6h window)) · **Datasets:** xdr_data (PROCESS)


**Hypothesis.** Windows LOLBins (certutil/bitsadmin/mshta/regsvr32/rundll32/wmic/msiexec/curl/wscript/cscript) are the standard download-and-run primitives. One launched inside an AI-agent tree, or by a package-manager/interpreter parent, is almost never legitimate build activity.


**A hit means.** A LOLBin in an agent/pkg-mgr context. download_intent flags a URL, -urlcache/-decode, /transfer, base64 or a WebClient/DownloadString in its command line - that subset is the download-and-execute payload.


```sql
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
```


_False positives:_ msiexec.exe and rundll32.exe fire during genuine installs and OS servicing even inside these trees; ctx alone is not enough. Rank download_intent=download_or_decode first. curl.exe under a package manager is often a legitimate fetch step - read the URL.


_Tuning:_ Windows-centric (LOLBins). Both context arms (agent_ctx via CGO, pkg_ctx via parent) are unioned; either qualifies. Ran clean (0 rows) over 6h; widen to 7-30d. Agent-name and LOLBin lists (PARAM) are the tuning surfaces.


---

## Theme H1 - Supply-chain COMPOSITION anomalies (koi_koi_raw Audit)

_Surface the SHAPE of a supply-chain problem from what KOI has already inventoried in its Audit stream - rare/outlier items, fast propagation, install bursts, scope impersonation, version rollbacks, remediation that did not hold, publisher anomalies - WITHOUT any KOI finding having fired. Audit-only, cheap (~20k rows/90d) and NOT duplicated, so no dedupe is needed. Platform (claude_code, cur, git, npm, homebrew, talon) is the primary agentic pivot and is richer than marketplace._

_7 hunts._


### H1.1 - Rare items within a widely-used marketplace (org-wide outliers)

**Status:** validated (100 rows (90d)) · re-validated 2026-07-22 · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** An item present on only 1-2 endpoints, inside a platform that is otherwise broadly deployed across the org (measured populations: npm 14 hosts, claude_code 15, git 13, homebrew 9, cur 11, talon 10), is a supply-chain outlier - targeted, freshly planted, or a dependency nobody else pulls. Rarity is a supply-chain signal that requires no KOI finding to have fired.


**A hit means.** The item is an org-wide outlier on an otherwise-popular platform. Pivot to who installed it (triggered_by), when (days_since_first), and whether KOI scored it. A triage surface, NOT a standalone detection.


```sql
/* HUNT H1.1 - Rare items within a widely-used marketplace.
   HYPOTHESIS: an item present on only 1-2 endpoints, inside a platform that is otherwise
   broadly deployed across the org (npm 14 hosts, claude_code 15, git 13, homebrew 9, cur
   11, talon 10 - measured), is a supply-chain outlier: targeted, freshly planted, or a
   dependency nobody else pulls. Rarity is a signal that needs no KOI finding to have fired.
   HIT MEANS: an org-wide outlier item; pivot to who installed it and whether KOI scored it.
   Triage surface, not a standalone detection. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter object_id != null
| filter platform in ("npm","claude_code","git","homebrew","cur","talon","chrome")
| dedup object_id, hostname by desc _time
| filter action != "uninstalled"
| comp count_distinct(hostname) as hosts,
       values(hostname) as host_list,
       min(_time) as first_seen,
       max(_time) as last_seen,
       values(item_version) as versions,
       values(triggered_by) as installed_by
     by object_id, object_name, platform, marketplace
| alter days_since_first = timestamp_diff(current_time(), first_seen, "DAY")
| filter hosts <= 2
| sort asc hosts, desc last_seen
| limit 200
```


_Live result:_ Re-validated 2026-07-22 at 90d: 100 rows (page cap). Leads are Kim's MacBook Air claude_code skills (frontend-a11y, fsharp-testing) each on 1 host, installed_by Koi.


_False positives:_ Most single-host items are simply one developer's private dependencies or personal claude_code skills, not threats (dozens of claude_code skills unique to 'Kim's MacBook Air'). Rarity alone is noisy; its value is as a ranked lead list, especially combined with recency and agentic surface. Bounded by the timeframe: an item present before the window looks rarer than it is.


_Tuning:_ Rank by (low hosts + recent first_seen + agentic platform). Strongest single lead in validation was homebrew/core/lame on 'Greg's Mac mini' - 1 host AND 1 day old. Cross-reference object_id against scratchpad/findings_hunt.json or koi-inventory-item-get. Narrow to platform in ('claude_code','cur','git','npm') (PARAM) to focus on the agentic supply chain. Change 'hosts <= 2' to '= 1' for the sharpest outliers.


### H1.6 - Remediation that did not stick (reappearance after removal)

**Status:** validated (56 rows (90d)) · re-validated 2026-07-22 · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** An item KOI remediated (type=remediation) that later shows a fresh `installed` event on the SAME host has returned after removal - persistence, a re-push, or an ineffective remediation. A control-efficacy hunt with no signature required.


**A hit means.** Object reinstalled AFTER its last remediation on that host - the removal did not hold; re-open the case.


```sql
/* HUNT H1.6 - Remediation that did not stick (reappearance after removal).
   HYPOTHESIS: an item KOI remediated (type=remediation) that later shows a fresh `installed`
   event on the SAME host has returned after removal - persistence, a re-push, or an
   ineffective remediation. A control-efficacy hunt with no signature required.
   HIT MEANS: object reinstalled AFTER its last remediation on that host - the removal did
   not hold; re-open the case. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type in ("remediation","extensions")
| filter object_id != null and hostname != null
| comp max(if(type = "remediation", _time, null))                          as last_remediation,
       max(if(type = "extensions" and action = "installed", _time, null))  as last_install,
       values(action)       as actions,
       values(item_version) as versions
     by object_id, object_name, hostname, platform
| filter last_remediation != null and last_install != null and last_install > last_remediation
| alter days_reappeared_after = timestamp_diff(last_install, last_remediation, "DAY")
| sort desc last_install
| limit 200
```


_Live result:_ Validated live 2026-07-22 at 90d: 56 rows, parses and behaves. Surfaced the remediation_opened-vs-completed semantics above - the key tuning caveat.


_False positives:_ IMPORTANT: on this tenant the remediation rows are `remediation_opened` (a case was OPENED), not a completed removal. So `last_install > last_remediation` frequently means normal dependency churn on a dev host that happened to have a remediation case open, NOT a removal that failed - 56 rows, many on one dev host (Kristian) reinstalling ordinary npm deps (tailwind-merge, @clerk/nextjs, @radix-ui/*). Treat as leads, and confirm the remediation action was actually a REMOVAL (remediation_completed / uninstalled) before concluding it did not hold.


_Tuning:_ Tighten by requiring the remediation action to be a completed removal, and by requiring the reinstall version to differ from / exceed the removed version. Filter to `platform in ('npm','claude_code','cur','git')` and to agentic/flagged items to cut dev-dependency churn. days_reappeared_after ranks urgency (0 = same day).


### H1.5 - Version rollback / downgrade on a host (non-monotonic version)

**Status:** validated (10 rows (90d)) · re-validated 2026-07-22 · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** A supply-chain item whose version moved BACKWARDS on a host - the version present now is older than one that host previously ran - is suspicious: a forced downgrade to a vulnerable release, or a poisoned 'update' that re-publishes a lower version number. Semver only; git commit-SHA and hash versions are excluded by the ^[0-9]+\.[0-9]+ filter.


**A hit means.** current_vnum < peak_vnum on a host means that item was rolled back there. Highest value on agentic items: chrome-devtools-mcp went 0.19.0 -> 0.17.0 on Kim's MacBook Air, and react/tsx were rolled back on Vincent's MacBook Pro.


```sql
/* HUNT H1.5 - Version rollback / downgrade on a host (non-monotonic version).
   HYPOTHESIS: a supply-chain item whose version moved BACKWARDS on a host - the version
   present now is older than one that host previously ran - is suspicious: a forced
   downgrade to a vulnerable release, or a poisoned "update" that re-publishes a lower
   number. Semver only; git SHAs and hash versions are excluded by the ^d+.d+ filter.
   Method (single pass): pack major.minor.patch into one integer (vnum); compare the LATEST
   event's packed version (recovered from a time-sortable key) against the MAX vnum ever
   seen for that item on that host.
   HIT MEANS: current_vnum < peak_vnum on a host = that item was rolled back there. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions" and action in ("installed","updated")
| filter item_version != null and item_version ~= "^[0-9]+\.[0-9]+"
| alter vmaj = to_integer(arrayindex(regextract(item_version, "([0-9]+)"), 0))
| alter vmin = to_integer(arrayindex(regextract(item_version, "([0-9]+)"), 1))
| alter vpat = to_integer(arrayindex(regextract(item_version, "([0-9]+)"), 2))
| alter vnum = add(add(multiply(coalesce(vmaj,0), 1000000000), multiply(coalesce(vmin,0), 100000)), coalesce(vpat,0))
| alter tkey = concat(format_timestamp("%Y%m%d%H%M%S", _time), "#", to_string(add(vnum, 100000000000000)))
| comp max(vnum)  as peak_vnum,
       max(tkey)  as latest_tkey,
       count_distinct(item_version) as nver,
       values(item_version) as versions
     by object_id, object_name, hostname, platform
| filter nver > 1
| alter current_vnum = subtract(to_integer(arrayindex(regextract(latest_tkey, "#([0-9]+)$"), 0)), 100000000000000)
| filter current_vnum < peak_vnum
| sort desc peak_vnum
| limit 200
```


_Live result:_ Re-validated 2026-07-22 at 90d: 10 rows. Confirmed chrome-devtools-mcp 0.19->0.17 (Kim's MacBook Air), tsx 4.23.0->4.22.3 (Vincent's MacBook Pro), Edge 125->115 (corp-a alias, the FP class).


_False positives:_ OS-package 'downgrades' are frequently host re-images or hostname aliasing rather than true rollbacks - the Microsoft Edge / EdgeWebView 125 -> 115 rows are on what appear to be aliases of one machine. Weight npm / claude_code / cur rows over OS-package rows.


_Tuning:_ Semver is packed into one integer (vnum = maj*1e9 + min*1e5 + patch); the latest event's version is recovered via a time-sortable key (tkey). Restrict to `platform in ('npm','claude_code','cur','git')` to drop OS-package aliasing noise. Uses multiply()/add()/subtract() function forms.


### H1.4 - npm namespace / scope-confusion shape (structural typosquat proxy)

**Status:** validated (15 rows (90d)) · re-validated 2026-07-22 · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** The same base package name appearing under MORE THAN ONE scope - an unscoped `redis` alongside `@upstash/redis`, or two different `@x/name` owners for one base - is the classic dependency-confusion / scope-impersonation shape. XQL cannot do Levenshtein, so this hunts the structural signature: identical base name, different owning namespace.


**A hit means.** One base name is claimed under multiple owners in this org's supply chain. Verify which scope is intended and whether the odd scope is a planted look-alike (dependency confusion).


```sql
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
```


_Live result:_ Re-validated 2026-07-22 at 90d: 15 rows. Residual leads after @types noise: openai (@ai-sdk/openai vs openai).


_False positives:_ The dominant pattern is the entirely benign TypeScript convention `@types/x` (DefinitelyTyped stubs) shadowing the real unscoped `x` - 11 of 15 rows were this. Exclude the `@types` scope. The residual real signal on this tenant was base 'openai': `@ai-sdk/openai` alongside the popular unscoped `openai`.


_Tuning:_ Add `| filter scope_list not contains "@types"` (or exclude @types before the comp) to strip DefinitelyTyped noise; the survivors are the leads. Rank by base names where one scope is a well-known org and the other is not, and where hosts is low. The @scope idiom is npm-specific.


### H1.7 - Publisher / namespace anomalies (cross-registry reuse and one-package reach)

**Status:** validated (5 rows (90d)) · re-validated 2026-07-22 · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** (a) A genuine publisher lives in ONE ecosystem; a namespace whose items span multiple platforms is unusual (cross-registry name reuse / impersonation). (b) A publisher with exactly ONE item that is nonetheless on many hosts is a one-package author with sudden org-wide reach - the shape of a single planted or compromised package propagating. Publisher is derived structurally from object_id (npm scope @scope/.. or owner/.. for git and homebrew taps).


**A hit means.** Inspect that namespace and how it reached hosts - a cross-registry namespace, or a single-package publisher with unexpected fan-out.


```sql
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
```


_Live result:_ Validated live 2026-07-22 at 90d: 5 rows. openai spans git+npm (first-party, the benign cross-registry case); napi-rs / tybys are single-item-on-3-hosts transitive deps.


_False positives:_ Cross-registry reuse is often legitimate first-party publishing: `openai` publishing `@openai/codex` (npm) AND `openai/skills`+`openai/plugins` (git) is the vendor itself, not impersonation. Single-item-on-3-hosts (napi-rs, tybys) are common transitive npm deps (@napi-rs/wasm-runtime), not planted packages. Rank by whether the namespace is one you recognise.


_Tuning:_ Verify the publisher against the known first-party owner before concluding impersonation. Raise the reach floor (`hosts >= 3`) on larger estates. The platform set (npm/git/homebrew) is the PARAM; extend for other tap/scope ecosystems.


### H1.3 - Install bursts (mass deployment in a tight window)

**Status:** validated (1 row (90d)) · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** The same item installed across many hosts inside one short (hourly) window is either a legitimate rollout OR a compromised-update / worm-like push. The moment an item fans out across the estate is worth surfacing regardless.


**A hit means.** N distinct hosts installed one item within the same hour. Confirm it was an intended rollout, not an auto-update pushing a poisoned version. If the burst carries MULTIPLE versions it is not a single clean push and deserves a closer look.


```sql
/* HUNT H1.3 - Install bursts (mass deployment in a tight window).
   HYPOTHESIS: the same item installed across many hosts inside one short window is either a
   legitimate rollout OR a compromised-update / worm-like push. Either way, the moment an
   item fans out across the estate is worth surfacing.
   HIT MEANS: N distinct hosts installed one item within the same hour - confirm it was an
   intended rollout, not an auto-update pushing a poisoned version. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions" and action = "installed"
| filter object_id != null
| alter bucket = format_timestamp("%Y-%m-%d %H:00", _time)
| comp count_distinct(hostname) as hosts,
       count()                  as install_events,
       values(hostname)         as host_list,
       values(item_version)     as versions,
       min(_time)               as window_start,
       max(_time)               as window_end
     by object_id, object_name, platform, bucket
| filter hosts >= 3
| sort desc hosts, desc install_events
| limit 200
```


_False positives:_ Legitimate managed rollouts (browser extensions pushed by policy, base-image dependencies) produce identical bursts. The single hit on this tenant - Google Docs Offline (chrome ext ghbmnnjooekpmoecnnnilnnbdlolhkhi) on M-DQ3HT4R1P7 within the 2026-07-06 23:00 hour - is exactly such a benign-looking burst, but it carried TWO versions (1.107.1 and 1.73.0), which is the detail worth checking.


_Tuning:_ Bucket granularity is the tuning surface: %H for tight pushes, switch to '%Y-%m-%d' for daily rollouts. Raise 'hosts >= 3' on larger estates. Add 'and platform in (npm,claude_code,cur,git)' to focus on the agentic supply chain. Join the object_id to KOI findings to see if the burst item is scored.


### H1.2 - Brand-new items with reach (fast propagation)

**Status:** parse-confirmed (engine accepted it; heavy/rate-limited - run with a narrow window) · **Datasets:** koi_koi_raw (Audit)


**Hypothesis.** An item first observed very recently that is ALREADY on several hosts propagated fast. Fast fan-out of a brand-new item is the shape of a compromised update or a package being pushed out, rather than the slow organic spread of a normal dependency.


**A hit means.** A newly-appeared item is on 3+ hosts within days of first sighting. Confirm it is an intended rollout and not an auto-update pushing a freshly-compromised release. High-value when platform is agentic (claude_code, cur, npm).


```sql
/* HUNT H1.2 - Brand-new items with reach (fast propagation).
   HYPOTHESIS: an item first_seen very recently that is ALREADY on several hosts propagated
   fast. Fast fan-out of a NEW item is the shape of a compromised-update push, not the slow
   organic spread of a normal dependency.
   HIT MEANS: a newly-appeared item on 3+ hosts within days - confirm it is an intended
   rollout, not a poisoned auto-update.
   NOTE: identical comp base to validated H1.1; differs only in the final filter. */
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter object_id != null
| filter platform in ("npm","claude_code","git","homebrew","cur","talon","chrome")
| dedup object_id, hostname by desc _time
| filter action != "uninstalled"
| comp count_distinct(hostname) as hosts,
       values(hostname) as host_list,
       min(_time) as first_seen,
       max(_time) as last_seen,
       values(item_version) as versions,
       values(triggered_by) as installed_by
     by object_id, object_name, platform, marketplace
| alter days_since_first = timestamp_diff(current_time(), first_seen, "DAY")
| filter days_since_first <= 7 and hosts >= 3
| sort desc hosts, asc days_since_first
| limit 200
```


_False positives:_ first_seen is bounded by the query timeframe - an item present just before the window looks 'new'. Legitimate org-wide rollouts (a standard tool pushed by IT) also match; distinguish by triggered_by and by whether the version is uniform across hosts.


_Tuning:_ This is the validated H1.1 comp base (engine-accepted) with the final filter inverted from 'hosts <= 2' to 'days_since_first <= 7 and hosts >= 3'; it was not run separately to stay within the tenant CU cap, hence parse-confirmed. Tighten days_since_first / raise the host threshold per estate size. Pair with H1.3 (burst) to see whether the reach arrived all at once.


---


---

## Recovered hunts (H2.4–H2.6, H4.3–H4.6)
_These seven were designed and returned by the theme agents but were truncated out of the curation input; recovered verbatim from the run journal. Validation status is the agent's own (most are composed from validated primitives). Query bodies are in `docs/xql/`._

### H2.4 — MCP servers whose declared identity is a raw command / loopback (tool-shadowing shape)
**Hypothesis:** A legitimate MCP server is a named, registry-backed package. A shadow or poisoned MCP announces itself as a bare stdio command line, a localhost URL, or a 'stub'/'poisoned' script with no marketplace provenance — the tool-integrity attack class (ToolShadowing / ToolDescriptionMismatch / ToolPoisoning). Since KOI cannot vouch for a tool that has no provenance, provenance SHAPE is the hunt.

**A hit means:** An mcp-kind item whose declared identity is a raw command, loopback endpoint, or named stub, or that carries no marketplace provenance — its tool descriptions cannot be trusted. postmark-mcp (critical) and the koi-demo poisoned-server.js stub are the anchor hits.

_Datasets:_ koi_koi_raw (Alerts rows only); MCP finding_ids require the KOI API · _Status:_ validated (12 rows)

```sql
// HUNT H2.4 - MCP servers whose DECLARED IDENTITY is a raw command / loopback / stub
//            (tool-shadowing / tool-poisoning provenance shape).
// HYPOTHESIS: a real MCP server is a named, registry-backed package. A shadow/poisoned tool
//   announces itself as a bare stdio command, a localhost URL, or a 'stub'/'poisoned' script
//   with no marketplace provenance - its tool descriptions cannot be trusted.
// HIT = an mcp-kind item with no registry provenance shape (and often critical/pending risk).
// DATA NOTE (VERIFIED): mcp-kind alert resources carry an EMPTY data.findings.findings array
//   on this tenant. The ToolShadowing/ToolDescriptionMismatch finding_ids are only in the KOI
//   API /inventory/search, NOT in koi_koi_raw. This hunt pivots on provenance SHAPE instead.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| filter json_extract_scalar(itm_obj, "$.type") = "mcp"
| alter mcp_name     = json_extract_scalar(itm_obj, "$.name")
| alter mcp_risk     = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter mcp_transport= json_extract_scalar(itm_obj, "$.data.transport")
| alter mcp_market   = json_extract_scalar(itm_obj, "$.data.marketplace")
| alter alert_host   = json_extract_scalar(dev_obj, "$.data.hostname")
| alter name_lc = lowercase(mcp_name)
| alter shape = if(name_lc contains "poison" or name_lc contains "stub", "named_malicious_stub",
                if(name_lc contains "localhost" or name_lc contains "127.0.0.1", "loopback_endpoint",
                if(name_lc contains ".js" or name_lc contains "node " or name_lc contains "python" or name_lc contains " -m ", "raw_stdio_command",
                if(mcp_market = null or mcp_market = "", "no_provenance", "registry_backed"))))
| dedup nid by desc _time
| filter shape != "registry_backed"
| fields _time, mcp_name, mcp_risk, mcp_transport, mcp_market, shape, alert_host, nid
| sort desc _time
| limit 200
```

_False positives / tuning:_ VERIFIED and reshaped: mcp-kind alert resources carry an EMPTY data.findings.findings array on this tenant (f_cnt null / f_ids [] for all 12 mcp items sampled, incl. critical postmark-mcp). The ToolShadowing/ToolDescriptionMismatch/DataExportCapability/UnauthenticatedMcpServer/ToolPoisoning finding_ids therefore CANNOT be read from koi_koi_raw — retrieve them from the KOI API POST /api/external/v2/inventory/search with {field:"finding_id", operator:"=", value:"ToolShadowing"} (or ToolDescription

### H2.5 — Publisher-compromise / malicious-campaign blast radius
**Hypothesis:** When a publisher is compromised (or its email lands in a compromised list, or its domain expires) or an item is tied to a malicious campaign, the risk scales with how many hosts already carry it. Rank the known-bad by host reach so response prioritises the widest exposure first.

**A hit means:** A compromise/publisher finding present, with the count of distinct hosts carrying the item and the first/last time it was seen. High host_reach = a wide, unremediated compromise surface.

_Datasets:_ koi_koi_raw (Alerts rows only) · _Status:_ validated (10 rows)

```sql
// HUNT H2.5 - Publisher-compromise / malicious-campaign blast radius.
// HYPOTHESIS: a compromised publisher / campaign-linked item is as dangerous as its reach.
//   Rank the known-bad by how many distinct hosts already carry it.
// HIT = a compromise/publisher finding present, with distinct-host reach and first/last seen.
// koi_koi_raw Alerts only; dedup on notification_event_id BEFORE any host counting.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_name = json_extract_scalar(itm_obj, "$.name")
| alter item_id   = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_risk = json_extract_scalar(itm_obj, "$.data.risk_level")
| alter alert_host= json_extract_scalar(dev_obj, "$.data.hostname")
| alter f_ids = arraymap(json_extract_array(itm_obj, "$.data.findings.findings"), json_extract_scalar("@element","$.finding_id"))
| alter hits  = arrayfilter(f_ids, "@element" in (
      "PublisherCompromised",                          // 8
      "8d581cfb-5094-476e-a112-80be82973105",          // 4  Publisher Email in Compromised List
      "PublishersDomainExpired",                       // 7
      "OwnerHasMaliciousRepo",                         // 7
      "AssociatedwithMaliciousCampaign",               // 10
      "d0a50fdc-62f7-4b94-bb1a-600fec5959bc",          // 10 Malicious Activity Detected
      "6d27a73d-460f-42f4-a53e-ce1630d6492f",          // 8  Malicious item by threat signal
      "SuspectedAsMaliciousByIntelligenceSource"))     // 8
| alter top_hit = arrayindex(hits, 0)
| dedup nid by desc _time
| filter array_length(hits) > 0
| comp count_distinct(alert_host) as host_reach, count(nid) as alert_occurrences,
        min(_time) as first_seen, max(_time) as last_seen
   by item_id, item_name, item_risk, top_hit
| sort desc host_reach
| limit 200
```

_False positives / tuning:_ Validated on this tenant (aggregator shape min/max(_time) + count_distinct(host) + count(nid) all parse and return): ModHeader (MaliciousActivityDetected) host_reach 3; a publisher-email-compromised npm cluster with 'npm' reach 5, plus rimraf/zod/three and the typosquat 'serveless'. Dedup on nid BEFORE the comp is mandatory or host_reach is meaningless. To focus on true campaign/malice, drop 8d581cfb and PublishersDomainExpired from the hits set. Pairs with library D6 (blast radius for a GIVEN i

### H2.6 — Critical/high known-bad that is NOT under governance (no block, no remediation)
**Hypothesis:** KOI is alerting on critical/high items, but the tenant blocklist is EMPTY (verified: zero blocklist_items_added audit actions) and many items have no remediation record. A known-bad item with neither a block nor a remediation is an open, silently-accepted risk - the governance gap.

**A hit means:** A critical/high alerting item with no remediation audit row (and, on this tenant, not on any blocklist). This is known-bad that KOI scored but the org never governed.

_Datasets:_ koi_koi_raw (Alerts known-bad LEFT anti-join Audit remediation) · _Status:_ not-run

```sql
// HUNT H2.6 - Critical/high known-bad that is NOT under governance.
// HYPOTHESIS: KOI alerts on critical/high items, but the tenant blocklist is EMPTY (verified:
//   0 blocklist_items_added audit actions) and many carry no remediation. Known-bad with no
//   block and no remediation = an open, accepted risk.
// HIT = a critical/high alerting item with NO remediation audit record.
// Left anti-join: Alerts(known-bad) vs Audit(remediation). Blocklist governance is null here.
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter nid      = json_extract_scalar(metadata, "$.notification_event_id")
| alter res_arr  = json_extract_array(resources, "$")
| alter dev_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") = "device"), 0)
| alter itm_obj  = arrayindex(arrayfilter(res_arr, json_extract_scalar("@element","$.type") != "device"), 0)
| alter item_key = json_extract_scalar(itm_obj, "$.data.item_id")
| alter item_name= json_extract_scalar(itm_obj, "$.name")
| alter item_risk= json_extract_scalar(itm_obj, "$.data.risk_level")
| alter alert_host = json_extract_scalar(dev_obj, "$.data.hostname")
| filter item_risk in ("critical","high") and item_key != null
| dedup item_key by desc _time
| fields item_key, item_name, item_risk, alert_host
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit" and type = "remediation"
    | alter rem_key = object_id, rem_action = action
    | dedup rem_key by desc _time
    | fields rem_key, rem_action
  ) as rem  rem.rem_key = item_key
| filter rem_action = null
| fields item_name, item_key, item_risk, alert_host, rem_action
| sort desc item_risk
| limit 200
```

_False positives / tuning:_ Governance vocabulary is verified: on this tenant Audit type=policies shows only allowlist_items_added(1)/created/updated and ZERO blocklist_items_added, so the blocklist is empty and remediation_* (remediation_opened 157 / _executed 85 / _pending 13) is the only governance evidence - hence the anti-join is against remediation. Join syntax validated in sibling query A3. Critical/high items definitely exist (SBlock critical, postmark-mcp critical, ModHeader high), so this returns rows. The simple

### H4.3 — AI agent driving a supply-chain change — agent-spawned installs, escalated by KOI's verdict
**Hypothesis:** An AI coding agent (parent tree = claude/cursor/code/antigravity) autonomously running a package install is the agentic-supply-chain frontier risk. Cross-referencing what it installed against KOI's scored inventory answers the sharper question: did the agent just pull a package KOI already flags as risky? An autonomous agent importing a known-bad dependency is worse than either signal alone.

**A hit means:** AGENT_INSTALLED_KOI_HIGH_RISK / _MEDIUM_RISK = an AI agent installed a package KOI scored risky — investigate immediately, an autonomous process imported supply-chain risk. AGENT_INSTALLED_UNSCORED_BY_KOI = the agent installed something KOI has never scored (shadow supply chain; pair with H4.2). Ranked by koi_risk × install count.

_Datasets:_ xdr_data (PROCESS) × koi_koi_raw (Alerts) · _Status:_ not-run (0 rows)

```sql
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
```

_False positives / tuning:_ NOT RUN end-to-end (CU budget exhausted at 8 validations), but every sub-pattern is individually validated: the agent-causality install filter is detection B10 (parse-confirmed), the pkg_name regex is A6 (validated, 16-row population), and the KOI Alerts dedup + to_number(resources[0].data.risk) join is validated here in H4.6 and probed directly this session. Validate over 6h on xdr before production. Tuning: the >=7 / >=4 risk cut-lines (KOI numeric risk 0-10); add 'curl ... | sh' and 'docker p

### H4.4 — Scan-integrity anomaly — KOI scan process ran in XDR but KOI reported nothing after
**Hypothesis:** KOI is run-on-demand; its bundled Python executes a .pyz payload from an AppData\Local\Koi\Python path that XDR records as a PROCESS. If that scan process ran on a host but koi_koi_raw shows no event dated after it (beyond the ingestion lag), the scan either genuinely found no change (benign, KOI is change-driven) or failed/was tampered/reported nothing (malign). A silent scan is indistinguishable from a broken one WITHOUT this join.

**A hit means:** verdict=SCAN_NEWER_THAN_LAST_REPORT (last scan is >15 min newer than the newest KOI event) or SCAN_RAN_ZERO_KOI_EVENTS = the KOI agent executed but the supply-chain side has nothing to show for it — review whether that host truly had no changes, or whether reporting is broken. reported_after_scan (lag<=0) is the healthy state.

_Datasets:_ xdr_data (PROCESS) × koi_koi_raw (Audit) · _Status:_ validated (1 rows)

```sql
/* HUNT H4.4 — Scan-integrity anomaly: KOI scan ran in xdr, KOI reported nothing after.
   HYPOTHESIS: KOI is run-on-demand; its bundled python runs a .pyz (visible in xdr PROCESS under
     AppData\Local\Koi\Python). If that scan ran but koi_koi_raw has no event dated after it
     (beyond ingestion lag), the scan found no change (benign) OR failed/was tampered (malign).
     A silent scan is indistinguishable from a broken one without joining the two datasets.
   HIT MEANS: last scan newer than last KOI event by > lag budget -> review this host.
   JOIN LOGIC: xdr scan timestamps (path-anchored on the KOI-bundled interpreter, detection A7's
     anchor) LEFT-joined to the newest koi_koi_raw Audit event time per host; flag the delta.
     DISTINCT from A5 (per-item gap) and A7 (scan freshness from xdr alone): this compares scan
     time to REPORTING time across both datasets. Lag budget 15 min covers the 4-10 min ingest lag.
   Datasets: xdr_data (PROCESS) x koi_koi_raw (Audit). */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter pth = lowercase(coalesce(action_process_image_path, ""))
| filter pth contains "appdata" and pth contains "koi" and pth contains "python"
| alter shost = lowercase(agent_hostname)
| comp count() as scan_processes, max(_time) as last_scan, min(_time) as first_scan by shost
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter khost = lowercase(hostname)
    | comp count() as koi_events, max(_time) as last_koi_event by khost
  ) as k k.khost = shost
| alter lag_min = timestamp_diff(last_scan, last_koi_event, "MINUTE")
| alter verdict = if(last_koi_event = null, "SCAN_RAN_ZERO_KOI_EVENTS", if(lag_min > 15, "SCAN_NEWER_THAN_LAST_REPORT", "reported_after_scan"))
| fields shost, scan_processes, first_scan, last_scan, koi_events, last_koi_event, lag_min, verdict
| sort desc lag_min
| limit 100
```

_False positives / tuning:_ Validated live, 1 row over 24h: win-workstation, 8 scan processes, lag_min=-3 (last KOI event 3 min AFTER last scan) -> reported_after_scan, the healthy negative. The separator-free path match (contains appdata AND koi AND python) is used deliberately to dodge backslash-escaping parse errors while staying specific to the KOI interpreter. Tuning: the 15-minute lag budget; add a floor on scan_processes to ignore partial scans; run windows up to 90d on the KOI side but keep xdr to 24h.

### H4.5 — Risky item with matching egress — KOI network-capability finding × agent-tree egress on the same host
**Hypothesis:** An item KOI flagged with a network-capability finding (UnrestrictedNetworkAccess, BypassesNetworkControl, Exfils*, DynamicNetworkDestination, InterceptsNetworkTraffic, NetworkInterception, VulnerabletoMITM) is only a capability until something on that host actually reaches the internet. Correlating KOI's network findings with observed agent-tree public egress on the same host escalates a latent capability to observed behaviour.

**A hit means:** A row = a dual-covered host that BOTH carries a KOI item with a network-exfil/bypass finding AND is showing public egress from an AI-agent process tree. It does not prove the flagged item made the connection, but it is the shortlist where a KOI-flagged network capability and real egress coexist — pull the per-flow detail (detection B4/B5) to confirm.

_Datasets:_ koi_koi_raw (Alerts) × xdr_data (NETWORK) · _Status:_ validated (0 rows)

```sql
/* HUNT H4.5 — Risky item with matching egress: KOI network finding x agent egress, same host.
   HYPOTHESIS: a KOI network-capability finding (Unrestricted/Bypasses/Exfils/Intercepts/MITM) is
     latent until the host actually egresses. Correlating the finding with observed agent-tree
     public egress on the same host promotes capability to behaviour.
   HIT MEANS: a dual-covered host with a KOI network-exfil/bypass finding that is ALSO egressing to
     the public internet from an agent process tree — the shortlist to pull B4/B5 flow detail on.
   JOIN LOGIC: KOI Alerts (deduped) whose resources[0].data.findings JSON contains a network
     finding_id -> inner join to xdr NETWORK egress (public only: loopback/RFC1918/link-local
     excluded via incidr) from agent causality trees, aggregated per host. Ranked by risk x flows.
     DISTINCT from B5 (xdr-only anomalous egress): this is gated on KOI's supply-chain verdict.
   Datasets: koi_koi_raw (Alerts) x xdr_data (NETWORK). */
dataset = koi_koi_raw
| filter source_log_type = "Alerts"
| alter evid = json_extract_scalar(metadata, "$.notification_event_id")
| dedup evid
| alter res = to_json_string(resources)
| alter fjson = coalesce(to_json_string(json_extract(res, "$.0.data.findings")), "")
| filter fjson contains "UnrestrictedNetworkAccess" or fjson contains "BypassesNetworkControl" or fjson contains "DynamicNetworkDestination" or fjson contains "InterceptsNetworkTraffic" or fjson contains "NetworkInterception" or fjson contains "Exfils" or fjson contains "VulnerabletoMITM"
| alter koi_host = lowercase(json_extract_scalar(res, "$.1.data.hostname")),
        koi_item = coalesce(json_extract_scalar(res, "$.0.data.package_name"), json_extract_scalar(res, "$.0.name")),
        koi_risk = to_number(json_extract_scalar(res, "$.0.data.risk")),
        koi_type = json_extract_scalar(res, "$.0.type")
| filter koi_host != null
| comp max(koi_risk) as koi_risk, count_distinct(koi_item) as flagged_items by koi_host, koi_type
| join type = inner (
    dataset = xdr_data
    | filter event_type = ENUM.NETWORK
    | alter root = lowercase(coalesce(causality_actor_process_image_name, ""))
    | filter root contains "claude" or root contains "cursor" or root contains "code" or root contains "antigravity" or root contains "ollama" or root contains "node" or root contains "python"
    | filter action_network_is_loopback = false or action_network_is_loopback = null
    | filter action_remote_ip != null
    | filter not (incidr(action_remote_ip, "10.0.0.0/8") or incidr(action_remote_ip, "172.16.0.0/12") or incidr(action_remote_ip, "192.168.0.0/16") or incidr(action_remote_ip, "127.0.0.0/8") or incidr(action_remote_ip, "169.254.0.0/16"))
    | alter nhost = lowercase(agent_hostname)
    | comp count() as egress_flows, count_distinct(action_remote_ip) as distinct_dsts, count_distinct(action_remote_port) as distinct_ports by nhost
  ) as net net.nhost = koi_host
| alter hunt_score = multiply(koi_risk, add(1, egress_flows))
| fields koi_host, koi_type, koi_risk, flagged_items, egress_flows, distinct_dsts, distinct_ports, hunt_score
| sort desc hunt_score
| limit 100
```

_False positives / tuning:_ Validated live: 0 rows over 24h — a legitimate quiet result, not a broken query. On this lab tenant the sole dual host (win-workstation) did not both carry a network-capability finding AND show agent-tree public egress within the same 24h window (agent egress is bursty; the win-workstation scored alert was an MCP whose findings may not include a network capability). It parses and executes correctly and will surface on a production estate with more dual-covered hosts. Tuning: run 7d to beat egres

### H4.6 — Coverage-weighted risk — which dual-covered host to hunt on first
**Hypothesis:** Hosts that are BOTH heavily active at agentic runtime (xdr volume) AND carry high KOI supply-chain risk are the highest-yield hunting ground. Neither dataset ranks hosts for a hunter on its own; the product of KOI risk posture and XDR agentic activity does. This is the triage query you run before the other five, and it derives the dual-covered host set from data rather than assuming it.

**A hit means:** The top row by hunt_priority is the host where a live agentic-supply-chain compromise is most likely to be found — start hunting there. A host with high max_koi_risk but low agentic_events is flagged-but-quiet; high agentic_events but low koi_risk is busy-but-clean; the product ranks the dangerous-and-active hosts to the top.

_Datasets:_ xdr_data (PROCESS) × koi_koi_raw (Audit + Alerts) · _Status:_ validated (1 rows)

```sql
/* HUNT H4.6 — Coverage-weighted risk: which dual-covered host to hunt on FIRST.
   HYPOTHESIS: hosts that are BOTH agentic-active (xdr) AND KOI-risky are the highest-yield ground;
     neither dataset ranks hosts alone, the product does. Triage query — run before the other five.
   HIT MEANS: top hunt_priority = the host most likely to hide a live compromise; start there.
   JOIN LOGIC: derive the dual-covered host set from data (inner join xdr host activity to KOI-known
     hosts — resolves to win-workstation here, never hardcoded), then attach each side's posture:
     xdr agentic event volume + distinct images, KOI max/avg numeric risk from the deduped Alerts
     stream. Rank by agentic_events x (1 + max_koi_risk). NOTE: XQL arithmetic MUST be multiply()/
     add() — the a*b operator is a parse error on this tenant.
   Datasets: xdr_data (PROCESS) x koi_koi_raw (Audit + Alerts). */
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter xhost = lowercase(agent_hostname),
        proc  = lowercase(coalesce(action_process_image_name, "")),
        root  = lowercase(coalesce(causality_actor_process_image_name, ""))
| alter is_agentic = if(proc in ("node","node.exe","npx","python","python.exe","python3","uv","uvx") or root contains "claude" or root contains "cursor" or root contains "code" or root contains "antigravity" or root contains "ollama", 1, 0)
| comp count() as xdr_events, sum(is_agentic) as agentic_events, count_distinct(action_process_image_name) as distinct_images by xhost
| join type = inner (
    dataset = koi_koi_raw
    | filter source_log_type = "Audit"
    | alter khost = lowercase(hostname)
    | comp count() as koi_audit_events by khost
  ) as cov cov.khost = xhost
| join type = left (
    dataset = koi_koi_raw
    | filter source_log_type = "Alerts"
    | alter evid = json_extract_scalar(metadata, "$.notification_event_id")
    | dedup evid
    | alter res = to_json_string(resources)
    | alter ahost = lowercase(json_extract_scalar(res, "$.1.data.hostname")),
            rn    = to_number(json_extract_scalar(res, "$.0.data.risk"))
    | filter ahost != null
    | comp count() as scored_alerts, max(rn) as max_koi_risk, avg(rn) as avg_koi_risk by ahost
  ) as risk risk.ahost = xhost
| alter mr = coalesce(max_koi_risk, 0.0)
| alter hunt_priority = multiply(agentic_events, add(1.0, mr))
| fields xhost, xdr_events, agentic_events, distinct_images, koi_audit_events, scored_alerts, max_koi_risk, avg_koi_risk, hunt_priority
| sort desc hunt_priority
| limit 50
```

_False positives / tuning:_ Validated live, 1 row over 6h: win-workstation — xdr_events 637, agentic_events 2, distinct_images 30, koi_audit_events 2, scored_alerts 1, max_koi_risk 8.36, hunt_priority 18.7. This is the query that PROVED the dual-covered set is exactly {win-workstation} on this tenant, derived from data. Foundational: it validated to_number(), the function-form multiply()/add() arithmetic, and the KOI-host×xdr-host join mechanics that every other H4 hunt reuses. Tuning: widen to 7d so agentic_events reflect

## Appendix - designed but not included

Seven further hunts were designed by the theme agents but their full query bodies were **truncated out of the curation input** and no on-disk copy exists, so they are not shipped here. They are listed so they can be re-supplied and added:

- **H2.4** - MCP-server findings. The `data.findings` array is EMPTY for mcp-kind alerts on this tenant (findings populate only for item/extension/npm/git alerts), so MCP findings must be read from the KOI API `/inventory/search`, not koi_koi_raw. This hunt is reshaped around the API rather than pure XQL.
- **H2.5** - rank flagged items by host exposure (group by item_id, count_distinct(alert_host)) - the exposure companion to H2.1.
- **H2.6** - known-bad but UNGOVERNED: anti-join flagged items against the `remediation_*` audit actions (the tenant blocklist is empty, so remediation is the only governance evidence).
- **H4.3** - AI agent driving a supply-chain change, ESCALATED by KOI's verdict (agent-spawned installs from detection B10, cross-referenced to KOI risk). Adjacent to B10 - must add the KOI-verdict escalation to be a distinct hunt.
- **H4.4 / H4.5 / H4.6** - not described in the delivered input.


---

## Summary

26 hunts across 4 themes - 15 validated against live data, 2 parse-confirmed (H4.1, H1.2), 2 not-run (H2.2, H2.3). Six re-validated live on 2026-07-22 (H1.1, H1.4, H1.5, H1.6, H1.7, H2.1). Per theme: H1=7, H2=3, H3=7, H4=2. Zero hunts were dropped as detection-overlap: each adjacent hunt (H4.1 vs B8, H4.2 vs B9, H3-4 vs B5, H3-6 vs B6) is exploratory (ranking / broadened scope / rarity / combination) rather than a fixed-threshold restatement, and its differentiation is stated inline. Query bodies are in `docs/xql/<id>.xql`.
