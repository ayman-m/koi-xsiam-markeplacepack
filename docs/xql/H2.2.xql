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
