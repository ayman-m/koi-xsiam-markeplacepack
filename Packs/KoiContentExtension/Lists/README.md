# Lists

## `Koi Script Runner`

The Script Runner reads its whole configuration from a JSON List named exactly
**`Koi Script Runner`**. One entry per KOI script + operating system.

`list-Koi_Script_Runner.json` is the **content item** — it is what installs the List when
the pack is uploaded. Its `data` field is a JSON *string*, so the JSON inside it appears
escaped (`\n`, `\"`). That is correct for the file format and the platform unescapes it
on install, but it is **not** something to copy by hand.

**If you are creating the List yourself in the console, copy the block below instead.**
Settings → Configurations → Object Setup → Lists → New List, type **JSON**, name it
exactly `Koi Script Runner`, and paste this:

```json
[
  {
    "disabled": false,
    "script": {
      "name": "KOI Deployment Script - Windows",
      "uuid": "",
      "polling_interval_in_seconds": 60,
      "timeout_in_seconds": 1800
    },
    "target": {
      "endpoint_groups": [
        "KOI Endpoints"
      ],
      "endpoint_hostnames": [],
      "endpoint_os": "Windows",
      "tracker_list": "Koi Scan Tracker - Windows",
      "rescan_interval_hours": 720,
      "max_endpoints": 100
    },
    "notification": {
      "sendmail_instance": {
        "name": ""
      },
      "recipients": []
    }
  },
  {
    "disabled": false,
    "script": {
      "name": "KOI Deployment Script - macOS",
      "uuid": "",
      "polling_interval_in_seconds": 60,
      "timeout_in_seconds": 1800
    },
    "target": {
      "endpoint_groups": [
        "KOI Endpoints"
      ],
      "endpoint_hostnames": [],
      "endpoint_os": "macOS",
      "tracker_list": "Koi Scan Tracker - macOS",
      "rescan_interval_hours": 720,
      "max_endpoints": 100
    },
    "notification": {
      "sendmail_instance": {
        "name": ""
      },
      "recipients": []
    }
  }
]
```

### What to change

| Field | Change it? |
|---|---|
| `script.name` | **Yes** — the KOI deployment script exactly as it appears in Action Center → Scripts Library. Download it from your own KOI console first; it is KOI's script, not a Cortex one, and it must take no parameters. |
| `target.endpoint_groups` | **Yes** — your endpoint group. Easiest is to tag the agents and build a dynamic group on that tag. |
| `target.endpoint_os` | Only if your OS differs. One entry per OS. |
| `target.tracker_list` | No — leave it. The Refresh job creates this List; just keep the two names different. |
| `target.rescan_interval_hours` | No — 720 rescans each endpoint every 30 days. |
| `target.max_endpoints` | No — 100 is the platform maximum per run. Larger groups are still covered fully, across successive runs. |
| `script.polling_interval_in_seconds` / `timeout_in_seconds` | No — 60 / 1800. |
| `disabled` | Set `true` to skip an entry without deleting it. |
| `script.uuid` | Optional — pin the Action Center UUID to survive a script rename. |
| `notification.recipients` | Optional — add addresses to be emailed each entry's outcome. Empty means no email. |

Delete the macOS entry if you only deploy to Windows, or add more entries for Linux.
