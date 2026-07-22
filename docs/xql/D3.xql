// Theme D / D3 - Host agentic supply-chain posture by marketplace.
// The device-side entry point the Marketplace pack cannot provide: 1.2.3 has no
// koi-devices-list, no koi-device-inventory-get and no Koi.Device.* context, so a hostname
// cannot be turned into an inventory through the API. This does it from events.
// The `dedup ... by desc _time` then `filter action != "uninstalled"` pair is the whole
// trick: it nets install/update/uninstall churn down to present-tense state.
// PARAM: koi_host = inputs.hostname (KOI Ext - Investigate Device)
// Investigation. Run at 30d or longer for posture, NOT 24h.
dataset = koi_koi_raw
| filter source_log_type = "Audit" and type = "extensions"
| filter hostname = "win-workstation"                                 // PARAM: koi_host
| dedup object_id, marketplace by desc _time
| filter action != "uninstalled"
// "<unset>" is not an error: claude_code items genuinely carry no marketplace, and
// built_in / side_loaded seen elsewhere are installation METHODS leaking into this field.
| alter marketplace_event_vocab = coalesce(marketplace, "<unset>")
| comp count()               as items_present,
       values(object_name)   as item_names,
       max(_time)            as latest_change
     by marketplace_event_vocab, platform
| sort desc items_present
| limit 50
