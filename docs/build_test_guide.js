/* Build "KOI — Marketplace Pack v1.2.3 — Test Guide" (.pptx)
 *
 * Visual language reused from ../KOI/docs/build_test_guide.js (the CUSTOM pack's generator).
 * The CONTENT is not reused: it describes a different pack.
 *
 * Every command / argument / output / configuration fact on these slides is read at run time
 * from reference/marketplace-pack.json (derived mechanically from the pinned upstream YAML).
 * Everything observed on a tenant is cited to VERIFIED_FACTS.md by section number.
 *
 * Run:
 *   export NODE_PATH=/Users/aymanmahmoud/Documents/Coding/KOI-MP/node_modules
 *   node docs/build_test_guide.js
 *
 * Idempotent: no timestamps, no randomness — two runs produce the same deck.
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

/* ======================================================================
   Source of truth #1 — the pinned pack JSON. Nothing below hand-types a
   command, an argument, a default or a context path.
   ====================================================================== */
const PACK = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "reference", "marketplace-pack.json"), "utf8")
);

const CMD = Object.fromEntries(PACK.commands.map((c) => [c.name, c]));
const cmdNames = PACK.commands.map((c) => c.name).sort();

/* Display order — grouping only. Membership is asserted against the JSON. */
const ORDER = [
  "koi-get-events",
  "koi-policy-list",
  "koi-policy-status-update",
  "koi-allowlist-get",
  "koi-allowlist-items-add",
  "koi-allowlist-items-remove",
  "koi-blocklist-get",
  "koi-blocklist-items-add",
  "koi-blocklist-items-remove",
  "koi-inventory-list",
  "koi-inventory-item-get",
  "koi-inventory-search",
  "koi-inventory-item-endpoints-list",
];
if (ORDER.slice().sort().join("|") !== cmdNames.join("|")) {
  throw new Error(
    "Display order does not match the pack JSON command set.\n" +
      "  JSON : " + cmdNames.join(", ") + "\n" +
      "  ORDER: " + ORDER.slice().sort().join(", ")
  );
}

/* State-changing = the two governance write pairs plus the policy toggle.
   Derived from the command name, then cross-checked against the JSON:
   both *-items-remove commands must carry execution: true (the platform's
   "potentially harmful" flag), and no read command may carry it. */
const isMutating = (n) => /-items-(add|remove)$/.test(n) || n === "koi-policy-status-update";
const MUTATING = ORDER.filter(isMutating);
const READONLY = ORDER.filter((n) => !isMutating(n));
if (MUTATING.length !== 5 || READONLY.length !== 8)
  throw new Error(`Expected 5 state-changing / 8 read-only, got ${MUTATING.length}/${READONLY.length}`);
PACK.commands.forEach((c) => {
  if (c.execution && !isMutating(c.name))
    throw new Error(`execution:true on a command not classified as state-changing: ${c.name}`);
});
const EXEC_FLAGGED = PACK.commands.filter((c) => c.execution).map((c) => c.name);

const argsOf = (n) => CMD[n].arguments;
const argNames = (n) => argsOf(n).map((a) => a.name);
const requiredArgs = (n) => argsOf(n).filter((a) => a.required).map((a) => a.name);
const predefined = (n, arg) => (argsOf(n).find((a) => a.name === arg) || {}).predefined || [];
const defaultOf = (n, arg) => (argsOf(n).find((a) => a.name === arg) || {}).defaultValue;
const outCount = (n) => CMD[n].outputs.length;
const prefixOf = (n) => {
  const p = [...new Set(CMD[n].outputs.map((o) => o.contextPath.split(".").slice(0, -1).join(".")))];
  return p.length ? p.sort().join(" / ") : "none";
};
/* A literal command line: name + the required args as <placeholders>, plus any extras given.
   Placeholders are abbreviated so a full command still fits one line on a slide. */
const PH = { item_id: "<id>", marketplace: "<mp>", version: "<ver>", policy_id: "<id>" };
const invoke = (n, extra = {}) => {
  const parts = ["!" + n];
  requiredArgs(n).forEach((a) =>
    parts.push(`${a}=${extra[a] !== undefined ? extra[a] : PH[a] || "<" + a + ">"}`)
  );
  Object.keys(extra)
    .filter((k) => !requiredArgs(n).includes(k))
    .forEach((k) => parts.push(`${k}=${extra[k]}`));
  return parts.join(" ");
};

const CFG = PACK.configuration;
const cfgByName = Object.fromEntries(CFG.map((c) => [c.name, c]));
const PACK_VER = PACK.pack.currentVersion;
const PACK_ID = `Marketplace KOI pack v${PACK_VER}  ·  demisto/content ${PACK.source.path}`;

/* ======================================================================
   Presentation layer — palette and helpers from the custom-pack generator
   ====================================================================== */
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Cortex XSIAM";
pres.title = `KOI Marketplace Pack v${PACK_VER} — Test Guide`;
pres.subject = `Acceptance tests for the official Marketplace KOI pack v${PACK_VER}`;

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
const W = 13.3 - M * 2; // usable width = 12.1

const footer = (s) =>
  s.addText(
    `${PACK_ID}  ·  ${PACK.counts.commands} commands  —  NOT the custom in-house pack (v1.3.0, 26 commands)`,
    {
      x: M, y: 7.05, w: W, h: 0.24, fontSize: 8, color: MUTED, fontFace: F,
      margin: 0, valign: "top",
    }
  );

const newSlide = () => {
  const s = pres.addSlide();
  s.background = { color: BG };
  footer(s);
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

const GUTTER = 0.32;

const wrapLines = (txt, kind, usableIn) => {
  const cpi = kind === "code" ? 0.0875 : 0.0775; // inches per character
  const perLine = Math.max(18, Math.floor(usableIn / cpi));
  return Math.max(1, Math.ceil(txt.length / perLine));
};

const rowList = (s, items, x, y, w, marker) => {
  const tw = w - GUTTER;
  let cy = y;
  let step = 0;
  items.forEach((it) => {
    const [txt, kind] = Array.isArray(it) ? it : [it, "text"];
    const n = wrapLines(txt, kind, tw);
    /* A literal command line is the continuation of the step above it, not a step of
       its own — numbering it makes a five-step procedure read as nine. Code lines get
       no marker; only prose advances the counter. */
    if (marker !== "num" || kind !== "code") {
      if (marker === "num") step += 1;
      s.addText(marker === "num" ? String(step) : "✓", {
        x, y: cy, w: GUTTER - 0.08, h: 0.28, fontSize: 11.5, bold: true,
        color: marker === "num" ? ORANGE : GREEN, fontFace: F, margin: 0, valign: "top",
      });
    }
    s.addText(txt, {
      x: x + GUTTER, y: cy, w: tw, h: n * 0.21 + 0.06,
      fontSize: kind === "code" ? 10.5 : 11.5,
      fontFace: kind === "code" ? MONO : F,
      color: kind === "code" ? CYAN : BODY,
      margin: 0, lineSpacing: 15, valign: "top",
    });
    cy += n * 0.205 + 0.155;
  });
  return cy - y;
};

const estH = (items, usableIn) =>
  items.reduce((h, it) => {
    const [txt, kind] = Array.isArray(it) ? it : [it, "text"];
    return h + wrapLines(txt, kind, usableIn - GUTTER) * 0.205 + 0.155;
  }, 0);

/* One test slide: numbered steps left, expected results right, an amber note under.
   `fail` is the extra card that separates a real failure from an empty-but-correct run. */
const testSlide = (kicker, title, steps, expects, note) => {
  const s = newSlide();
  heading(s, kicker, title);
  const sw = 7.0, ew = W - sw - 0.4, ex = M + sw + 0.4;
  const need = Math.max(estH(steps, sw - 0.68), estH(expects, ew - 0.68));
  const CAP = note ? 4.18 : 4.95; // above this the note card would collide with the footer
  const ch = Math.min(CAP, Math.max(2.35, need + 0.96));
  /* Build-time guard: pptxgenjs will happily draw text past the bottom of its card.
     Content starts 0.66in below the card top, so it must end at least a little above
     the card bottom. Fail loudly instead of shipping a slide with a cut-off last step. */
  if (need + 0.70 > ch + 0.01)
    throw new Error(
      `Slide "${title}" overflows its card: content needs ${(need + 0.70).toFixed(2)}in, ` +
      `card is ${ch.toFixed(2)}in (cap ${CAP}in). Shorten the steps or the expected results.`
    );

  card(s, M, 1.58, sw, ch);
  s.addText("Steps", {
    x: M + 0.34, y: 1.82, w: 3.0, h: 0.3, fontSize: 12.5, bold: true,
    color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top",
  });
  rowList(s, steps, M + 0.34, 2.24, sw - 0.68, "num");

  card(s, ex, 1.58, ew, ch, CARD_HI);
  s.addText("Expected result", {
    x: ex + 0.34, y: 1.82, w: 3.4, h: 0.3, fontSize: 12.5, bold: true,
    color: GREEN, fontFace: F, charSpacing: 1, margin: 0, valign: "top",
  });
  rowList(s, expects, ex + 0.34, 2.24, ew - 0.68, "tick");

  if (note) {
    const ny = 1.58 + ch + 0.22;
    card(s, M, ny, W, 1.00, CARD_HI);
    chip(s, M + 0.28, ny + 0.33, "!", AMBER, 0.34);
    s.addText("Real failure vs empty-but-correct", {
      x: M + 0.82, y: ny + 0.13, w: W - 1.2, h: 0.24, fontSize: 10, bold: true,
      color: AMBER, fontFace: F, charSpacing: 1, margin: 0, valign: "top",
    });
    s.addText(note, {
      x: M + 0.82, y: ny + 0.36, w: W - 1.2, h: 0.60, fontSize: 9.5,
      color: BODY, fontFace: F, margin: 0, lineSpacing: 11.5, valign: "top",
    });
  }
  return s;
};

/* A generic pre-conditions strip drawn under a test title (used where the test
   slide needs it called out separately from the steps). */
const precond = (s, text, y = 1.42) =>
  s.addText("Preconditions:  " + text, {
    x: M, y, w: W, h: 0.3, fontSize: 11, italic: true, color: MUTED, fontFace: F,
    margin: 0, valign: "top",
  });

/* ============================ 1. Title ============================ */
{
  const s = newSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.3, y: -1.6, w: 6.0, h: 6.0,
    fill: { color: GREEN, transparency: 93 }, line: { color: GREEN, width: 1 },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.8, y: 3.5, w: 3.4, h: 3.4,
    fill: { color: ORANGE, transparency: 93 }, line: { color: ORANGE, width: 1 },
  });
  s.addText(`MARKETPLACE KOI PACK  v${PACK_VER}  ·  ACCEPTANCE TESTING`, {
    x: M, y: 1.62, w: W, h: 0.3, fontSize: 12, bold: true,
    color: ORANGE, fontFace: F, charSpacing: 3, margin: 0, valign: "top",
  });
  s.addText("Test Guide", {
    x: M, y: 1.92, w: 8.6, h: 1.35, fontSize: 66, bold: true,
    color: WHITE, fontFace: F, margin: 0, valign: "top",
  });
  s.addText(
    `Ten tests for the official pack from demisto/content — ${PACK.source.path} — ` +
    `pack version ${PACK_VER}, ${PACK.counts.commands} commands, integration only. ` +
    "This is NOT the custom in-house KOI pack (v1.3.0, 26 commands): both present as \"KOI\", " +
    "so test 1 exists purely to tell them apart.",
    {
      x: M, y: 3.42, w: 8.5, h: 1.3, fontSize: 15, color: BODY, fontFace: F,
      margin: 0, lineSpacing: 21, valign: "top",
    }
  );
  const stats = [
    ["10", "tests"],
    [String(PACK.counts.commands), "commands"],
    [String(READONLY.length), "non-mutating"],
    [String(MUTATING.length), "state-changing"],
    ["0", "playbooks in pack"],
  ];
  stats.forEach(([n, l], i) => {
    const x = M + i * 1.72;
    s.addText(n, { x, y: 5.05, w: 1.6, h: 0.6, fontSize: 32, bold: true, color: GREEN, fontFace: F, margin: 0, valign: "top" });
    s.addText(l, { x, y: 5.62, w: 1.65, h: 0.3, fontSize: 10.5, color: MUTED, fontFace: F, margin: 0, valign: "top" });
  });
  s.addText(
    `Command surface generated at build time from reference/marketplace-pack.json  ` +
    `(upstream ${PACK.source.repo} ${PACK.source.path}, md5 ${PACK.source.md5}, checked against master ${PACK.source.verified_against_master}). ` +
    "Tenant observations cited to VERIFIED_FACTS.md, verified 20 July 2026.",
    /* Stops short of 11.2in: the orange ring crosses that x at this height and the
       provenance line was being drawn straight through it. */
    { x: M, y: 6.24, w: 10.4, h: 0.6, fontSize: 9.5, italic: true, color: MUTED, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" }
  );
  s.addNotes(
    "Scope honestly: this pack ships an integration and nothing else — no playbooks, no parsing rules, " +
    "no modeling rules, no dashboard. Tests 1-2 prove identity and connectivity, 3-8 the command surface, " +
    "9-10 event collection. The triage / investigation / gated-response tests from the custom pack are absent " +
    "because the commands they depend on do not exist here."
  );
}

/* ============================ 2. Identity guard ============================ */
{
  const s = newSlide();
  heading(s, "Before you start", "Two different packs are both called KOI");
  s.addText(
    "They share a pack name, an integration id, a category, an author and the koi-* command prefix. " +
    "They cannot coexist on one tenant — installing one overwrites the other. Everything in this guide " +
    "is written for the left-hand column.",
    { x: M, y: 1.42, w: 11.4, h: 0.6, fontSize: 12.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 16, valign: "top" }
  );
  const rows = [
    ["Pack version", PACK_VER, "1.3.0"],
    ["Commands", String(PACK.counts.commands), "26"],
    ["Content items", "Integration only", "Integration + 10 playbooks + rules + dashboard"],
    ["Context prefixes", PACK.contextPrefixes.join(", "), "17 prefixes, incl. Koi.Device.*"],
    ["Parsing / modeling rules", "None ship", "Both ship"],
    ["fromversion", PACK.integration.fromversion, "8.2.0 integration / 8.4.0 rules"],
    ["Docker image", PACK.integration.dockerimage, "demisto/fastapi:0.125.0.9094740"],
  ];
  const hy = 2.16;
  s.addText("What to check", { x: M + 0.3, y: hy, w: 3.0, h: 0.28, fontSize: 10.5, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("THIS pack — Marketplace", { x: M + 3.5, y: hy, w: 4.3, h: 0.28, fontSize: 10.5, bold: true, color: GREEN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("The custom pack — out of scope", { x: M + 8.0, y: hy, w: 4.1, h: 0.28, fontSize: 10.5, bold: true, color: RED, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  /* Row height follows the tallest cell: the context-prefix list is two mono lines and
     would otherwise be drawn straight through the bottom of a fixed-height card. */
  let ry = 2.44;
  rows.forEach(([k, a, b]) => {
    const mono = k === "Docker image" || k === "Context prefixes";
    const n = Math.max(
      wrapLines(k, "text", 3.0),
      wrapLines(a, mono ? "code" : "text", 4.3),
      wrapLines(b, "text", 4.1)
    );
    const rh = 0.50 + (n - 1) * 0.20;
    const th = n * 0.21 + 0.07;
    card(s, M, ry, W, rh);
    s.addText(k, { x: M + 0.3, y: ry + 0.14, w: 3.0, h: th, fontSize: 10.5, bold: true, color: WHITE, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" });
    s.addText(a, { x: M + 3.5, y: ry + 0.14, w: 4.3, h: th, fontSize: 10.5, color: GREEN, fontFace: mono ? MONO : F, margin: 0, lineSpacing: 15, valign: "top" });
    s.addText(b, { x: M + 8.0, y: ry + 0.14, w: 4.1, h: th, fontSize: 10.5, color: MUTED, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" });
    ry += rh + 0.07;
  });
  s.addText(
    "Preserve the casing inconsistency in both packs: events are KOI.Event.*, everything else is Koi.*. " +
    "\"Fixing\" it breaks DT paths.",
    { x: M, y: ry + 0.06, w: W, h: 0.3, fontSize: 10.5, italic: true, color: AMBER, fontFace: F, margin: 0, valign: "top" }
  );
  if (ry + 0.06 + 0.20 > 7.02) throw new Error(`Slide 2 comparison table runs into the footer (note at ${ry.toFixed(2)}in).`);
  s.addNotes(
    "Right-hand column is given only so a reader can recognise the wrong pack. Do not run any test in this " +
    "guide against it — the command set is a superset and several expected results differ."
  );
}

/* ============================ 3. Test plan ============================ */
{
  const s = newSlide();
  heading(s, "Test plan", "Ten tests, in order");
  const tests = [
    ["1", "Pack identity", `currentVersion is ${PACK_VER} and ${PACK.counts.commands} commands are registered`, ORANGE],
    ["2", "Instance config + Test", "The instance saves and the Test button returns Success", ORANGE],
    ["3", "Policy & governance reads", "koi-policy-list, koi-allowlist-get, koi-blocklist-get", CYAN],
    ["4", "Inventory reads", "list, item-get, item-endpoints-list return Koi.Inventory.*", CYAN],
    ["5", "Advanced search", "koi-inventory-search with a query-builder filter", CYAN],
    ["6", "Event command", "koi-get-events, debug only, push disabled", CYAN],
    ["7", "The mcp_servers view", "Works, but is missing from the argument dropdown", AMBER],
    ["8", "State-changing commands", "Controlled protocol — record, change, reverse", RED],
    ["9", "Event collection", "koi_koi_raw is populated by the collector", GREEN],
    ["10", "Alerts vs Audit, and XDM", "Split by source_log_type; XDM is empty by design", GREEN],
  ];
  const cw = (W - 0.6) / 3, ch = 1.18, step = ch + 0.18;
  tests.forEach(([n, t, d, c], i) => {
    const x = M + (i % 3) * (cw + 0.3);
    const y = 1.54 + Math.floor(i / 3) * step;
    card(s, x, y, cw, ch);
    chip(s, x + 0.26, y + 0.18, n, c, 0.32);
    s.addText(t, { x: x + 0.26, y: y + 0.56, w: cw - 0.52, h: 0.28, fontSize: 12, bold: true, color: WHITE, fontFace: F, margin: 0, valign: "top" });
    s.addText(d, { x: x + 0.26, y: y + 0.84, w: cw - 0.52, h: 0.32, fontSize: 9.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 11, valign: "top" });
  });
  /* The last row has one card; the closing note occupies the two empty cells beside it. */
  s.addText(
    "Tests 1 and 2 are gates: do not interpret any later result until both pass.\n" +
    "Test 8 is the only one that writes to KOI — run it last, on a disposable item, and reverse it.\n" +
    "Tests 3, 4, 5 and 7 are read-only and safe to repeat. Test 6 is NOT: the pack calls koi-get-events " +
    "debugging-only — it may duplicate events, exceed rate limits or disrupt the fetch, and " +
    "should_push_events=true writes events into koi_koi_raw.",
    {
      x: M + cw + 0.3, y: 1.54 + 3 * step + 0.10, w: 2 * cw + 0.3, h: 1.16,
      fontSize: 11, italic: true, color: MUTED, fontFace: F, margin: 0, lineSpacing: 15, valign: "top",
    }
  );
  s.addNotes(
    "Tests 3, 4, 5 and 7 are read-only and safe to repeat. Test 6 is the exception among the reads: the pack's own " +
    "description calls koi-get-events development-and-debugging only (duplicate events, rate limits, disrupted " +
    "fetch) and its should_push_events argument writes into koi_koi_raw when true — 7 of the 8 non-mutating " +
    "commands are freely repeatable, this one is not (VERIFIED_FACTS §1.1). Test 8 changes tenant state in KOI, " +
    "not in Cortex."
  );
}

/* ============================ 4. Preconditions ============================ */
{
  const s = newSlide();
  heading(s, "Preconditions", "What must be true before test 1");
  const cols = [
    ["For every test", ORANGE, "Identity, access, and a place to type commands", [
      `The Marketplace KOI pack v${PACK_VER} installed — and the custom pack NOT installed`,
      `Cortex platform at or above fromversion ${PACK.integration.fromversion}`,
      "A KOI API key, and an egress path KOI accepts (direct tenant egress or an engine)",
      "A war room / playground where you can type ! commands",
      "Permission to read the instance configuration",
    ]],
    ["For tests 9 and 10 only", GREEN, "Event collection into the dataset — XSIAM / platform only", [
      `${cfgByName.isFetchEvents.display} enabled — the Collect section is hidden on XSOAR, where the collector is off`,
      `${cfgByName.event_types_to_fetch.display} set — default is ${cfgByName.event_types_to_fetch.defaultvalue}`,
      "At least two completed fetch cycles",
      "XQL search access on the tenant",
      "Real activity in KOI in the window you query — an idle tenant legitimately returns nothing",
    ]],
  ];
  const cw = (W - 0.4) / 2;
  cols.forEach(([t, c, sub, items], i) => {
    const x = M + i * (cw + 0.4);
    card(s, x, 1.58, cw, 3.55, i ? CARD_HI : CARD);
    s.addText(t, { x: x + 0.34, y: 1.80, w: cw - 0.68, h: 0.34, fontSize: 16, bold: true, color: c, fontFace: F, margin: 0, valign: "top" });
    s.addText(sub, { x: x + 0.34, y: 2.18, w: cw - 0.68, h: 0.3, fontSize: 11, italic: true, color: MUTED, fontFace: F, margin: 0, valign: "top" });
    rowList(s, items, x + 0.34, 2.62, cw - 0.68, "tick");
  });
  /* 1.42in left a third of the card empty under a two-line note. Grown to 1.30in when the
     war-room caveat was added — the text now runs to four lines. */
  card(s, M, 5.32, W, 1.30, CARD_HI);
  chip(s, M + 0.28, 5.58, "!", AMBER, 0.34);
  s.addText("Know how your instance reaches KOI — and what this guide has NOT seen", {
    x: M + 0.82, y: 5.44, w: W - 1.2, h: 0.26, fontSize: 11, bold: true, color: AMBER, fontFace: F, margin: 0, valign: "top",
  });
  s.addText(
    "On the tenant behind this guide, both KOI instances run through a Cortex engine rather than direct tenant " +
    "egress (VERIFIED_FACTS §2). That matters for every connectivity conclusion: a reachability check from the " +
    "tenant itself proves nothing about the path the commands actually take. Separately: the koi-* commands were " +
    "never executed from a war room on that tenant (VERIFIED_FACTS §6), so every war-room table, context path and " +
    "human-readable output stated in this guide is asserted from the pack YAML, not observed. Running these tests " +
    "is what closes that gap.",
    { x: M + 0.82, y: 5.72, w: W - 1.2, h: 0.86, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  s.addNotes(
    "The engine-vs-direct distinction is the single most common source of a misdiagnosed connectivity failure. " +
    "It is also why this guide does not tell you to curl the KOI API from a laptop and conclude anything. " +
    "Be equally plain about the second half: only 8 of the 13 commands had their API exercised at all, and none " +
    "of the 13 was run through XSIAM — a war room is where that gets closed."
  );
}

/* ============================ 5. TEST 1 — pack identity ============================ */
testSlide(
  "Test 1  ·  gate",
  "Confirm WHICH KOI pack is installed",
  [
    "Settings → Marketplace → Installed content → open the pack named KOI.",
    `Read the installed version. It must be ${PACK_VER}.`,
    "Open Settings → Integrations → Instances, find the KOI integration.",
    "Open its command list (or type ! in a war room and filter on koi-).",
    `Count the commands. There must be exactly ${PACK.counts.commands}.`,
    "Spot-check that these are ABSENT — they belong to the other pack:",
    ["koi-devices-list   koi-koidex-search   koi-findings-list", "code"],
    "Confirm the pack contains no playbooks, no rules and no dashboard.",
  ],
  [
    `Pack currentVersion reads ${PACK_VER}.`,
    `Exactly ${PACK.counts.commands} koi-* commands are registered.`,
    `Context prefixes offered are only: ${PACK.contextPrefixes.join(", ")}.`,
    "No Koi.Device.* prefix exists anywhere.",
    "The pack lists one content item: the KOI integration.",
    "None of the three spot-check commands resolve.",
  ],
  "This test has no empty-but-correct outcome — it is pass or fail. If you see 26 commands, or a version of " +
  "1.3.0, or any Koi.Device.* path, you are on the custom pack and NOTHING else in this guide applies. Stop " +
  "and change tenant. A partial count (fewer than 13) means a failed or interrupted install, not the wrong pack."
).addNotes(
  `The 13 commands, from the pinned YAML: ${ORDER.join(", ")}. ` +
  "The custom pack adds 13 more on top of these; the Marketplace set is a strict subset of it, which is exactly " +
  "why counting is the reliable discriminator and reading command names is not."
);

/* ============================ 6. The 13 commands (generated) ============================ */
{
  const s = newSlide();
  heading(s, "Reference", `All ${PACK.counts.commands} commands — expected shape of each`);
  s.addText(
    `Generated from reference/marketplace-pack.json. Totals across the pack: ${PACK.counts.commands} commands, ` +
    `${PACK.counts.arguments} arguments, ${PACK.counts.outputs} declared outputs.`,
    { x: M, y: 1.36, w: W, h: 0.3, fontSize: 11, color: BODY, fontFace: F, margin: 0, valign: "top" }
  );
  const hy = 1.72;
  const COLS = [
    ["Command", M + 0.28, 3.55],
    ["Args", M + 3.95, 0.55],
    ["Outputs", M + 4.60, 0.75],
    ["Context prefix written", M + 5.45, 3.25],
    ["Effect", M + 8.85, 1.55],
    ["Test", M + 10.5, 1.4],
  ];
  COLS.forEach(([t, x, w]) =>
    s.addText(t, { x, y: hy, w, h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" })
  );
  const testFor = {
    "koi-get-events": "6",
    "koi-policy-list": "3",
    "koi-policy-status-update": "8",
    "koi-allowlist-get": "3",
    "koi-allowlist-items-add": "not exercised",
    "koi-allowlist-items-remove": "not exercised",
    "koi-blocklist-get": "3",
    "koi-blocklist-items-add": "8",
    "koi-blocklist-items-remove": "8",
    "koi-inventory-list": "4, 7",
    "koi-inventory-item-get": "4",
    "koi-inventory-search": "5",
    "koi-inventory-item-endpoints-list": "4",
  };
  /* Row gap tightened from 0.03 to 0.022 to buy the note below the table a fourth line —
     it now has to carry the "not exercised" caveat as well. */
  const rh = 0.30, rgap = 0.022, ry0 = 1.98;
  ORDER.forEach((n, i) => {
    const y = ry0 + i * (rh + rgap);
    const mut = isMutating(n);
    card(s, M, y, W, rh, mut ? CARD_HI : CARD);
    s.addText(n, { x: M + 0.28, y: y + 0.055, w: 3.55, h: 0.24, fontSize: 9.5, bold: true, color: mut ? AMBER : CYAN, fontFace: MONO, margin: 0, valign: "top" });
    s.addText(String(argsOf(n).length), { x: M + 3.95, y: y + 0.055, w: 0.55, h: 0.24, fontSize: 9.5, color: BODY, fontFace: F, margin: 0, valign: "top" });
    s.addText(String(outCount(n)), { x: M + 4.60, y: y + 0.055, w: 0.75, h: 0.24, fontSize: 9.5, color: outCount(n) ? BODY : RED, fontFace: F, margin: 0, valign: "top" });
    s.addText(prefixOf(n) === "none" ? "none — war-room message only" : prefixOf(n) + ".*", {
      x: M + 5.45, y: y + 0.055, w: 3.25, h: 0.24, fontSize: 9.5,
      color: prefixOf(n) === "none" ? RED : BODY, fontFace: prefixOf(n) === "none" ? F : MONO, margin: 0, valign: "top",
    });
    /* koi-get-events changes nothing in KOI, but it is not in the "run it as often as you like"
       class either: the pack calls it debug-only and should_push_events=true writes into the
       dataset. Flagging it here stops the column reading as a blanket safety guarantee. */
    const dbg = n === "koi-get-events";
    s.addText(mut ? (CMD[n].execution ? "WRITE · execution" : "WRITE") : (dbg ? "read-only · debug only" : "read-only"), {
      x: M + 8.85, y: y + 0.055, w: 1.62, h: 0.24, fontSize: 9.5, bold: mut,
      color: mut ? (CMD[n].execution ? RED : AMBER) : (dbg ? AMBER : GREEN), fontFace: F, margin: 0, valign: "top",
    });
    s.addText(testFor[n], { x: M + 10.5, y: y + 0.055, w: 1.4, h: 0.24, fontSize: 9.5, color: MUTED, fontFace: F, margin: 0, valign: "top" });
  });
  /* The Test column is a cross-reference and must resolve: test 8 works the BLOCKLIST pair as
     its worked example, so the allowlist pair is exercised by no test in this guide. Slide 21's
     sign-off records the same gap — the two must not disagree. */
  const tableNote =
    `Four commands declare zero outputs (${ORDER.filter((n) => !outCount(n)).join(", ")}) — a war-room message ` +
    `only, so nothing can branch on their result. Only ${EXEC_FLAGGED.join(" and ")} carry "execution", the ` +
    `potentially-harmful flag; the other three WRITE commands mutate state unflagged — "not flagged" is not ` +
    `"safe". "Read-only" means only that KOI is unchanged: koi-get-events is debug-only and writes into ` +
    `koi_koi_raw when should_push_events=true, so it alone is not freely repeatable. The allowlist add/remove ` +
    `pair is exercised by no test here — test 8 works the blocklist pair; the sign-off slide records the same gap.`;
  const noteY = ry0 + ORDER.length * (rh + rgap) + 0.08;
  /* 9.5pt against wrapLines' 11.5pt calibration, and lineSpacing 12pt = 0.1667in per line. */
  const noteLines = Math.ceil(tableNote.length / Math.floor(W / (0.0775 * 9.5 / 11.5)));
  const noteH = noteLines * 0.1667 + 0.05;
  if (noteY + noteH > 7.00)
    throw new Error(`Slide 6 table note (${noteLines} lines) runs into the footer at ${(noteY + noteH).toFixed(2)}in.`);
  s.addText(tableNote,
    { x: M, y: noteY, w: W, h: noteH, fontSize: 9.5, italic: true, color: MUTED, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" }
  );
  s.addNotes(
    `${PACK.counts.outputs} output declarations span 68 distinct context paths (VERIFIED_FACTS §4): the three ` +
    "Koi.Inventory writers declare identical paths, and koi-policy-list and koi-policy-status-update share all " +
    "nine Koi.Policy paths. Consequence for testing: the last command to run overwrites the previous one's context, " +
    "so check context immediately after each command rather than at the end of a sweep. " +
    "If asked why two commands say \"not exercised\": test 8 demonstrates the add-and-reverse protocol on the " +
    "blocklist pair only, so nothing in these ten tests runs koi-allowlist-items-add or -remove. The protocol " +
    "transfers to them unchanged — the arguments are identical — but this guide does not claim to have covered them."
  );
}

/* ============================ 7. TEST 2 — instance config ============================ */
testSlide(
  "Test 2  ·  gate",
  "Instance configuration and the Test button",
  [
    "Settings → Integrations → Instances → add an instance of KOI.",
    `Set ${cfgByName.url.display} to the shipped default:`,
    [cfgByName.url.defaultvalue, "code"],
    `Paste the ${cfgByName.api_key.display}. Leave insecure and proxy off unless your network needs them.`,
    "To collect events, tick Fetch events and keep the defaults:",
    [`event_types_to_fetch = ${cfgByName.event_types_to_fetch.defaultvalue}   max_fetch = ${cfgByName.max_fetch.defaultvalue}`, "code"],
    "Click Test, then Save. Then run a live read probe:",
    [invoke("koi-policy-list", { limit: 1 }), "code"],
  ],
  [
    "Test returns Success.",
    "The instance saves without a validation error.",
    "koi-policy-list returns a table and writes Koi.Policy.* to context.",
    "No 401 on the probe. A bad key is verified to answer 401 {\"message\":\"Unauthorized\",\"statusCode\":401}.",
  ],
  "A green Test button alone is weak evidence — always follow it with one real read command. Conversely, " +
  "koi-policy-list returning an empty policies list with HTTP 200 is a correct result for a tenant with no " +
  "policies, not a failure. Distinguish by the error: 401 means the key (verified, VERIFIED_FACTS §5.4a); an " +
  "empty table with no error means an empty tenant. No 403 was ever observed here, so if you get one, diagnose " +
  "it — do not assume it proves blocked egress."
).addNotes(
  "Configuration fields are read from the pack JSON, so this slide cannot drift from the YAML. " +
  "Note that isFetchEvents, event_types_to_fetch, audit_types_filter, max_fetch and eventFetchInterval are all " +
  "hidden on the xsoar marketplace — on XSOAR you will not see the Collect section at all."
);

/* ============================ 8. Configuration parameters (generated) ============================ */
{
  const s = newSlide();
  heading(s, "Reference", "Every configuration parameter, as shipped");
  s.addText(
    "Generated from reference/marketplace-pack.json. Use this to check an existing instance field by field.",
    { x: M, y: 1.36, w: W, h: 0.3, fontSize: 11, color: BODY, fontFace: F, margin: 0, valign: "top" }
  );
  const hy = 1.76;
  /* Column x/width pairs, shared by the header and the rows. "hidden on xsoar · advanced"
     needs a full 2in or it wraps onto a second line and runs out of its row card. */
  const C = {
    name: [0.28, 2.30], display: [2.72, 2.85], section: [5.70, 1.00],
    req: [6.78, 0.55], def: [7.40, 2.45], vis: [9.95, 2.10],
  };
  s.addText("Parameter", { x: M + C.name[0], y: hy, w: C.name[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Display name", { x: M + C.display[0], y: hy, w: C.display[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Section", { x: M + C.section[0], y: hy, w: C.section[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Req.", { x: M + C.req[0], y: hy, w: C.req[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Shipped default", { x: M + C.def[0], y: hy, w: C.def[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Visibility", { x: M + C.vis[0], y: hy, w: C.vis[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  const rh = 0.42;
  CFG.forEach((c, i) => {
    const y = 2.06 + i * (rh + 0.05);
    card(s, M, y, W, rh, c.section === "Collect" ? CARD_HI : CARD);
    s.addText(c.name, { x: M + C.name[0], y: y + 0.12, w: C.name[1], h: 0.24, fontSize: 9.5, bold: true, color: CYAN, fontFace: MONO, margin: 0, valign: "top" });
    s.addText(c.display, { x: M + C.display[0], y: y + 0.12, w: C.display[1], h: 0.24, fontSize: 9.5, color: WHITE, fontFace: F, margin: 0, valign: "top" });
    s.addText(c.section, { x: M + C.section[0], y: y + 0.12, w: C.section[1], h: 0.24, fontSize: 9.5, color: c.section === "Collect" ? GREEN : BODY, fontFace: F, margin: 0, valign: "top" });
    s.addText(c.required ? "yes" : "no", { x: M + C.req[0], y: y + 0.12, w: C.req[1], h: 0.24, fontSize: 9.5, bold: c.required, color: c.required ? AMBER : MUTED, fontFace: F, margin: 0, valign: "top" });
    s.addText(c.defaultvalue === null || c.defaultvalue === undefined ? "—" : String(c.defaultvalue), {
      x: M + C.def[0], y: y + 0.11, w: C.def[1], h: 0.24, fontSize: 9, color: BODY, fontFace: MONO, margin: 0, valign: "top",
    });
    s.addText(
      (c.hidden ? "hidden on " + c.hidden.join(", ") : "visible") + (c.advanced ? " · advanced" : ""),
      { x: M + C.vis[0], y: y + 0.11, w: C.vis[1], h: 0.24, fontSize: 8.5, color: MUTED, fontFace: F, margin: 0, valign: "top" }
    );
  });
  s.addText(
    "Two collectors writing one dataset is legal and easy to miss: if you configure a second KOI instance with " +
    "Fetch events on, both write to the same dataset and the pack ships no field identifying which instance " +
    "produced a row (VERIFIED_FACTS §2).",
    { x: M, y: 2.06 + CFG.length * (rh + 0.05) + 0.12, w: W, h: 0.46, fontSize: 9.5, italic: true, color: AMBER, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" }
  );
  s.addNotes(
    "The whole Collect section is hidden on the xsoar marketplace, which is why a reader on XSOAR reports " +
    "\"there is no Fetch events checkbox\" — that is by design, not a broken install."
  );
}

/* ============================ 9. TEST 3 — governance reads ============================ */
testSlide(
  "Test 3",
  "Read sweep — policies, allowlist, blocklist",
  [
    "In the war room, run each of the three read commands:",
    [invoke("koi-policy-list", { limit: 5 }), "code"],
    [invoke("koi-allowlist-get"), "code"],
    [invoke("koi-blocklist-get"), "code"],
    "For each, open the context panel and check the prefix it wrote.",
    "Record the policy id and enabled state of one policy — test 8 needs it.",
    `Note: ${"koi-allowlist-get"} and ${"koi-blocklist-get"} take no arguments at all.`,
  ],
  [
    `koi-policy-list writes ${prefixOf("koi-policy-list")}.* (${outCount("koi-policy-list")} declared fields).`,
    `koi-allowlist-get writes ${prefixOf("koi-allowlist-get")}.* (${outCount("koi-allowlist-get")} fields).`,
    `koi-blocklist-get writes ${prefixOf("koi-blocklist-get")}.* (${outCount("koi-blocklist-get")} fields).`,
    "A human-readable table for each, even when the list is empty.",
    "No command in this test changes anything in KOI.",
  ],
  "Empty allowlist and blocklist are NORMAL — on KOI_PAET both were empty; on KOI_PLTS they held 5 and 17 " +
  "entries (VERIFIED_FACTS §7). Do not judge these two by a total: their API responses carry only an " +
  "items array and no total_count field at all, unlike policies and inventory (VERIFIED_FACTS §5.4). A guide " +
  "that tells you to read total_count here is telling you to read a field that never exists."
).addNotes(
  "Underlying endpoints (VERIFIED_FACTS §4.1): GET /api/external/v2/policies, GET /policies/allowlist, " +
  "GET /policies/blocklist, all on base https://api.prod.koi.security. Only the allowlist and blocklist " +
  "responses lack total_count."
);

/* ============================ 10. TEST 4 — inventory reads ============================ */
testSlide(
  "Test 4",
  "Read sweep — inventory, item, endpoints",
  [
    "List a small page of inventory:",
    [invoke("koi-inventory-list", { limit: 5 }), "code"],
    "Copy item_id, marketplace and version from one row.",
    "Fetch that item — all three arguments are required:",
    [invoke("koi-inventory-item-get"), "code"],
    "List the endpoints that have it installed:",
    [invoke("koi-inventory-item-endpoints-list", { limit: 5 }), "code"],
    "Then narrow the list with a filter argument:",
    [invoke("koi-inventory-list", { risk_level: "high", limit: 5 }), "code"],
  ],
  [
    `koi-inventory-list and koi-inventory-item-get both write ${prefixOf("koi-inventory-list")}.* — ${outCount("koi-inventory-list")} declared fields each, identical paths.`,
    `koi-inventory-item-endpoints-list writes ${prefixOf("koi-inventory-item-endpoints-list")}.* — ${outCount("koi-inventory-item-endpoints-list")} nested fields, no path in common with the other two.`,
    "Endpoints are reachable ONLY from an item. There is no device-centric command and no Koi.Device.* prefix — though koi-inventory-list does take device_id.",
    `The risk_level DROPDOWN offers ${predefined("koi-inventory-list", "risk_level").join(", ")} — that is the YAML's list, not a measured API contract (test 7 shows one that was incomplete).`,
  ],
  "Three commands collide on Koi.Inventory.*: koi-inventory-list, koi-inventory-item-get and koi-inventory-search " +
  "(test 5). Running any two back to back overwrites context — read it after each one, not at the end. " +
  "koi-inventory-item-endpoints-list is NOT one of them. An item that lists zero endpoints WOULD be a valid result — " +
  "KOI knows the item but nothing in scope currently has it installed. That is a case to be ready for, not one seen " +
  "here: the one item probed on each instance returned an endpoint. A wrong item_id / marketplace / version triple " +
  "is an error, not an empty list."
).addNotes(
  `koi-inventory-list carries ${argsOf("koi-inventory-list").length} arguments — the largest surface in the pack. ` +
  `Its filter arguments are: ${argNames("koi-inventory-list").filter((a) => !["page", "page_size", "limit", "sort_by", "sort_direction"].includes(a)).join(", ")}.`
);

/* ============================ 11. TEST 5 — inventory search ============================ */
{
  const filt = '{"combinator":"and","rules":[{"field":"risk_level","operator":"=","value":"high"}]}';
  testSlide(
    "Test 5",
    "Advanced search needs a structured filter",
    [
      "Run the search with an explicit query-builder filter:",
      [`!koi-inventory-search filter_json=${filt}`, "code"],
      "Record its total_count, then run the nearest plain-argument form:",
      [invoke("koi-inventory-list", { risk_level: "high", limit: 5 }), "code"],
      "Run it with NO filter argument, then again with a malformed one:",
      ["!koi-inventory-search", "code"],
      ["!koi-inventory-search filter_json={}", "code"],
      "Optionally supply the filter as a war-room JSON file instead:",
      [invoke("koi-inventory-search", { filter_raw_json_entry_id: "<entry id>" }), "code"],
    ],
    [
      `The filtered search writes ${prefixOf("koi-inventory-search")}.* (${outCount("koi-inventory-search")} fields).`,
      "Both return a count. Whether they agree was never measured — record both, assert nothing.",
      "No filter argument: the INTEGRATION refuses before any API call — \"Either 'filter_json' or 'filter_raw_json_entry_id' must be provided.\"",
      "filter_json={}: HTTP 400, and the body names the bad keys (filter.combinator, filter.rules).",
      "YAML documents filter_raw_json_entry_id as taking priority over filter_json — never exercised; verify it.",
    ],
    "Three distinct failures — do not conflate them (VERIFIED_FACTS §5.3). No filter argument: the integration " +
    "stops it, no API call happens — that one is read from Koi.py, not reproduced. Malformed " +
    "filter: HTTP 400 whose body names the problem (\"filter.combinator must be one of the following values: and, " +
    "or\", \"filter.rules must be an array\") — observed on both instances, not bare or unexplained. HTTP 500 is " +
    "reachable only by calling the API directly with the filter key omitted, never through the command. Zero " +
    "results from a valid filter is a correct answer."
  ).addNotes(
    "The exact filter on the slide was sent to the API on 20 July 2026 and returned total_count 145 on KOI_PAET " +
    "and 75 on KOI_PLTS (VERIFIED_FACTS §5.3, evidence/followup-probes.json). Each is a single reading on a named " +
    "instance, and KOI_PLTS was separately seen to grow between sweeps — the point is that the filter parses and " +
    "the response carries a total_count, not the value. " +
    "Step 2 is deliberately not a pass/fail: no comparison between " +
    "koi-inventory-search with a risk_level=high filter and koi-inventory-list risk_level=high was ever run, so " +
    "the reader is establishing that relationship for the first time and must not be told what to expect. The " +
    "priority of filter_raw_json_entry_id over filter_json is likewise a YAML argument description only."
  );
}

/* ============================ 12. TEST 6 — koi-get-events ============================ */
testSlide(
  "Test 6",
  "koi-get-events — debugging only, push disabled",
  [
    "Run it with a small limit and pushing explicitly off:",
    [invoke("koi-get-events", { limit: 5, should_push_events: "false" }), "code"],
    "Read the returned table and the context it writes.",
    "Optionally scope it to one type and a time window:",
    [invoke("koi-get-events", { event_type: "Alerts", start_time: '"3 days ago"', should_push_events: "false" }), "code"],
    "Do NOT leave should_push_events=true in any repeated or scheduled use.",
  ],
  [
    `Writes ${prefixOf("koi-get-events")}.* — note the upper-case prefix, it differs from every other command.`,
    `event_type accepts ${predefined("koi-get-events", "event_type").join(" and ")}; the default is ${defaultOf("koi-get-events", "event_type")}.`,
    `should_push_events defaults to ${defaultOf("koi-get-events", "should_push_events")}, which is what you want here.`,
    "Events appear in the war room without being written to the dataset.",
  ],
  "The pack's own description calls this command development-and-debugging only: it may produce duplicate events, " +
  "exceed API rate limits, or disrupt the fetch mechanism. So unlike tests 3, 4, 5 and 7 it is NOT safe to repeat " +
  "freely — run it once, deliberately, with should_push_events=false; setting it true writes events into " +
  "koi_koi_raw. Use it to prove the API returns events — never as a substitute for the collector in test 9. " +
  "Returning no events for a narrow window on a quiet tenant is correct."
).addNotes(
  "Description quoted from the pack JSON. The upper-case KOI.Event prefix against Koi.* everywhere else is a " +
  "genuine inconsistency in both packs — preserve it, DT paths are case-sensitive."
);

/* ============================ 13. TEST 7 — mcp_servers view ============================ */
{
  const yamlViews = predefined("koi-inventory-list", "view");
  const apiViews = ["agentic_ai", "ai_models", "all_items", "code_packages", "extensions", "mcp_servers", "os_packages", "repositories", "software"];
  const missing = apiViews.filter((v) => !yamlViews.includes(v));
  const s = testSlide(
    "Test 7  ·  known defect",
    "The mcp_servers view works but is not in the dropdown",
    [
      "Open the view argument's dropdown on koi-inventory-list.",
      `Count the offered values — there are ${yamlViews.length}:`,
      [yamlViews.join(", "), "code"],
      "Now type the value by hand instead of picking it:",
      [invoke("koi-inventory-list", { view: "mcp_servers", limit: 5 }), "code"],
      "Repeat for the other two values the dropdown omits:",
      [`view=${missing.filter((v) => v !== "mcp_servers").join("   view=")}`, "code"],
      "Finally, confirm the shipped example value is broken:",
      ["!koi-inventory-list view=browser_extensions", "code"],
    ],
    [
      `The dropdown offers ${yamlViews.length} values; the API accepts ${apiViews.length}.`,
      `Missing from the dropdown but accepted: ${missing.join(", ")}.`,
      "All 12 were probed on BOTH instances (§5.1): mcp_servers and repositories return 200 and a non-zero count.",
      "all_items is ACCEPTED (200) but returned total_count 0 on BOTH tenants — a zero, not a rejection.",
      "browser_extensions returns 400, as do ide_extensions and packages — all three are in neither list.",
    ],
    "Both halves of this test are expected results, not failures. The YAML's predefined list is incomplete, not " +
    "wrong: nothing it offers is invalid. An empty result for view=mcp_servers means your estate has no MCP " +
    "servers in scope; view=all_items returned zero rows on both tenants probed even though the API accepted it, " +
    "so prefer omitting view entirely — that returned the whole inventory: 3,447 on KOI_PAET, 5,644 then 5,646 " +
    "hours later on KOI_PLTS. Only KOI_PLTS moved between the two sweeps; name the instance whenever you quote a " +
    "count, and read either as scale, never as a target (§5.1, §7). Only a 400 — a rejected value — is a failure."
  );
  s.addNotes(
    "The API states its own contract in the 400 body: \"view must be one of the following values: " +
    apiViews.join(", ") + "\" (VERIFIED_FACTS §5.1). All twelve values were probed individually on BOTH " +
    "instances, KOI_PAET / KOI_PLTS: agentic_ai 226 / 1,342, ai_models 3 / 28, code_packages 2,315 / 2,572, " +
    "extensions 180 / 417, os_packages 350 / 393, software 406 / 1,044 (KOI_PLTS 1,046 in a later sweep), " +
    "mcp_servers 21 / 42, repositories 15 / 77, " +
    "all_items 200 but total_count 0 / 0, and browser_extensions / ide_extensions / packages 400 on both. Omitting " +
    "view entirely returned 3,447 / 5,644 (KOI_PLTS 5,646 in the later sweep; KOI_PAET returned 3,447 in both). " +
    "Only KOI_PLTS moved, and only BETWEEN runs — probing twice inside one run gave identical values every time " +
    "(evidence/followup-probes.json). That is real inventory growth on one tenant, not API instability " +
    "(VERIFIED_FACTS §7) — so quote every figure with its instance, as scale, never as an expected result. " +
    "Only browser_extensions appears " +
    "in the pack's shipped command_examples.txt (VERIFIED_FACTS §5.2), so that is the one a reader hits by " +
    "copying the example; the other two are values they might guess."
  );
}

/* ============================ 14. TEST 8 — state-changing protocol ============================ */
{
  const s = newSlide();
  heading(s, "Test 8  ·  state-changing", "The five commands that write to KOI — controlled protocol");
  s.addText(
    "Do not fire these blind. Each one changes governance state in KOI, not in Cortex, so an undo is your " +
    "responsibility. Four of them declare no outputs at all, which means the war-room message is your only " +
    "record of what happened.",
    { x: M, y: 1.36, w: 11.6, h: 0.58, fontSize: 11.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" }
  );

  /* left: the five commands (generated), and how to read their result */
  const lw = 5.35;
  card(s, M, 1.92, lw, 3.55, CARD_HI);
  s.addText("The five, from the pack JSON", { x: M + 0.3, y: 2.10, w: lw - 0.6, h: 0.26, fontSize: 11.5, bold: true, color: RED, fontFace: F, margin: 0, valign: "top" });
  MUTATING.forEach((n, i) => {
    const y = 2.46 + i * 0.38;
    s.addText(n, { x: M + 0.3, y, w: 3.5, h: 0.26, fontSize: 10, bold: true, color: AMBER, fontFace: MONO, margin: 0, valign: "top" });
    s.addText(
      (CMD[n].execution ? "execution · " : "") + `${outCount(n)} outputs`,
      { x: M + 3.85, y, w: 1.4, h: 0.26, fontSize: 9.5, color: CMD[n].execution ? RED : MUTED, fontFace: F, margin: 0, valign: "top" }
    );
  });
  s.addText("Real failure vs empty-but-correct", {
    x: M + 0.3, y: 4.36, w: lw - 0.6, h: 0.24, fontSize: 10, bold: true, color: AMBER, fontFace: F, charSpacing: 1, margin: 0, valign: "top",
  });
  s.addText(
    "The four add/remove commands declare zero outputs, so success is a war-room message and nothing else — " +
    "an empty context is CORRECT. The only proof either way is a follow-up -get. Note too that only the two " +
    "removes carry execution: true — the two adds and the policy toggle mutate governance state with no flag " +
    "at all, so \"not flagged\" is not \"safe\".",
    { x: M + 0.3, y: 4.62, w: lw - 0.6, h: 0.80, fontSize: 9.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 11, valign: "top" }
  );

  /* right: the protocol */
  const rx = M + lw + 0.4, rw = W - lw - 0.4;
  card(s, rx, 1.92, rw, 3.55);
  s.addText("Protocol — record, change, verify, reverse  ·  BLOCKLIST pair only", { x: rx + 0.3, y: 2.10, w: rw - 0.6, h: 0.26, fontSize: 11.5, bold: true, color: GREEN, fontFace: F, margin: 0, valign: "top" });
  rowList(s, [
    "Pick a DISPOSABLE test item you are willing to have on a governance list.",
    "Record the before state — run koi-blocklist-get and export the result.",
    ["!koi-blocklist-items-add item_id=<id> marketplace=<mp> notes=\"test\"", "code"],
    "Re-run koi-blocklist-get: the item now appears.",
    ["!koi-blocklist-items-remove item_id=<id> marketplace=<mp>", "code"],
    "Re-run koi-blocklist-get a third time — it matches the before state.",
  ], rx + 0.3, 2.46, rw - 0.6, "num");

  /* policy toggle */
  card(s, M, 5.57, W, 1.32, CARD_HI);
  s.addText("koi-policy-status-update — the same discipline, plus one difference", {
    x: M + 0.3, y: 5.71, w: W - 0.6, h: 0.26, fontSize: 11, bold: true, color: AMBER, fontFace: F, margin: 0, valign: "top",
  });
  s.addText(
    `Both arguments are required (${requiredArgs("koi-policy-status-update").join(", ")}; enabled accepts ` +
    `${predefined("koi-policy-status-update", "enabled").join(" / ")}). Unlike the four list writes it DOES return ` +
    `context — ${outCount("koi-policy-status-update")} fields under ${prefixOf("koi-policy-status-update")}.*, the same paths koi-policy-list writes, ` +
    "so the toggle overwrites the list you captured in test 3. Take a policy's enabled value from test 3, flip it, " +
    "verify with koi-policy-list, then flip it back and verify again. Never toggle a policy that is actively " +
    "enforcing on a production estate. None of these five commands was run while preparing this guide " +
    "(VERIFIED_FACTS §1.1) — treat this slide as a protocol to follow, not as observed behaviour, and do not " +
    "assume a repeated add or a redundant remove is a harmless no-op until you have seen it.",
    { x: M + 0.3, y: 5.99, w: W - 0.6, h: 0.82, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  s.addNotes(
    "The blocklist pair is used in the example because a disposable blocklist entry is easier to reason about than " +
    "an allowlist entry, which loosens policy while it exists. Be explicit that this means koi-allowlist-items-add " +
    "and koi-allowlist-items-remove are exercised by NO test in this guide — the command reference marks them " +
    "\"not exercised\" and the sign-off slide says the same. The protocol transfers to them unchanged, because the " +
    "allowlist pair takes identical arguments, but running it is the reader's decision and their evidence. " +
    `Both remove commands carry execution: true. marketplace is a closed list of ${predefined("koi-blocklist-items-add", "marketplace").length} values ` +
    "and must match the item's own marketplace exactly. Bulk mode via items_list_raw_json_entry_id is deliberately " +
    "out of scope for an acceptance test."
  );
}

/* ============================ 15. TEST 9 — event collection ============================ */
testSlide(
  "Test 9",
  "Event collection lands in koi_koi_raw",
  [
    "Confirm Fetch events is enabled and save — XSIAM / platform only.",
    "Wait for at least two fetch cycles (default interval: 1 minute).",
    "Run the count query in XQL:",
    ["dataset = koi_koi_raw", "code"],
    ["| comp count() as events by source_log_type", "code"],
    "Note the numbers, wait one more cycle, and run it again.",
    "Confirm the vendor and product tags:",
    ["dataset = koi_koi_raw", "code"],
    ["| comp count() as n by _vendor, _product", "code"],
  ],
  [
    "The dataset koi_koi_raw exists and returns rows.",
    "One row per source_log_type — Alerts and Audit.",
    "Counts increase between the two runs when KOI has new activity.",
    "_vendor = koi and _product = koi.",
  ],
  "The dataset name is not declared anywhere in the pack — it follows the {vendor}_{product}_raw convention and " +
  "was confirmed on a live tenant (VERIFIED_FACTS §3). This test applies on XSIAM / platform only: the YAML sets " +
  "isfetchevents true then overrides it with isfetchevents:xsoar false, so on XSOAR there is no collector to test. " +
  "\"Dataset not found\" means no event has EVER arrived: check Fetch events, the marketplace the pack was " +
  "installed for, and the instance's egress. Flat counts on an idle tenant are correct, not a fault."
).addNotes(
  "Reference measurement (VERIFIED_FACTS §3, tenant api-ayman.xdr.eu.paloaltonetworks.com, 30-day window " +
  "20 June - 20 July 2026): 20,156 events across 80 distinct hostnames, split 19,842 Audit / 314 Alerts. " +
  "Your numbers will differ; the shape is what you are checking."
);

/* ============================ 16. TEST 10 — schema split and XDM ============================ */
testSlide(
  "Test 10",
  "Alerts vs Audit — and why XDM is empty",
  [
    "Separate the two schemas — source_log_type is the discriminator:",
    ["dataset = koi_koi_raw | filter source_log_type = \"Audit\"", "code"],
    ["| comp count() as n by type, category", "code"],
    ["dataset = koi_koi_raw | filter source_log_type = \"Alerts\"", "code"],
    ["| fields _time, class_uid, type_uid, severity_id, status_id", "code"],
    "Now check the data model — expect nothing:",
    ["dataset = koi_koi_raw | fields xdm.*", "code"],
    "And confirm the alert_type trap:",
    ["dataset = koi_koi_raw | filter alert_type != null | comp count()", "code"],
  ],
  [
    "Audit rows are flat and KOI-native: type, action, category, object_name, object_type, hostname, item_version.",
    "Alert rows are OCSF: class_uid 2007, type_uid 200701, is_alert true, plus severity_id / confidence_id / risk_level_id / status_id.",
    "Every xdm.* field is EMPTY. This is correct — the pack ships no parsing rule and no modeling rule.",
    "alert_type returns zero rows. It is never populated.",
  ],
  "Empty XDM is the expected result here, not a failure — there is nothing in this pack to populate it, so do not " +
  "raise a bug and do not build queries on xdm.*. Two more traps: on alert rows, resources, observables and " +
  "metadata are JSON STRINGS and must be json_extract-ed before you can filter on them — a query that treats them " +
  "as structured fields silently returns nothing rather than erroring; and Audit fields are null on Alert rows and " +
  "vice versa, so always filter by source_log_type first."
).addNotes(
  "Observed Audit type values and counts over 30 days (VERIFIED_FACTS §3.1): extensions 16,579, devices 2,971, " +
  "remediation 244, policies 32, approval_requests 8, guardrails 6, notifications 2; category system 16,825, " +
  "user 3,017. Any playbook or query keyed on alert_type — as the custom pack's triage is — matches nothing here."
);

/* ============================ 17. Empty vs failure summary ============================ */
{
  const s = newSlide();
  heading(s, "Judging results", "Empty-but-correct, or a real failure?");
  s.addText(
    "Most false alarms on this pack come from reading an empty-but-valid result as a fault. One row per test.",
    { x: M, y: 1.36, w: W, h: 0.3, fontSize: 11.5, color: BODY, fontFace: F, margin: 0, valign: "top" }
  );
  const hy = 1.78;
  /* The failure column carries the longest strings, so it gets the widest slot: at 3.6in
     the total_count row wrapped and its second line fell out of the bottom of its card. */
  const C = { n: [0.28, 0.50], saw: [0.90, 2.50], ok: [3.50, 3.60], bad: [7.25, 4.85] };
  s.addText("Test", { x: M + C.n[0], y: hy, w: C.n[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("What you might see", { x: M + C.saw[0], y: hy, w: C.saw[1], h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Empty but correct when…", { x: M + C.ok[0], y: hy, w: C.ok[1], h: 0.26, fontSize: 10, bold: true, color: GREEN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("A real failure when…", { x: M + C.bad[0], y: hy, w: C.bad[1], h: 0.26, fontSize: 10, bold: true, color: RED, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  const rows = [
    ["1", "Fewer than 13 commands", "never — this test is pass/fail", "any count other than 13, or version ≠ " + PACK_VER],
    ["2", "Test button green, command errors", "n/a — always follow Test with a read", "401 {\"message\":\"Unauthorized\"} = the key (verified). Any other status: diagnose it, do not assume egress"],
    ["3", "Allowlist or blocklist has no rows", "the tenant has no entries; both were empty on KOI_PAET", "an HTTP error, or you were told to read total_count (it does not exist here)"],
    ["4", "An item lists zero endpoints", "the item is not currently installed in scope", "wrong item_id / marketplace / version triple"],
    ["5", "koi-inventory-search returns nothing", "the filter is valid and matches nothing", "HTTP 400 naming filter.combinator / filter.rules — the shape, not the data"],
    ["6", "koi-get-events returns no events", "quiet tenant or narrow window", "auth or rate-limit error"],
    ["7", "view=mcp_servers returns no items", "no MCP servers in your estate", "HTTP 400 — the value was rejected"],
    ["8", "add / remove writes no context", "always — all four declare zero outputs (test 8 runs the blocklist pair)", "the follow-up -get does not reflect the change"],
    ["9", "Counts do not grow between cycles", "no new KOI activity in the window", "\"dataset not found\" — nothing has ever arrived"],
    ["10", "xdm.* is entirely empty", "always — no modeling rules ship with this pack", "raw fields empty too, on rows that exist"],
  ];
  const rh = 0.42;
  rows.forEach(([n, saw, ok, bad], i) => {
    const y = 2.06 + i * (rh + 0.045);
    card(s, M, y, W, rh, i % 2 ? CARD_HI : CARD);
    s.addText(n, { x: M + C.n[0], y: y + 0.11, w: C.n[1], h: 0.24, fontSize: 10, bold: true, color: ORANGE, fontFace: F, margin: 0, valign: "top" });
    s.addText(saw, { x: M + C.saw[0], y: y + 0.11, w: C.saw[1], h: 0.3, fontSize: 9, color: WHITE, fontFace: F, margin: 0, lineSpacing: 11, valign: "top" });
    s.addText(ok, { x: M + C.ok[0], y: y + 0.11, w: C.ok[1], h: 0.3, fontSize: 9, color: GREEN, fontFace: F, margin: 0, lineSpacing: 11, valign: "top" });
    s.addText(bad, { x: M + C.bad[0], y: y + 0.11, w: C.bad[1], h: 0.3, fontSize: 9, color: AMBER, fontFace: F, margin: 0, lineSpacing: 11, valign: "top" });
  });
  s.addNotes(
    "Two instances checked on 20 July 2026 held very different volumes — inventory items 3,447 on KOI_PAET vs " +
    "5,644 on KOI_PLTS (5,646 in a later sweep the same day); policies 32 vs 28; allowlist entries 0 vs 5; " +
    "blocklist entries 0 vs 17 (VERIFIED_FACTS §7). Only KOI_PLTS moved between the two sweeps — KOI_PAET returned " +
    "3,447 both times — and only between runs, never within one. Always name the instance when you quote a count, " +
    "and never treat a row count, from another tenant or from this guide, as an expected value."
  );
}

/* ============================ 18. Reference values ============================ */
{
  const s = newSlide();
  heading(s, "Reference values", "Measured on real tenants — for shape, not as targets");
  s.addText(
    "Recorded 20 July 2026 on tenant api-ayman.xdr.eu.paloaltonetworks.com, instances KOI_PAET and KOI_PLTS " +
    "(VERIFIED_FACTS §7). These are not pass/fail thresholds, and no test here passes by matching a number. " +
    "Counts drift per tenant and between runs: where two sweeps hours apart differed — only KOI_PLTS did — both " +
    "are shown, earlier then later. Quote the instance whenever you quote a count.",
    { x: M, y: 1.36, w: 11.6, h: 0.64, fontSize: 11.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" }
  );
  const hy = 2.06;
  s.addText("Measure", { x: M + 0.3, y: hy, w: 5.2, h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("KOI_PAET", { x: M + 5.7, y: hy, w: 2.0, h: 0.26, fontSize: 10, bold: true, color: CYAN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("KOI_PLTS", { x: M + 7.9, y: hy, w: 2.0, h: 0.26, fontSize: 10, bold: true, color: CYAN, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Which test", { x: M + 10.0, y: hy, w: 2.0, h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  const rows = [
    ["Inventory items", "3,447", "5,644 then 5,646", "4"],
    ["Policies", "32", "28", "3"],
    ["Allowlist entries", "0 — empty", "5", "3"],
    ["Blocklist entries", "0 — empty", "17", "3, 8"],
    ["view=mcp_servers", "21", "42", "7"],
    ["view=software", "406", "1,044 then 1,046", "7"],
    ["Alerts available via API", "296", "48,526", "6"],
    ["Audit records available via API", "8,789", "96,196", "6"],
    ["filter risk_level = high (search)", "145", "75", "5"],
  ];
  const rh = 0.36;
  rows.forEach(([k, a, b, t], i) => {
    const y = 2.32 + i * (rh + 0.045);
    card(s, M, y, W, rh, i % 2 ? CARD_HI : CARD);
    s.addText(k, { x: M + 0.3, y: y + 0.11, w: 5.2, h: 0.26, fontSize: 10, color: WHITE, fontFace: F, margin: 0, valign: "top" });
    s.addText(a, { x: M + 5.7, y: y + 0.11, w: 2.0, h: 0.26, fontSize: 10, color: BODY, fontFace: MONO, margin: 0, valign: "top" });
    s.addText(b, { x: M + 7.9, y: y + 0.11, w: 2.0, h: 0.26, fontSize: 10, color: BODY, fontFace: MONO, margin: 0, valign: "top" });
    s.addText(t, { x: M + 10.0, y: y + 0.11, w: 2.0, h: 0.26, fontSize: 10, color: MUTED, fontFace: F, margin: 0, valign: "top" });
  });
  card(s, M, 6.00, W, 0.92, CARD_HI);
  chip(s, M + 0.28, 6.24, "!", AMBER, 0.34);
  s.addText(
    "Scope of the evidence: measured against the KOI API directly, with the same bearer auth and API keys the two " +
    "instances use. Only 8 of the 13 commands had their API exercised — the 5 state-changing ones were " +
    "deliberately not run (VERIFIED_FACTS §1.1) — and none of the 13 was executed through XSIAM on that tenant " +
    "(§6), so context mapping and human-readable output on these slides are asserted from the pack YAML, not " +
    "observed. Running this guide from a war room is exactly what closes that gap.",
    { x: M + 0.82, y: 6.10, w: W - 1.2, h: 0.74, fontSize: 10, color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" }
  );
  s.addNotes(
    "Be honest about this in front of a customer. What is verified: the endpoints, the parameters they accept or " +
    "reject, and the response shapes, for the 8 read commands. What is not: the 5 state-changing commands, which " +
    "were never run, and the integration's mapping of any response into context, which is a YAML assertion. " +
    "The risk_level=high row is the query-builder filter on this deck's test 5 slide, sent to /inventory/search on " +
    "both instances (evidence/followup-probes.json). Two KOI_PLTS rows carry two readings hours apart on the same " +
    "day; KOI_PAET did not move on either — it returned 3,447 in both sweeps. So drift here is per tenant and " +
    "between runs, real inventory growth rather than API instability (VERIFIED_FACTS §7). The allowlist row cites " +
    "test 3 only: test 8 works the blocklist pair, so nothing in this guide exercises the allowlist writes. " +
    "Present the whole table as scale."
  );
}

/* ============================ 19. Tests that do NOT apply ============================ */
{
  const s = newSlide();
  heading(s, "Out of scope", "Tests that do NOT apply to this pack, and why");
  s.addText(
    "These exist in the custom pack's test guide. Every one of them depends on something this pack does not " +
    "contain. Do not run them, and do not report them as failures.",
    { x: M, y: 1.36, w: 11.6, h: 0.56, fontSize: 11.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" }
  );
  const hy = 2.02;
  s.addText("Dropped test", { x: M + 0.3, y: hy, w: 3.6, h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  s.addText("Why it cannot run here", { x: M + 4.1, y: hy, w: 8.0, h: 0.26, fontSize: 10, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0, valign: "top" });
  const rows = [
    ["Alert triage, end to end", "The pack ships no playbooks at all — and triage needs koi-koidex-risk-report, which does not exist here."],
    ["Item investigation", "Needs koi-approval-requests-list, koi-koidex-risk-report and koi-remediations-list — none exist."],
    ["Device investigation", "Needs koi-device-inventory-get and koi-remediations-list. No device-centric command and no Koi.Device.* — but koi-inventory-list takes device_id."],
    ["Gated response / approval", "Needs the response playbook. The blocklist write here is a bare command with no approval step around it."],
    ["Dashboard and data model", "No dashboard ships, and no modeling rules — every xdm.* field stays empty (test 10)."],
    ["Collector cursor inspection", "Needs koi-fetch-context-get / -set. Fetch state cannot be inspected from a command."],
    ["Egress probe via user listing", "Needs koi-users-list. Use koi-policy-list limit=1 as the probe instead (test 2)."],
  ];
  const rh = 0.50;
  rows.forEach(([k, why], i) => {
    const y = 2.36 + i * (rh + 0.09);
    card(s, M, y, W, rh);
    s.addText(k, { x: M + 0.3, y: y + 0.13, w: 3.6, h: 0.28, fontSize: 10.5, bold: true, color: WHITE, fontFace: F, margin: 0, valign: "top" });
    s.addText(why, { x: M + 4.1, y: y + 0.13, w: 8.0, h: 0.28, fontSize: 10, color: BODY, fontFace: F, margin: 0, valign: "top" });
  });
  card(s, M, 6.52, W, 0.46, CARD_HI);
  s.addText(
    "The 13 commands that do NOT exist in this pack:  koi-devices-list · koi-device-inventory-get · " +
    "koi-koidex-risk-report · koi-koidex-search · koi-remediations-list · koi-approval-requests-list · " +
    "koi-findings-list · koi-users-list · koi-groups-list · koi-runtime-policies-list · koi-runtime-policy-get · " +
    "koi-fetch-context-get · koi-fetch-context-set",
    { x: M + 0.28, y: 6.60, w: W - 0.56, h: 0.34, fontSize: 9, color: RED, fontFace: F, margin: 0, lineSpacing: 11, valign: "top" }
  );
  s.addNotes(
    "The custom pack has 26 commands; this pack's 13 are a strict subset. There is no Koi.Device.* context prefix " +
    "here at all — endpoints are reached only from an item, via Koi.Inventory.Endpoint.*. The model is item-centric, " +
    "not device-centric, and that inversion is why the device tests cannot simply be rewritten."
  );
}

/* ============================ 20. Script Runner — additional content ============================ */
{
  const s = newSlide();
  heading(s, "Additional content", "Script Runner playbooks — portable, but not in this pack");
  card(s, M, 1.50, W, 0.86, CARD_HI);
  chip(s, M + 0.28, 1.72, "!", AMBER, 0.34);
  s.addText(
    `NOT PART OF THE MARKETPLACE KOI PACK v${PACK_VER}. This pack ships an integration and nothing else — no ` +
    "playbooks. The three playbooks below come from the separate custom pack. If you deploy them you are adding " +
    "content, and you must say so on any test report.",
    { x: M + 0.82, y: 1.60, w: W - 1.2, h: 0.68, fontSize: 10.5, color: AMBER, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  s.addText(
    "They are worth knowing about because they are the one workflow that transfers unchanged: they call no koi-* " +
    "command at all, only Cortex-native ones. Nothing in them depends on which KOI pack is installed — or on any " +
    "KOI pack being installed.",
    { x: M, y: 2.52, w: 11.6, h: 0.56, fontSize: 11.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" }
  );
  const items = [
    ["Koi Unified - Script Runner", "The Job entry point"],
    ["Koi Unified - Process Config Entry", "Handles one configuration entry"],
    ["Koi Unified - Execute Endpoint Script", "Dispatches the script to endpoints"],
  ];
  const cw = (W - 0.6) / 3;
  items.forEach(([n, d], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 3.20, cw, 1.05);
    s.addText(n, { x: x + 0.26, y: 3.40, w: cw - 0.52, h: 0.3, fontSize: 11.5, bold: true, color: CYAN, fontFace: F, margin: 0, valign: "top" });
    s.addText(d, { x: x + 0.26, y: 3.72, w: cw - 0.52, h: 0.3, fontSize: 10, color: BODY, fontFace: F, margin: 0, valign: "top" });
  });
  /* The claim that has to stay exact: they invoke no KOI command. They are NOT command-free —
     besides the three core-* ones they use several common automations and a builtin. Saying
     "the only commands they invoke are core-get-scripts / -endpoints / -script-run" is false. */
  card(s, M, 4.44, W, 1.34);
  s.addText("The only KOI commands they invoke:  none", { x: M + 0.3, y: 4.60, w: 5.0, h: 0.26, fontSize: 11, bold: true, color: GREEN, fontFace: F, margin: 0, valign: "top" });
  s.addText("core-get-scripts        core-get-endpoints        core-script-run", {
    x: M + 0.3, y: 4.92, w: W - 0.6, h: 0.34, fontSize: 12, color: CYAN, fontFace: MONO, margin: 0, valign: "top",
  });
  s.addText(
    "Those three are Cortex-native — but the playbooks are not command-free: they also use Print, PrintErrorEntry, " +
    "SetAndHandleEmpty, DeleteContext, GetErrorsFromEntry and the builtin closeInvestigation. None of it touches " +
    "KOI: no KOI API key, no KOI integration instance, no koi-* command.",
    { x: M + 0.3, y: 5.32, w: W - 0.6, h: 0.40, fontSize: 10, italic: true, color: MUTED, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" }
  );
  card(s, M, 5.86, W, 1.10, CARD_HI);
  s.addText("If you test them, test them separately", { x: M + 0.3, y: 5.96, w: 5.0, h: 0.26, fontSize: 11, bold: true, color: GREEN, fontFace: F, margin: 0, valign: "top" });
  s.addText(
    "Import the three playbooks and their JSON configuration List by hand, attach the entry-point playbook to a " +
    "time-triggered Job, and record the result under a heading that names them as additional content. Their " +
    "prerequisites are Cortex agents and a script package in the Scripts Library — not anything from KOI. " +
    "Keep the result out of the pack's own pass/fail matrix: a Script Runner failure says nothing about the " +
    `Marketplace KOI pack v${PACK_VER}, and a Script Runner pass proves nothing about it either.`,
    { x: M + 0.3, y: 6.24, w: W - 0.6, h: 0.66, fontSize: 10, color: BODY, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  s.addNotes(
    "Verified by parsing the custom pack's playbook YAML (VERIFIED_FACTS §7a): the three Koi Unified playbooks " +
    "contain no koi-* string at all. Do not overstate it as \"the only commands they invoke are the three core-* " +
    "ones\" — only Execute Endpoint Script calls those three; the other two run common automations (Print, " +
    "PrintErrorEntry, SetAndHandleEmpty, DeleteContext, GetErrorsFromEntry) and Builtin closeInvestigation. " +
    "The correct sentence is \"the only KOI commands they invoke: none\". " +
    "Detail on their List schema and naming requirements is in the custom pack's own documentation — " +
    "it is deliberately not reproduced here, because reproducing it inside a Marketplace-pack guide is exactly " +
    "how the two packs get confused."
  );
}

/* ============================ 21. Sign-off ============================ */
{
  const s = newSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 11.4, y: -3.4, w: 4.8, h: 4.8,
    fill: { color: GREEN, transparency: 93 }, line: { color: GREEN, width: 1 },
  });
  heading(s, "Sign-off", "One line of evidence per test");
  const checks = [
    ["1", `Pack version reads ${PACK_VER} and exactly ${PACK.counts.commands} koi-* commands are registered`],
    ["2", "Test returns Success and koi-policy-list limit=1 returns without a 401"],
    ["3", `koi-policy-list / -allowlist-get / -blocklist-get write ${prefixOf("koi-policy-list")}.*, ${prefixOf("koi-allowlist-get")}.*, ${prefixOf("koi-blocklist-get")}.*`],
    ["4", `Inventory commands write ${prefixOf("koi-inventory-list")}.* and ${prefixOf("koi-inventory-item-endpoints-list")}.*`],
    ["5", "koi-inventory-search parses a query-builder filter; a malformed one 400s naming the bad key; no filter is refused by the integration"],
    ["6", `koi-get-events writes ${prefixOf("koi-get-events")}.* with should_push_events=false`],
    ["7", "view=mcp_servers returns 200 when typed by hand; view=browser_extensions 400s"],
    ["8", "Blocklist add appears and remove reverses it to the before state; a policy's enabled value flips and is put back"],
    ["9", "koi_koi_raw returns rows split by source_log_type, _vendor=koi, _product=koi"],
    ["10", "Audit and Alert schemas confirmed distinct; every xdm.* field empty, as expected"],
  ];
  const cw = (W - 0.4) / 2;
  checks.forEach(([n, t], i) => {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    const x = M + col * (cw + 0.4);
    const y = 1.62 + row * 0.80;
    card(s, x, y, cw, 0.68);
    chip(s, x + 0.22, y + 0.16, n, GREEN, 0.36);
    s.addText(t, { x: x + 0.76, y: y + 0.10, w: cw - 1.0, h: 0.52, fontSize: 10, color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top" });
  });
  card(s, M, 5.62, W, 0.74, CARD_HI);
  s.addText(
    `All ten green → the Marketplace KOI pack v${PACK_VER} is installed, configured, collecting, its ` +
    `${READONLY.length} non-mutating commands exercised, and 3 of its ${MUTATING.length} governance writes ` +
    `run in test 8 — the blocklist add-and-reverse pair, plus koi-policy-status-update flipped and put back. ` +
    `The other ${MUTATING.length - 3}, the allowlist pair, stay untested by these ten checks.`,
    { x: M + 0.3, y: 5.72, w: W - 0.6, h: 0.56, fontSize: 11.5, bold: true, italic: true, color: GREEN, fontFace: F, margin: 0, lineSpacing: 14, valign: "top" }
  );
  s.addText(
    "Record on the report: which pack and version, which tenant and instance, the date, and — for any count you " +
    "quote — the instance it was measured on. Two tenants running the same pack differ by more than an order of " +
    "magnitude in event volume, so a bare number means nothing without its tenant.",
    { x: M, y: 6.46, w: W, h: 0.56, fontSize: 10.5, color: MUTED, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  s.addNotes(
    "Tests 1 and 2 are gates. Test 8 is the only destructive one and should be re-run only when the governance " +
    "commands change. If the Script Runner playbooks were also tested, report them under a separate heading as " +
    "additional content."
  );
}

const out = path.join(__dirname, "KOI_Marketplace_Pack_Test_Guide.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("written", out));
