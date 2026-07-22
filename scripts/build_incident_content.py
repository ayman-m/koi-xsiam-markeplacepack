#!/usr/bin/env python3
"""Generate the KoiContentExtension incident type, fields and layout.

Emits, under Packs/KoiContentExtension/:
  IncidentFields/incidentfield-koi<field>.json   (19 fields)
  IncidentTypes/incidenttype-KOI_Supply_Chain_Alert.json
  Layouts/layoutscontainer-KOI_Supply_Chain_Alert.json

Deterministic: the field set maps to the parsing rule's promoted columns and the
Alert Triage / Investigate Item playbook outputs. Regenerating is idempotent.

Conventions (verified against demisto/content on-disk schemas):
  incidentfield: id == "incident_" + cliName; cliName lowercase-alphanumeric, immutable.
  incidenttype:  id == name; layout -> layoutscontainer name; playbookId -> playbook name.
  layoutscontainer: group "incident"; detailsV2.tabs[].sections[].items[].
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "Packs", "KoiContentExtension")
TYPE_NAME = "KOI Supply Chain Alert"
FROM_VERSION = "6.10.0"

# (cliName, display name, type, selectValues, tooltip) — cliName is lowercase-alnum only.
FIELDS = [
    ("koiitemid", "KOI Item ID", "shortText", None,
     "The KOI item identifier (npm/pypi/extension id, MCP server id, or git remote)."),
    ("koiitemname", "KOI Item Name", "shortText", None,
     "Human-readable item / object name."),
    ("koiitemtype", "KOI Item Type", "singleSelect",
     ["extension", "mcp_server", "ai_model", "code_package", "os_package", "git_repo", "software"],
     "The item class. Alerts on this tenant are extension or mcp_server."),
    ("koiitemversion", "KOI Item Version", "shortText", None,
     "Item version (a git repo carries its commit SHA here). Empty on most MCP alerts."),
    ("koimarketplace", "KOI Marketplace", "shortText", None,
     "Marketplace in API form (windows, chrome_web_store, vscode, npm, pypi...). "
     "Safe to pass to koi- commands."),
    ("koimarketplaceraw", "KOI Marketplace (Event Form)", "shortText", None,
     "Raw short-form value as it appears in koi_koi_raw (software_windows, chrome, vsc...). "
     "Rejected by commands if passed unmapped (VERIFIED_FACTS 7c)."),
    ("koirisklevel", "KOI Risk Level", "singleSelect",
     ["low", "medium", "high", "critical", "pending"],
     "Risk level carried on the alert."),
    ("koiorgrisklevel", "KOI Org Risk Level", "singleSelect",
     ["low", "medium", "high", "critical", "pending"],
     "Org-inventory risk from koi-inventory-list (set by Investigate Item)."),
    ("koialerttype", "KOI Alert Type", "shortText", None,
     "finding_info.types[0]. One value on this tenant: policy_violation."),
    ("koifindingtitle", "KOI Finding Title", "shortText", None,
     "finding_info.title (the KOI policy name that raised the alert)."),
    ("koifindinguid", "KOI Finding UID (Policy)", "shortText", None,
     "finding_info.uid -- the POLICY definition id, not a per-alert id (3 distinct across "
     "1,040 alerts). Do not use to dedupe."),
    ("koinotificationid", "KOI Notification ID", "shortText", None,
     "metadata.notification_event_id -- the per-alert-occurrence identity and the correct "
     "de-duplication key (VERIFIED_FACTS 7e)."),
    ("koihostname", "KOI Hostname", "shortText", None,
     "Host the item is installed on (resources[type=device].data.hostname). Bare name, not an FQDN."),
    ("koideviceid", "KOI Device ID", "shortText", None,
     "KOI device id from the alert's device resource."),
    ("koideviceuser", "KOI Device User", "shortText", None,
     "Last-logged-on user on the affected device."),
    ("koiendpointcount", "KOI Endpoint Count", "number", None,
     "Blast radius: number of endpoints carrying the item (koi-inventory-item-endpoints-list)."),
    ("koigovernance", "KOI Governance State", "singleSelect",
     ["ungoverned", "blocklisted", "allowlisted"],
     "Whether the item is on the KOI block/allow list (set by Investigate Item)."),
    ("koiverdict", "KOI Triage Verdict", "singleSelect",
     ["Benign", "Suspicious", "Malicious"],
     "The Alert Triage verdict."),
    ("koiinvestigationsummary", "KOI Investigation Summary", "markdown", None,
     "The war-room investigation summary from Investigate Item / Alert Triage."),
]


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=4)
        fh.write("\n")


def build_fields():
    for cli, name, ftype, sel, desc in FIELDS:
        obj = {
            "id": "incident_" + cli,
            "version": -1,
            "modified": "2026-07-22T00:00:00Z",
            "name": name,
            "prettyName": name,
            "ownerOnly": False,
            "description": desc,
            "cliName": cli,
            "type": ftype,
            "closeForm": False,
            "editForm": True,
            "required": False,
            "script": "",
            "fieldCalcScript": "",
            "neverSetAsRequired": False,
            "isReadOnly": False,
            "selectValues": sel if sel else None,
            "validationRegex": "",
            "useAsKpi": False,
            "locked": False,
            "system": False,
            "content": True,
            "group": 0,
            "hidden": False,
            "associatedTypes": [TYPE_NAME],
            "systemAssociatedTypes": None,
            "associatedToAll": False,
            "unmapped": False,
            "unsearchable": False,
            "caseInsensitive": True,
            "columns": [],
            "defaultRows": [],
            "sla": 0,
            "threshold": 72,
            "fromVersion": FROM_VERSION,
        }
        write(os.path.join(PACK, "IncidentFields", "incidentfield-%s.json" % cli), obj)
    return len(FIELDS)


def build_type():
    obj = {
        "id": TYPE_NAME,
        "version": -1,
        "modified": "2026-07-22T00:00:00Z",
        "name": TYPE_NAME,
        "prevName": TYPE_NAME,
        "color": "#5CD1B3",
        "playbookId": "KOI Ext - Alert Triage",
        "hours": 0,
        "days": 0,
        "weeks": 0,
        "hoursR": 0,
        "daysR": 0,
        "weeksR": 0,
        "system": False,
        "readonly": False,
        "default": False,
        "autorun": True,
        "preProcessingScript": "",
        "closureScript": "",
        "disabled": False,
        "reputationCalc": 0,
        "layout": TYPE_NAME,
        "fromVersion": FROM_VERSION,
    }
    write(os.path.join(PACK, "IncidentTypes",
                       "incidenttype-KOI_Supply_Chain_Alert.json"), obj)


def _field_item(cli, index, start=0, end=2):
    return {
        "endCol": end, "fieldId": "incident_" + cli, "height": 22,
        "id": "koi-item-" + cli, "index": index,
        "sectionItemType": "field", "startCol": start,
    }


def _section(sid, name, x, y, w, h, field_clis, display="ROW"):
    return {
        "displayType": display, "h": h, "i": "koi-sec-" + sid, "isVisible": True,
        "maxW": 3, "moved": False, "name": name, "static": False, "w": w, "x": x, "y": y,
        "items": [_field_item(c, i) for i, c in enumerate(field_clis)],
    }


def build_layout():
    # KOI Alert tab — four field sections in a 3-wide grid, then the summary full width.
    koi_sections = [
        _section("item", "Item", 0, 0, 1, 3, ["koiitemname", "koiitemtype", "koimarketplace", "koiitemversion"]),
        _section("risk", "Risk & Verdict", 1, 0, 1, 3, ["koiverdict", "koirisklevel", "koiorgrisklevel", "koifindingtitle"]),
        _section("host", "Affected Host", 2, 0, 1, 3, ["koihostname", "koideviceuser", "koideviceid", "koiendpointcount"]),
        _section("gov", "Governance & Identity", 0, 3, 1, 3, ["koigovernance", "koinotificationid", "koifindinguid", "koialerttype"]),
        _section("summary", "Investigation Summary", 1, 3, 2, 4, ["koiinvestigationsummary"]),
    ]
    tabs = [
        {"id": "koi-alert-tab", "name": "KOI Alert", "sections": koi_sections},
        {
            "id": "caseinfoid-koi-info", "name": "Incident Info",
            "sections": [
                _section("casedetails", "Case Details", 0, 0, 1, 2,
                         []),  # left minimal; standard fields render via displayType
                {"displayType": "ROW", "h": 3, "i": "koi-sec-timeline", "isVisible": True,
                 "maxW": 3, "moved": False, "name": "Timeline Information", "static": False,
                 "w": 1, "x": 1, "y": 0, "type": "items", "items": []},
                {"displayType": "ROW", "h": 4, "i": "koi-sec-notes", "isVisible": True,
                 "maxW": 3, "moved": False, "name": "Notes", "static": False,
                 "w": 1, "x": 2, "y": 0, "type": "notes"},
            ],
        },
        {
            "id": "koi-investigation-tab", "name": "Investigation",
            "sections": [
                {"displayType": "ROW", "h": 4, "i": "koi-sec-indicators", "isVisible": True,
                 "maxW": 3, "moved": False, "name": "Indicators", "static": False,
                 "query": None, "queryType": "input", "w": 2, "x": 0, "y": 0, "type": "indicators"},
                {"displayType": "ROW", "h": 4, "i": "koi-sec-invtimeline", "isVisible": True,
                 "maxW": 3, "moved": False, "name": "Investigation Timeline", "static": False,
                 "w": 1, "x": 2, "y": 0, "type": "invTimeline"},
            ],
        },
        {"id": "warRoom", "name": "War Room", "sections": []},
    ]
    obj = {
        "id": TYPE_NAME,
        "name": TYPE_NAME,
        "group": "incident",
        "version": -1,
        "system": False,
        "fromVersion": FROM_VERSION,
        "description": "Layout for KOI supply-chain / agentic alerts: item, risk, verdict, "
                       "affected host, governance and the investigation summary.",
        "detailsV2": {"tabs": tabs},
    }
    write(os.path.join(PACK, "Layouts", "layoutscontainer-KOI_Supply_Chain_Alert.json"), obj)


def main():
    n = build_fields()
    build_type()
    build_layout()
    print("wrote %d incident fields, 1 incident type, 1 layoutscontainer" % n)
    print("type: %r -> playbook 'KOI Ext - Alert Triage', layout %r" % (TYPE_NAME, TYPE_NAME))


if __name__ == "__main__":
    main()
