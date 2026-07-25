# KOI Supply Chain Gateway — human test guide

Hands-on validation on an endpoint, grouped by use case. Each test: **Do / Expect / Why**.
~15 minutes end to end.

## Before you start

- An endpoint with the KOI **PAC** applied and the **Koi Root CA** trusted. *(No KOI agent needed —
  these are gateway tests.)*
- Access to the **KOI console**: Governance, Operations → Requests, Audit → Network Logs.
- One policy that **blocks** a known item, and one marketplace left **allow-by-default**, so you have
  both a block and an allow target. Examples below assume a Chrome Web Store rule blocking names
  containing `snake`.
- Tests **E** also need the **KOI Content Extension** pack installed in XSIAM.

---

## A · Is the gateway intercepting?

**A1 — Connectivity**
- **Do:** browse to `https://marketplace.visualstudio.com/koi`.
- **Expect:** a KOI *"You are routing through Koi"* page, **no certificate warning**.
- **Why:** proves three things at once — PAC applied, CA trusted, gateway serving responses. Real
  Microsoft page ⇒ PAC not applied; cert error ⇒ CA not trusted. Fix this first.

## B · Block and request access (the core loop)

**B1 — Block a marketplace item**
- **Do:** open a blocked item's store page (e.g. `https://chromewebstore.google.com/detail/snake/oppflpnigmhkldmdmmbnopidlhahanji`)
  and click **Add to Chrome**.
- **Expect:** the install fails; KOI serves a block page (the URL is rewritten to end
  `/should-request-access`).
- **Why:** inline prevention — the item never lands. Enforcement fires at the store page **and** the
  package download.

**B2 — Request access**
- **Do:** on the block page click **Request access**, fill the form, submit.
- **Expect:** the request shows in **Operations → Requests** (Open) with item, marketplace, risk,
  requester, justification.
- **Why:** this request is the **observable proxy** for the block — the gateway's own block verdict
  is *not* exported, but this is. On an agent-less endpoint you type your own email; it is
  **unverified** (see D2).

**B3 — Code package (npm/PyPI)** *(only if the registry route is configured)*
- **Do:** `npm install <a-blocked-package>` (or the pip equivalent).
- **Expect:** install fails with a KOI block; a **Blocked** row appears in Audit → Network Logs with
  source npm/PyPI.
- **Why:** code packages are governed by the **registry** route, not the PAC — this proves that
  second path independently.

## C · Allow

**C1 — Allowed item passes through**
- **Do:** install any item not blocked by policy.
- **Expect:** it installs normally; an **Allowed** row appears in Network Logs.
- **Why:** confirms the gateway is *filtering*, not blanket-blocking.

## D · Data in XSIAM

**D1 — The approval event reaches XSIAM**
- **Do:** run `dataset = koi_koi_raw | filter type = "approval_requests" | sort desc _time | limit 5`.
- **Expect:** your B2 request as a row; the decision (submitted / rejected / approved) is inside the
  `message` text.
- **Why:** confirms the event lands and shows the field shape the pack's parsing rule extracts.

**D2 — The identity gap**
- **Do:** in Audit → Network Logs, open any **Blocked** row.
- **Expect:** **Identity** and **Group** are empty.
- **Why:** neither the PAC nor the agent gives the gateway a user. This is exactly the gap an upstream
  proxy's `X-Authenticated-User` header (Prisma / SWG) would close.

## E · Pack content (KOI Content Extension installed)

**E1 — Correlation rule → alert → playbook**
- **Do:** enable the **KOI Ext - Gateway Approval Request** correlation rule (Detection Rules →
  Correlation Rules), then repeat **B1–B2**.
- **Expect:** a **KOI Gateway Approval** alert is raised and **KOI Ext - Gateway Approval Triage**
  autoruns — it writes an evidence summary and stops at a **manual reviewer gate**.
- **Why:** validates the full *data → detection → playbook* loop. The playbook never mutates
  governance.

**E2 — Decision maps to XDM** *(optional)*
- **Do:** after a **rejected** request, check the modeled row's `xdm.event.outcome` and
  `xdm.target.user.username`.
- **Expect:** a rejected request → outcome **FAILED**; the requester in **target.user**.
- **Why:** confirms the modeling rule reads the decision correctly (a rejection is not a success).

---

## Pass checklist

| # | Test | Pass condition | Core? |
|---|---|---|---|
| A1 | Connectivity | KOI routing page, no cert error | ✅ core |
| B1 | Block | Install fails, KOI block page | ✅ core |
| B2 | Request access | Request appears in Operations → Requests | ✅ core |
| B3 | Code-package block | Blocked row, source npm/PyPI | if registry route |
| C1 | Allow | Item installs, Allowed row | ✅ core |
| D1 | Event in XSIAM | `approval_requests` row present | ✅ core |
| D2 | Identity gap | Identity/Group empty | informational |
| E1 | Pack loop | Alert raised + playbook autoruns | if pack installed |
| E2 | XDM decision | Rejected → FAILED | if pack installed |

**Minimum green PoV:** A1, B1, B2, C1, D1.
