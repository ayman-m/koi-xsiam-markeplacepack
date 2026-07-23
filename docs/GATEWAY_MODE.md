# KOI Supply Chain Gateway — operator guide

**Pack context:** built for the official **Marketplace KOI pack v1.2.3** (`demisto/content`
`Packs/Koi`, 13 commands, integration only) and its dataset `koi_koi_raw`. Content lives in
**KOI Content Extension v1.3.0**, which ships no integration of its own.

**Evidence:** every claim here is validated on tenant `paet` on **2026-07-23** by a real
end-to-end test. The raw evidence is `VERIFIED_FACTS.md` §9 — read that before changing anything.

---

## 1. What the gateway actually is

An **HTTPS-intercepting forward proxy** at `paet.gateway.koi.security`. A PAC file decides what
reaches it; everything not matched goes `DIRECT`. It is **not** an endpoint agent and **not** a
network tap — it only sees what the PAC routes to it.

```mermaid
flowchart LR
    U[Endpoint<br/>PAC + Koi Root CA] -->|marketplace host| GW[paet.gateway.koi.security<br/>TLS-intercepting proxy]
    U -->|everything else| D[DIRECT<br/>never inspected]
    GW -->|policy: allow| MP[(Marketplace<br/>store / CDN)]
    GW -->|policy: block| BP[KOI block page<br/>+ Request access]
    BP -->|user submits| AR[[approval_requests<br/>audit event]]
    GW -.->|Allowed / Blocked verdict| NL[Audit ▸ Network Logs<br/>CONSOLE ONLY]
    NL -.->|✗ never exported| X[XSIAM koi_koi_raw]
    AR -->|✓ exported| X
```

**Covered by the PAC:** Chrome Web Store (+ `clients2.google.com`), Edge add-ons, Firefox
add-ons, VS Code marketplace (+ vsassets CDNs), Cursor, Windsurf, JetBrains, OpenVSX,
Hugging Face, `api.mcp.github.com`, Office add-ins, `storage.googleapis.com`.

**Not covered:** PyPI, npm, Homebrew, Chocolatey, Docker, OS software channels, sideloaded
installs. Those are governed — if at all — by KOI's separate **registry** approach (pip/npm
config), which is a different mechanism entirely.

---

## 2. The three things you must know before building anything

### 2.1 🚨 You cannot alert on a block

The gateway's own **Allowed/Blocked** verdict log (with domain, path, item ID, version, reason,
group, identity) lives in the console under **Audit → Network Logs** and is **never exported to
XSIAM**. `koi_koi_raw` has no gateway/block/network event type at all, and
`_raw_log contains "Blocked"` returns **0 rows**.

**Therefore:** every gateway detection in this pack targets the *consequences* of a block —
approval requests, remediations, and provenance gaps — never the block itself.

### 2.2 Enforcement is at package download, not at browsing

Browsing an item's store page passes straight through. The decision happens when the client
fetches the actual package — e.g. `clients2.googleusercontent.com/crx/blobs/…` for a Chrome
extension. This is why a block cannot be reproduced by loading a store page.

### 2.3 A blocked item is never in inventory

An approval request exists *because* the item was blocked → it was never installed → it is not
in inventory. `item_display_name=Snake` returns `total_count 0` on every marketplace while the
control returns 65 items. There is **no catalog/Koidex command** in the 13 Marketplace commands.

**Therefore:** you cannot "enrich the requested item". The inventory lookup is only meaningful
**inverted** — if the blocked item *is* present, that is the finding.

---

## 3. How to test the gateway

### 3.1 Confirm interception (30 seconds)

Browse to `https://marketplace.visualstudio.com/koi` on a PAC-configured host. KOI serves a
**"You Are Routing Through Koi!"** page in place of the real marketplace. If you get the real
Microsoft page, the PAC is not active; if you get a TLS error, the Koi Root CA is not trusted.

### 3.2 Trigger a real block → approval (must be done by a human)

1. Open the Chrome Web Store page for an extension your policy blocks.
2. Click **Add to Chrome** → **Add extension**.
3. The install fails and KOI presents a block page with **Request access**.
4. Submitting the form creates an `approval_requests` event, visible in
   **Operations → Requests** and exported to XSIAM.

**This leg cannot be automated from a browser tool.** The Chrome Web Store gallery cannot be
scripted or screenshotted by any extension, raw `.crx`/`.vsix` URLs are refused by agent safety
classifiers, and a page `fetch()` does not reproduce a real install (it never reaches the
gateway). Use a human, or an agent-enrolled endpoint.

### 3.3 Verify in XSIAM

```sql
dataset = koi_koi_raw
| filter type = "approval_requests"
| fields _time, object_name, marketplace, triggered_by, reason, message
| sort desc _time | limit 10
```

---

## 4. What this pack ships for the gateway

| Content | Where | What it does |
|---|---|---|
| `koi_approval_*` columns | `ParsingRules/KoiContentExtension` | Extracts decision / requester / decider / risk from the free-text `message`, because `action` is null on every approval row |
| **G1–G6** detections | `docs/xql/G*.xql`, `docs/DETECTION_QUERIES.md` | Approval pressure, re-request after rejection, no-provenance installs, system guardrails, rejected-then-installed, coverage gap |
| **KOI Ext - Gateway Approval Triage** | `Packs/…/Playbooks` | Evidence-backed recommendation for a reviewer; never approves |

### The one number to quote

Over 90 days on this tenant, **≈3,088 installs were outside PAC scope versus ≈230 inside** —
roughly **nine in ten** installs with a known marketplace never traverse the gateway. The gateway
governs the **browser/IDE extension surface**, not the code-package surface. Say this before
anyone concludes "the gateway will stop supply-chain installs".

---

## 5. Two traps that will bite you

**The requester email is a claim, not an identity.** On endpoints with the PAC + CA but no KOI
agent, the gateway cannot attribute the user — the request URL literally carries
`user_id=unknown&requestedBy=unknown` — so the end user **types their own email**. A live row in
this tenant reads `amahmoud@paltoaltonetworks.com`, a typo of the real domain. Never gate an
approval on it; `triggered_by` is the structured actor field.

**Approval rows carry no item ID.** `object_id` is the *request's* UUID, not the extension's.
Correlating an approval to an install is **name-based**, and `item_display_name` is a
case-insensitive **substring** match — a short or generic name can over-match.

---

## 6. Parsing-rule columns are ingest-time only

The `koi_approval_*` columns are populated by the parsing rule **as events arrive**. They are
**null on every historical row**. Every query in Theme G therefore re-derives them **inline**, so
it works across all history. Keep the inline expressions and the `.xif` in sync when either
changes.
