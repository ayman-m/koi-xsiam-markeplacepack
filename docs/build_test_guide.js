/* Build "KOI Content Extension — Test Guide" (.pptx)
   Same dark language as the overview deck, plus green for expected results.
   Run:  NODE_PATH=<dir with pptxgenjs> node build_test_guide.js                */
const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";          // 13.3 x 7.5 in — must be set before adding slides
pres.author = "Cortex XSIAM";
pres.title = "KOI Content Extension — Test Guide";

/* ---------- palette (matches build_deck.js) ---------- */
const BG = "000000";
const CARD = "15171B";
const CARD_HI = "1C2026";
const ORANGE = "E8551F";
const CYAN = "22D3EE";
const GREEN = "3FB950";
const AMBER = "F5A524";
const RED = "F04438";
const WHITE = "FFFFFF";
const BODY = "B4B7BD";
const MUTED = "6E747E";
const F = "Calibri";
const MONO = "Courier New";

const M = 0.6;
const W = 13.3 - M * 2;               // usable width = 12.1

/* ---------- helpers (fresh option objects each call — pptxgenjs mutates them) ---------- */
const newSlide = () => {
  const s = pres.addSlide();
  s.background = { color: BG };
  return s;
};

const card = (s, x, y, w, h, fill = CARD) =>
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.05,
  });

const chip = (s, x, y, label, color = ORANGE, size = 0.36) => {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w: size, h: size, fill: { color }, line: { color, width: 0 }, rectRadius: 0.09,
  });
  s.addText(label, {
    x, y, w: size, h: size, align: "center", valign: "middle",
    fontSize: 13, bold: true, color: WHITE, fontFace: F, margin: 0,
  });
};

const heading = (s, kicker, title) => {
  if (kicker)
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: W, h: 0.26, fontSize: 11, bold: true,
      color: ORANGE, fontFace: F, charSpacing: 2, margin: 0, valign: "top",
    });
  s.addText(title, {
    x: M, y: 0.70, w: W, h: 0.7, fontSize: 31, bold: true,
    color: WHITE, fontFace: F, margin: 0, valign: "top",
  });
};

const GUTTER = 0.32;                    // width reserved for the number / tick

/* How many rendered lines an item takes at a given text width. */
const wrapLines = (txt, kind, usableIn) => {
  // calibrated against the LibreOffice render; Calibri substitutes metric-compatibly,
  // and Courier New is monospace at 0.6 em, so both hold in PowerPoint
  const cpi = kind === "code" ? 0.0875 : 0.0775;             // inches per character
  const perLine = Math.max(18, Math.floor(usableIn / cpi));
  return Math.max(1, Math.ceil(txt.length / perLine));
};

/* Render each item as its own marker + text pair. A marker baked into the run
   would leave wrapped lines starting left of their own marker — pptxgenjs has no
   hanging-indent option, so the two columns are placed explicitly. */
const rowList = (s, items, x, y, w, marker) => {
  const tw = w - GUTTER;
  let cy = y;
  items.forEach((it, i) => {
    const [txt, kind] = Array.isArray(it) ? it : [it, "text"];
    const n = wrapLines(txt, kind, tw);
    s.addText(marker === "num" ? String(i + 1) : "✓", {
      x, y: cy, w: GUTTER - 0.08, h: 0.28, fontSize: 11.5, bold: true,
      color: marker === "num" ? ORANGE : GREEN, fontFace: F, margin: 0, valign: "top",
    });
    s.addText(txt, {
      x: x + GUTTER, y: cy, w: tw, h: n * 0.21 + 0.06,
      fontSize: kind === "code" ? 10.5 : 11.5,
      fontFace: kind === "code" ? MONO : F,
      color: kind === "code" ? CYAN : BODY,
      margin: 0, lineSpacing: 15, valign: "top",
    });
    cy += n * 0.205 + 0.155;
  });
  return cy - y;                                            // consumed height
};

/* ---------- testSlide: "What you need" + Steps + Expect ------------------- */
/* Every test states its own prerequisites, because the most common way a test
   "fails" is a missing tenant-side dependency rather than a defect.          */
/* Estimated rendered height of a rowList, so cards can be sized to their content
   instead of guessed — the same calibration rowList itself uses. */
const estH = (items, usableIn) => {
  const tw = usableIn - GUTTER;
  return items.reduce((h, it) => {
    const [txt, kind] = Array.isArray(it) ? it : [it, "text"];
    return h + wrapLines(txt, kind, tw) * 0.205 + 0.155;
  }, 0);
};

const testSlide = (kicker, title, content, needs, steps, expects) => {
  const s = newSlide();
  heading(s, kicker, title);

  // Two prerequisites, kept apart on purpose. A customer who uploads the pack piece by
  // piece needs to know which CONTENT ITEMS must be on the tenant, separately from the
  // TENANT SETUP they configure themselves.
  const colW = (W - 2.6) / 2;
  const cx1 = M + 1.9, cx2 = M + 1.9 + colW + 0.5;
  // wrap-aware: an item that wraps must push the next one down, or they overlap
  const lay = (items, w) => {
    let y = 0; const out = [];
    items.forEach(t => { const n = wrapLines(t, "text", w); out.push([t, y, n]); y += n * 0.205 + 0.04; });
    return [out, y];
  };
  const [cLay, cH] = lay(content, colW);
  const [nLay, nH] = lay(needs, colW);
  const nh = 0.34 + Math.max(cH, nH);
  card(s, M, 1.40, W, nh, CARD_HI);

  s.addText("PACK CONTENT", { x: M + 0.28, y: 1.54, w: 1.6, h: 0.22, fontSize: 9,
    bold: true, color: CYAN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  cLay.forEach(([t, dy, n]) => {
    s.addText("\u2022", { x: cx1 - 0.16, y: 1.54 + dy, w: 0.14, h: 0.22, fontSize: 10,
      bold: true, color: CYAN, fontFace: F, margin: 0, valign: "top" });
    s.addText(t, { x: cx1, y: 1.54 + dy, w: colW, h: n * 0.21, fontSize: 10,
      color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" });
  });

  s.addText("TENANT SETUP", { x: cx2 - 1.55, y: 1.54, w: 1.5, h: 0.22, fontSize: 9,
    bold: true, color: AMBER, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  nLay.forEach(([t, dy, n]) => {
    s.addText("\u2022", { x: cx2 - 0.16, y: 1.54 + dy, w: 0.14, h: 0.22, fontSize: 10,
      bold: true, color: AMBER, fontFace: F, margin: 0, valign: "top" });
    s.addText(t, { x: cx2, y: 1.54 + dy, w: colW, h: n * 0.21, fontSize: 10,
      color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" });
  });

  const top = 1.40 + nh + 0.20;
  const sw = 7.0, ew = W - sw - 0.4, ex = M + sw + 0.4;
  const bottom = 7.5 - 0.30;
  const need = Math.max(estH(steps, sw - 0.68), estH(expects, ew - 0.68)) + 0.86;
  // Fail the build rather than clip. Text that overruns its card still sits inside the
  // slide, so a slide-bounds check does not catch it — this does.
  if (need > bottom - top)
    throw new Error(
      `${kicker} "${title}": content needs ${need.toFixed(2)}in but only ` +
      `${(bottom - top).toFixed(2)}in is free. Split the slide or shorten the steps.`);
  const ch = Math.max(1.7, need);

  card(s, M, top, sw, ch);
  s.addText("Steps", { x: M + 0.34, y: top + 0.2, w: 3.0, h: 0.28, fontSize: 12,
    bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  rowList(s, steps, M + 0.34, top + 0.58, sw - 0.68, "num");

  card(s, ex, top, ew, ch, CARD_HI);
  s.addText("What to expect", { x: ex + 0.34, y: top + 0.2, w: 3.4, h: 0.28, fontSize: 12,
    bold: true, color: GREEN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  rowList(s, expects, ex + 0.34, top + 0.58, ew - 0.68, "tick");

  return s;
};

/* ============================ 1. Title ============================ */
{
  const s = newSlide();
  s.addShape(pres.ShapeType.ellipse, { x: 9.6, y: -2.6, w: 6.4, h: 6.4,
    fill: { color: ORANGE, transparency: 90 }, line: { color: ORANGE, width: 1 } });
  s.addText("KOI CONTENT EXTENSION", { x: M, y: 2.5, w: W, h: 0.3, fontSize: 12, bold: true,
    color: ORANGE, fontFace: F, charSpacing: 3, margin: 0, valign: "top" });
  s.addText("Test Guide", { x: M, y: 2.9, w: W, h: 1.0, fontSize: 48, bold: true,
    color: WHITE, fontFace: F, margin: 0, valign: "top" });
  s.addText("Ten tests for the content built on the Marketplace KOI integration — with the setup each one needs",
    { x: M, y: 3.95, w: 9.8, h: 0.4, fontSize: 15, color: BODY, fontFace: F, margin: 0, valign: "top" });
  s.addText("For anyone comfortable in the Cortex XSIAM console. No content development required.",
    { x: M, y: 4.45, w: 9.6, h: 0.4, fontSize: 12, italic: true, color: MUTED, fontFace: F, margin: 0, valign: "top" });
  s.addText("Extension 1.3.0  ·  requires the Marketplace KOI pack  ·  July 2026",
    { x: M, y: 6.6, w: W, h: 0.3, fontSize: 11, color: MUTED, fontFace: F, margin: 0, valign: "top" });
  s.addNotes("This pack ships content only. The integration comes from the Marketplace KOI pack and must be installed first.");
}

/* ============================ 2. What ships ============================ */
{
  const s = newSlide();
  heading(s, "Contents", "What ships in this extension");
  const rows = [
    ["A", "Parsing & modeling rules", "Normalise KOI events and map them to the Cortex Data Model. The Marketplace pack ships none.", ORANGE],
    ["B", "Alerts dashboard", "Ready-made view of KOI alert activity.", ORANGE],
    ["C", "Alert fields, type & layout", "19 KOI fields written onto each alert and shown in a purpose-built layout.", ORANGE],
    ["D", "Triage & investigation playbooks", "6 playbooks: triage, item and device investigation, enrichment, gated response.", CYAN],
    ["E", "Hunting playbooks", "3 playbooks: MCP server audit, hunt sweep, and its investigation sub-playbook.", CYAN],
    ["F", "Script Runner playbooks", "5 playbooks plus the KoiScanTracker automation — run KOI scripts fleet-wide.", CYAN],
  ];
  const rh = 0.72;
  rows.forEach(([g, t, d, c], i) => {
    const y = 1.55 + i * (rh + 0.13);
    card(s, M, y, W, rh);
    chip(s, M + 0.26, y + 0.2, g, c, 0.32);
    s.addText(t, { x: M + 0.76, y: y + 0.13, w: 3.9, h: 0.26, fontSize: 12, bold: true, color: WHITE, fontFace: F, margin: 0, valign: "top" });
    s.addText(d, { x: M + 4.8, y: y + 0.15, w: W - 5.1, h: 0.44, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" });
  });
  s.addText("The integration itself is NOT in this pack — it comes from the Marketplace KOI pack, which must be installed first.",
    { x: M, y: 6.75, w: W, h: 0.3, fontSize: 10.5, italic: true, color: AMBER, fontFace: F, margin: 0, valign: "top" });
}

/* ============================ 3. How to read ============================ */
{
  const s = newSlide();
  heading(s, "How to use this guide", "Every test is laid out the same way");
  const cols = [
    ["PACK CONTENT", CYAN, "The content items that must be on the tenant for this test — playbooks, automations, rules, Lists. Useful if you upload the pack piece by piece rather than in one go."],
    ["TENANT SETUP", AMBER, "What you configure yourself: integration instances, an endpoint group, a script in Action Center, the configuration List."],
    ["STEPS  +  WHAT TO EXPECT", ORANGE, "What to click, in order, in the Cortex XSIAM console — and what a passing test looks like. Anything to paste is shown in monospace."],
  ];
  const cw = (W - 0.6) / 3;
  cols.forEach(([t, c, d], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 1.6, cw, 2.5, i === 1 ? CARD : CARD_HI);
    s.addText(t, { x: x + 0.3, y: 1.85, w: cw - 0.6, h: 0.3, fontSize: 11, bold: true, color: c, fontFace: F, charSpacing: 1.5, margin: 0, valign: "top" });
    s.addText(d, { x: x + 0.3, y: 2.25, w: cw - 0.6, h: 1.7, fontSize: 11, color: BODY, fontFace: F, margin: 0, lineSpacing: 14, valign: "top" });
  });
  card(s, M, 4.32, W, 2.05, CARD_HI);
  s.addText("Installed the pack, or uploading piece by piece?", { x: M + 0.34, y: 4.5, w: 7.0, h: 0.3, fontSize: 13, bold: true, color: WHITE, fontFace: F, margin: 0, valign: "top" });
  s.addText("Install the whole pack and every playbook, automation, rule and the Koi Script Runner List are already on the tenant — nothing to upload. If you upload selectively instead, the PACK CONTENT column on each test is your upload checklist for that test.",
    { x: M + 0.34, y: 4.85, w: W - 0.68, h: 0.6, fontSize: 11, color: BODY, fontFace: F, margin: 0, lineSpacing: 14, valign: "top" });
  s.addText("Run them in order the first time", { x: M + 0.34, y: 5.5, w: 5.0, h: 0.3, fontSize: 13, bold: true, color: WHITE, fontFace: F, margin: 0, valign: "top" });
  s.addText("Tests 1 to 3 prove data is arriving and correct. Tests 4 to 7 prove the automation. Tests 8 and 9 prove fleet script execution — the only ones needing the Core REST API integration. Test 10 is the alert layout. Nothing here needs a Cortex XDR integration: XSIAM is the XDR, and its XQL engine is built in.",
    { x: M + 0.34, y: 5.85, w: W - 0.68, h: 0.55, fontSize: 11, color: BODY, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" });
  s.addText("Each test lists its own prerequisites — set those up first and the test runs straight through.",
    { x: M, y: 6.6, w: W, h: 0.3, fontSize: 11, italic: true, color: MUTED, fontFace: F, margin: 0, valign: "top" });
}

/* ============================ 4. Prerequisites ============================ */
{
  const s = newSlide();
  heading(s, "Before you begin", "Everything this pack depends on, and where to set it up");
  const hy = 1.45;
  s.addText("What", { x: M + 0.3, y: hy, w: 3.2, h: 0.26, fontSize: 10.5, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Where in XSIAM", { x: M + 3.6, y: hy, w: 4.1, h: 0.26, fontSize: 10.5, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Needed for", { x: M + 7.9, y: hy, w: 3.9, h: 0.26, fontSize: 10.5, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  const rows = [
    ["Marketplace KOI pack", "Marketplace → search KOI → Install", "Everything — it holds the integration", AMBER],
    ["KOI API key", "KOI console → Settings → API Access", "Tests 1-7, 10", CYAN],
    ["KOI integration instance", "Settings → Data Sources → Add → KOI", "Tests 1-7, 10", CYAN],
    ["An egress IP KOI accepts", "Run the instance on a Cortex engine if needed", "Tests 1-7, 10", AMBER],
    ["Core REST API instance", "Settings → Data Sources → Add → Core REST API", "Tests 8-9 only", AMBER],
    ["KOI script in Action Center", "Action Center → Scripts Library → upload", "Tests 8-9", CYAN],
    ["An endpoint group", "Endpoints → tag agents, then Endpoint Groups → dynamic", "Tests 8-9", CYAN],
    ['"Koi Script Runner" JSON List', "Settings → Object Setup → Lists", "Tests 8-9", CYAN],
  ];
  const rh = 0.40;
  rows.forEach(([a, b, c, col], i) => {
    const y = 1.76 + i * (rh + 0.06);
    card(s, M, y, W, rh);
    s.addText(a, { x: M + 0.3, y: y + 0.1, w: 3.2, h: 0.26, fontSize: 10.5, bold: true, color: WHITE, fontFace: F, margin: 0, valign: "top" });
    s.addText(b, { x: M + 3.6, y: y + 0.1, w: 4.2, h: 0.26, fontSize: 10, color: BODY, fontFace: F, margin: 0, valign: "top" });
    s.addText(c, { x: M + 7.9, y: y + 0.1, w: 3.9, h: 0.26, fontSize: 10, bold: true, color: col, fontFace: F, margin: 0, valign: "top" });
  });
  card(s, M, 6.05, W, 0.85, CARD_HI);
  chip(s, M + 0.26, 6.3, "!", AMBER, 0.32);
  s.addText("Two to set up before anything else. The Marketplace KOI pack must be installed first — this extension ships content only, no integration. The Core REST API instance is needed for tests 8 and 9, where the Script Runner reads endpoint groups through it.",
    { x: M + 0.76, y: 6.18, w: W - 1.1, h: 0.6, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" });
}

testSlide("Test 1", "Connectivity and authorisation",
  ["KOI integration (from the Marketplace KOI pack)"],
  ["Marketplace KOI pack installed (it holds the integration)",
   "A KOI API key from the KOI console"],
  ["Settings → Data Sources → Add an instance → search KOI.",
   ["Server URL:  https://api.prod.koi.security/", "code"],
   "Paste the API key, click Test, then Save.",
   "Open the CLI on any incident and run:",
   ["!koi-inventory-list limit=5", "code"]],
  ["Test returns Success.",
   "The command returns a table of inventory items."]
);

testSlide("Test 2", "Event collection",
  ["KOI integration",
   "KoiContentExtension Parsing Rule"],
  ["Test 1 passing", "Fetch events enabled on the KOI instance"],
  ["Edit the KOI instance and tick Fetch events, then Save.",
   "Wait for two collection cycles.",
   "Open Query Builder and run:",
   ["dataset = koi_koi_raw", "code"],
   ["| comp count() as rows by source_log_type", "code"]],
  ["Rows appear under Alerts, Audit, or both.",
   "Counts grow between cycles.",
   "Fields such as item_id and marketplace are populated — this pack's parsing rule does that."]
);

testSlide("Test 3", "Counting alerts correctly",
  ["KoiContentExtension Parsing Rule",
   "KOI alerts dashboard"],
  ["Test 2 passing — events present in koi_koi_raw"],
  ["In Query Builder run:",
   ["dataset = koi_koi_raw", "code"],
   ['| filter source_log_type = "Alerts"', "code"],
   ["| comp count() as rows, count_distinct(koi_notification_id) as real_alerts", "code"],
   "Then open the KOI Alerts Dashboard and compare."],
  ["rows is far larger than real_alerts.",
   "Dashboard alert counts match real_alerts, not rows.",
   "Counts stay stable as fetches repeat."]
);

testSlide("Test 4", "Alert triage",
  ["KOI Ext IR - Alert Triage",
   "KOI Ext IR - Extract Alert Context",
   "19 KOI incident fields + incident type"],
  ["Test 1 passing", "A KOI alert in XSIAM"],
  ["Open a KOI alert.",
   "Attach the triage playbook, or run:",
   ['!setPlaybook playbookId="KOI Ext IR - Alert Triage"', "code"],
   "Watch the Work Plan, then read the War Room."],
  ["Context is extracted from the alert payload.",
   "A verdict is posted: Malicious, Suspicious or Benign.",
   "Low risk auto-closes; critical and high escalate.",
   "The 19 KOI alert fields are written onto the alert."]
);

testSlide("Test 5", "Item and device investigation",
  ["KOI Ext IR - Investigate Item",
   "KOI Ext IR - Investigate Device",
   "KOI Ext IR - Enrich Item"],
  ["Test 1 passing",
   "An item id and its marketplace, and a hostname",
   "Nothing else — the XQL engine XSIAM uses for execution evidence is built in"],
  ["Automation → Playbooks → KOI Ext IR - Investigate Item → Run.",
   "Supply item_id and marketplace.",
   "Repeat with KOI Ext IR - Investigate Device and a hostname."],
  ["An investigation summary with organisation exposure.",
   "Both governance counts — on blocklist AND on allowlist.",
   "The device view lists what KOI inventoried on that host.",
   "With Cortex XDR present, execution evidence is added."]
);

testSlide("Test 6", "Gated response",
  ["KOI Ext IR - Block and Remediate",
   "KOI Ext IR - Investigate Item"],
  ["Test 1 passing", "An item id and marketplace", "Permission to approve a task"],
  ["Automation → Playbooks → KOI Ext IR - Block and Remediate → Run.",
   "Supply item_id and marketplace.",
   "Open the pending approval task and read it.",
   "Approve, or leave it pending."],
  ["The run PARKS on an approval task and waits.",
   "The approval shows the investigation and governance state.",
   "Nothing reaches the blocklist until a human approves.",
   "An item already blocked short-circuits."]
);

testSlide("Test 7", "Proactive hunting",
  ["KOI Ext Hunting - MCP Server Audit",
   "KOI Ext Hunting - Hunt Sweep",
   "KOI Ext Hunting - Hunt Match Investigation"],
  ["Test 1 passing",
   "Nothing else — the hunt sweep queries xdr_data, which XSIAM holds natively"],
  ["Automation → Playbooks → KOI Ext Hunting - MCP Server Audit → Run.",
   "Then run KOI Ext Hunting - Hunt Sweep.",
   "Optionally set hunt_set and min_risk.",
   "Read the War Room match table."],
  ["The audit lists MCP servers at or above the threshold.",
   "The sweep runs its hunts and investigates what it finds.",
   "Block candidates are routed to an analyst gate, never blocked automatically."]
);

/* ---------- Script Runner: what to put in place (its own slide) ---------- */
{
  const s = newSlide();
  heading(s, "Tests 8 and 9 — prepare", "Script Runner: everything this use case needs");
  const lw = 6.5, rw = W - lw - 0.4, rx = M + lw + 0.4;

  card(s, M, 1.42, lw, 3.05);
  s.addText("PACK CONTENT — all of it", { x: M + 0.3, y: 1.60, w: lw - 0.6, h: 0.26, fontSize: 10.5,
    bold: true, color: CYAN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Five playbooks — import child before parent:", { x: M + 0.3, y: 1.92, w: lw - 0.6, h: 0.24,
    fontSize: 10, italic: true, color: MUTED, fontFace: F, margin: 0, valign: "top" });
  ["1  KOI Ext Script Runner - Execute Endpoint Script",
   "2  KOI Ext Script Runner - Process Config Entry",
   "3  KOI Ext Script Runner - Refresh Entry",
   "4  KOI Ext Script Runner - Refresh Job",
   "5  KOI Ext Script Runner - Scan Job"].forEach((t, i) => {
    s.addText(t, { x: M + 0.42, y: 2.20 + i * 0.245, w: lw - 0.7, h: 0.24, fontSize: 10.5,
      color: BODY, fontFace: F, margin: 0, valign: "top" });
  });
  s.addText("Plus:", { x: M + 0.3, y: 3.50, w: 1.0, h: 0.24, fontSize: 10, italic: true,
    color: MUTED, fontFace: F, margin: 0, valign: "top" });
  s.addText("KoiScanTracker — an automation, not a playbook. Ours, and different from the KOI deployment script opposite. For manual upload use dist/automation-KoiScanTracker.yml (one file).",
    { x: M + 0.42, y: 3.74, w: lw - 0.7, h: 0.62, fontSize: 10.5, color: BODY, fontFace: F,
      margin: 0, lineSpacing: 12, valign: "top" });

  card(s, rx, 1.42, rw, 3.05, CARD_HI);
  s.addText("TENANT SETUP", { x: rx + 0.3, y: 1.60, w: rw - 0.6, h: 0.26, fontSize: 10.5,
    bold: true, color: AMBER, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  rowList(s, [
    "Core REST API integration instance — the Refresh job reads endpoint groups through it.",
    "The KOI deployment script in Action Center → Scripts Library. Download it from YOUR KOI console; it is KOI's script, not a Cortex one, and must take no parameters.",
    "An endpoint group — tag the agents, then build a dynamic group on that tag.",
  ], rx + 0.34, 1.94, rw - 0.68, "tick");

  card(s, M, 4.58, W, 2.62);
  s.addText("Do this once, before tests 8 and 9", { x: M + 0.34, y: 4.80, w: 6.0, h: 0.28,
    fontSize: 12, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  rowList(s, [
    "Installed the whole pack? All of the above is already on the tenant — go straight to test 8.",
    "Uploading selectively? Automation → Playbooks → Import for the five playbooks, in the order listed.",
    "Automation → Scripts → Import for KoiScanTracker — upload dist/automation-KoiScanTracker.yml. One file, code already inside; do not upload the two files under Scripts/.",
    "Settings → Object Setup → Lists → New List, type JSON, named exactly Koi Script Runner. Paste the block from Lists/README.md.",
    "Edit two things in that List: endpoint_groups and script.name. One entry per OS; the rest has working defaults.",
  ], M + 0.34, 5.18, W - 0.68, "num");
}

testSlide("Test 8", "Script Runner — refresh the tracker",
  ["KOI Ext Script Runner - Refresh Job", "KOI Ext Script Runner - Refresh Entry",
   "KoiScanTracker  (automation)", "List: Koi Script Runner"],
  ["Everything on the previous slide is in place"],
  ["Automation → Jobs → New Job, time-triggered, playbook KOI Ext Script Runner - Refresh Job.",
   "Enable the Job, then use Run now."],
  ["A tracker List appears under Lists, named as in your entry.",
   "It fills with one row per endpoint: an id and a last-scan value.",
   "Re-running adds new endpoints without disturbing existing rows."]
);

testSlide("Test 9", "Script Runner — scan due endpoints",
  ["KOI Ext Script Runner - Scan Job",
   "KOI Ext Script Runner - Process Config Entry",
   "KOI Ext Script Runner - Execute Endpoint Script",
   "KoiScanTracker  (our automation)"],
  ["Test 8 passing — the tracker List has rows",
   "Connected agents in the group, matching the entry's endpoint_os"],
  ["Automation → Jobs → New Job → time-triggered → playbook KOI Ext Script Runner - Scan Job.",
   "Enable the Job, then Run now.",
   "Open the run, then check Action Center.",
   "Run it a second time immediately."],
  ["The script is dispatched to due, connected endpoints.",
   "Those endpoints get a last-scan timestamp in the tracker.",
   "Offline and wrong-OS endpoints stay due and retry later.",
   "The second run does nothing — all inside the rescan interval.",
   "A SKIPPED entry means nothing was due; a STILL RUNNING entry means Action Center is finishing on its own. Both are normal and send no email."]
);

testSlide("Test 10", "Alert fields and layout",
  ["19 KOI incident fields",
   "KOI Supply Chain Alert incident type",
   "its layout"],
  ["Test 4 passing — triage has run on an alert",
   "The incident type and layout installed with this pack"],
  ["Open an alert that triage has processed.",
   "Check its type is KOI Supply Chain Alert.",
   "Read the KOI Alert tab."],
  ["19 KOI fields are populated on the alert itself.",
   "They are grouped: item, risk and verdict, affected host, governance, summary.",
   "An analyst sees the picture without opening the War Room."]
);

/* ============================ Sign-off ============================ */
{
  const s = newSlide();
  s.addShape(pres.ShapeType.ellipse, { x: 11.4, y: -3.4, w: 4.8, h: 4.8,
    fill: { color: GREEN, transparency: 93 }, line: { color: GREEN, width: 1 } });
  heading(s, "Sign-off", "One line of evidence per test");
  const checks = [
    ["1", "Test returns Success; inventory returns rows"],
    ["2", "koi_koi_raw grows; promoted fields are populated"],
    ["3", "Distinct alerts far below raw rows; dashboard matches"],
    ["4", "A verdict is reached; low risk auto-closes"],
    ["5", "Investigation shows exposure and both governance counts"],
    ["6", "Response parks on approval; blocklist untouched"],
    ["7", "MCP audit returns servers; hunt sweep completes"],
    ["8", "Tracker List is created and fills with endpoints"],
    ["9", "Scan marks only due, connected endpoints"],
    ["10", "19 KOI fields populated on the alert layout"],
  ];
  const cw = (W - 0.4) / 2;
  checks.forEach(([n, t], i) => {
    const col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5;
    const x = M + col * (cw + 0.4), y = 1.6 + row * 0.8;
    card(s, x, y, cw, 0.66);
    chip(s, x + 0.22, y + 0.16, n, GREEN, 0.34);
    s.addText(t, { x: x + 0.74, y: y + 0.18, w: cw - 0.98, h: 0.4, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" });
  });
  card(s, M, 5.9, W, 0.8, CARD_HI);
  s.addText("All ten green — the extension is ready for production use.", { x: M + 0.34, y: 6.12, w: 8.0, h: 0.32,
    fontSize: 13, bold: true, italic: true, color: GREEN, fontFace: F, margin: 0, valign: "top" });
  s.addText("Considering the custom KOI integration instead? See the deployment comparison for what differs.",
    { x: M, y: 6.85, w: W, h: 0.3, fontSize: 10.5, color: MUTED, fontFace: F, margin: 0, valign: "top" });
}

const out = path.join(__dirname, "KOI_Marketplace_Pack_Test_Guide.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("written", out));
