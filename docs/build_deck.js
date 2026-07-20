/* Build "KOI — Marketplace Content Pack, Overview" (.pptx)
 *
 * PACK UNDER DESCRIPTION: the OFFICIAL MARKETPLACE KOI pack from demisto/content
 * (Packs/Koi, currentVersion 1.2.3, 13 commands, integration only).
 * NOT the custom in-house pack (v1.3.0, 26 commands) checked out at ../KOI.
 *
 * Every command / argument / output / config claim in this deck is read at RUNTIME from
 * ../reference/marketplace-pack.json (derived mechanically from the pinned upstream YAML,
 * md5 5497cdddedeb0c0d7d0b371aa075a64c). Nothing about the command surface is hand-typed.
 * Live-tenant claims come from ../VERIFIED_FACTS.md and are tagged [LIVE] in the deck.
 *
 * Visual language reused from the custom pack's docs/build_deck.js. Content is NOT reused.
 *
 * Run:  NODE_PATH=<dir with pptxgenjs> node docs/build_deck.js
 * Idempotent: no timestamps, no randomness — two runs produce the same deck.
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

/* ============================================================================
   0. LOAD THE AUTHORITY
   ========================================================================== */
const PACK = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "reference", "marketplace-pack.json"), "utf8")
);

const assert = (cond, msg) => {
  if (!cond) {
    console.error("ASSERTION FAILED: " + msg);
    process.exit(1);
  }
};

const CMDS = PACK.commands;
const CFG = PACK.configuration;

/* --- derived counts (never transcribed) --- */
const nCommands = CMDS.length;
const nArgs = CMDS.reduce((a, c) => a + c.arguments.length, 0);
const nOutputDecls = CMDS.reduce((a, c) => a + c.outputs.length, 0);
const allPaths = CMDS.flatMap((c) => c.outputs.map((o) => o.contextPath));
const distinctPaths = [...new Set(allPaths)];
const nDistinctPaths = distinctPaths.length;

assert(nCommands === PACK.counts.commands, "command count disagrees with counts block");
assert(nArgs === PACK.counts.arguments, "argument count disagrees with counts block");
assert(nOutputDecls === PACK.counts.outputs, "output count disagrees with counts block");
assert(
  distinctPaths.every((p) => !/^Koi\.Device\./.test(p)),
  "a Koi.Device.* path appeared — this pack has none"
);

/* distinct paths per prefix, Endpoint counted separately */
const prefixCount = {};
distinctPaths.forEach((p) => {
  const k = p.startsWith("Koi.Inventory.Endpoint.")
    ? "Koi.Inventory.Endpoint"
    : p.split(".").slice(0, 2).join(".");
  prefixCount[k] = (prefixCount[k] || 0) + 1;
});

/* commands grouped by function, derived from the command names themselves */
const GROUP_DEFS = [
  { key: "events", label: "Events", test: (n) => /^koi-get-events$/.test(n) },
  { key: "policy", label: "Policy", test: (n) => /^koi-policy-/.test(n) },
  { key: "allowlist", label: "Allowlist", test: (n) => /^koi-allowlist-/.test(n) },
  { key: "blocklist", label: "Blocklist", test: (n) => /^koi-blocklist-/.test(n) },
  { key: "inventory", label: "Inventory", test: (n) => /^koi-inventory-/.test(n) },
];
const GROUPS = GROUP_DEFS.map((g) => ({
  ...g,
  cmds: CMDS.filter((c) => g.test(c.name)),
}));
assert(
  GROUPS.reduce((a, g) => a + g.cmds.length, 0) === nCommands,
  "grouping did not cover every command"
);

const execCmds = CMDS.filter((c) => c.execution).map((c) => c.name);
const noOutputCmds = CMDS.filter((c) => c.outputs.length === 0).map((c) => c.name);

/* --- read-only vs state-changing -----------------------------------------
   VERIFIED_FACTS §1.1: five commands change tenant state (PUT/POST/DELETE per
   the endpoint map in §4.1) and only two of them are flagged execution: true.
   Derived from the command names so it cannot drift, then asserted. */
const MUTATING_RE = /-(items-add|items-remove|status-update)$/;
const mutatingCmds = CMDS.filter((c) => MUTATING_RE.test(c.name)).map((c) => c.name);
const readOnlyCmds = CMDS.filter((c) => !MUTATING_RE.test(c.name)).map((c) => c.name);
const unflaggedMutators = mutatingCmds.filter((n) => !execCmds.includes(n));
assert(mutatingCmds.length === 5, "expected 5 state-changing commands (VERIFIED_FACTS §1.1)");
assert(readOnlyCmds.length === 8, "expected 8 read-only commands (VERIFIED_FACTS §1.1)");
assert(
  execCmds.every((n) => mutatingCmds.includes(n)),
  "a command flagged execution:true is not in the state-changing set"
);
assert(unflaggedMutators.length === 3, "expected 3 unflagged state-changing commands");

/* The 8 commands actually exercised against the live API are exactly the
   non-mutating 8 — VERIFIED_FACTS §1.1. Kept as a separate name for readability. */
const exercisedCmds = readOnlyCmds;

/* --- non-mutating is NOT the same as freely repeatable -------------------
   VERIFIED_FACTS §1.1: koi-get-events changes no tenant state, but the pack's own
   description calls it development/debugging only because it "may produce duplicate
   events, exceed API rate limits, or disrupt the fetch mechanism", and its
   should_push_events argument WRITES events into koi_koi_raw when true.
   So 7 of the 8 non-mutating commands are freely repeatable and this one is not.
   Both halves of that claim are asserted against the pack JSON below. */
const NOT_REPEATABLE = "koi-get-events";
const notRepeatableCmd = CMDS.find((c) => c.name === NOT_REPEATABLE);
assert(!!notRepeatableCmd, "koi-get-events is missing from the pack");
assert(readOnlyCmds.includes(NOT_REPEATABLE), "koi-get-events should be in the non-mutating set");
assert(
  notRepeatableCmd.arguments.some((a) => a.name === "should_push_events"),
  "koi-get-events should declare should_push_events"
);
assert(
  /development and debugging only/.test(notRepeatableCmd.description || ""),
  "koi-get-events no longer carries the development/debugging-only warning"
);
const repeatableCmds = readOnlyCmds.filter((n) => n !== NOT_REPEATABLE);

/* --- required configuration, split by whether XSOAR even shows it --------
   VERIFIED_FACTS §2: every Collect-section parameter carries hidden: [xsoar], so on
   an XSOAR tenant a required Collect parameter is not a setup input at all. Derived,
   then asserted, so the split cannot drift from the pack JSON. */
const isXsoarHidden = (c) => Array.isArray(c.hidden) && c.hidden.includes("xsoar");
const requiredCfg = CFG.filter((c) => c.required);
const requiredEverywhere = requiredCfg.filter((c) => !isXsoarHidden(c)).map((c) => c.name);
const requiredXsiamOnly = requiredCfg.filter(isXsoarHidden).map((c) => c.name);
const collectCfg = CFG.filter((c) => c.section === "Collect");
const connectCfg = CFG.filter((c) => c.section === "Connect");
assert(collectCfg.length > 0, "expected at least one Collect parameter");
assert(
  collectCfg.every(isXsoarHidden),
  "expected every Collect parameter to be hidden on XSOAR (VERIFIED_FACTS §2)"
);
assert(
  requiredXsiamOnly.every((n) => collectCfg.some((c) => c.name === n)),
  "a required XSOAR-hidden parameter is not a Collect parameter"
);
assert(
  requiredEverywhere.every((n) => connectCfg.some((c) => c.name === n)),
  "a required always-visible parameter is not a Connect parameter"
);

/* Redundant declarations vs shared paths — VERIFIED_FACTS §4.
   nRedundantDecls (63) is a count of DECLARATIONS, not of paths.
   nSharedPaths (36) is the number of distinct paths more than one command declares. */
const nRedundantDecls = nOutputDecls - nDistinctPaths;
const pathDeclarers = {};
CMDS.forEach((c) => {
  [...new Set(c.outputs.map((o) => o.contextPath))].forEach((p) => {
    pathDeclarers[p] = (pathDeclarers[p] || 0) + 1;
  });
});
const nSharedPaths = Object.values(pathDeclarers).filter((v) => v > 1).length;
assert(nSharedPaths < nRedundantDecls, "shared-path count should be smaller than redundant decls");

/* The Koi.Inventory item-path collision is THREE commands — VERIFIED_FACTS §4.
   koi-inventory-item-endpoints-list is NOT part of it: it declares only the
   nested Koi.Inventory.Endpoint.* paths and shares no path with the other three. */
const invItemPathCmds = CMDS.filter((c) =>
  c.outputs.some((o) => /^Koi\.Inventory\./.test(o.contextPath) && !/^Koi\.Inventory\.Endpoint\./.test(o.contextPath))
).map((c) => c.name);
assert(invItemPathCmds.length === 3, "expected exactly 3 commands declaring Koi.Inventory item paths");
assert(
  !invItemPathCmds.includes("koi-inventory-item-endpoints-list"),
  "koi-inventory-item-endpoints-list must not be part of the Koi.Inventory item-path collision"
);
/* Slide 5 says "the three inventory item commands and both policy commands
   overwrite each other's context" in words. Both numbers are asserted here, so the
   words cannot drift from the pack: the build fails rather than printing a wrong one. */
const policyPathCmds = CMDS.filter((c) =>
  c.outputs.some((o) => /^Koi\.Policy\./.test(o.contextPath))
).map((c) => c.name);
assert(policyPathCmds.length === 2, "expected exactly 2 commands declaring Koi.Policy paths");

/* enums, read from the YAML-derived JSON */
const argOf = (cmd, arg) =>
  CMDS.find((c) => c.name === cmd).arguments.find((a) => a.name === arg);
const MARKETPLACES = argOf("koi-inventory-list", "marketplace").predefined;
const PLATFORMS = argOf("koi-inventory-list", "platform").predefined;

/* Which commands actually DECLARE each filter — derived, never generalised.
   "the inventory commands expose a platform filter" was false: only
   koi-inventory-list declares platform. marketplace is far more widely declared. */
const cmdsDeclaring = (arg) =>
  CMDS.filter((c) => c.arguments.some((a) => a.name === arg)).map((c) => c.name);
const MARKETPLACE_CMDS = cmdsDeclaring("marketplace");
const PLATFORM_CMDS = cmdsDeclaring("platform");
assert(
  PLATFORM_CMDS.length === 1 && PLATFORM_CMDS[0] === "koi-inventory-list",
  "expected koi-inventory-list to be the only command declaring a platform argument"
);
assert(MARKETPLACE_CMDS.length > 1, "expected more than one command to declare a marketplace argument");
const VIEWS_YAML = argOf("koi-inventory-list", "view").predefined;
const RISK_LEVELS = argOf("koi-inventory-list", "risk_level").predefined;
const INSTALL_METHODS = argOf("koi-inventory-list", "installation_method").predefined;

/* VERIFIED_FACTS.md §5.1 — the API's own 400 response names nine valid views;
   these three are absent from the YAML dropdown. [LIVE] */
const VIEWS_API_ONLY = ["all_items", "mcp_servers", "repositories"];

/* EDITORIAL: the families below are a reading aid. Every token inside them is
   verbatim from the marketplace enum above; the grouping into families is mine.
   The assertion guarantees the families stay a complete, non-overlapping partition. */
const FAMILIES = [
  ["Browser extensions", ["chrome_web_store", "edge_add_ons", "firefox_add_ons"]],
  [
    "IDE & editor extensions",
    ["vscode", "visual_studio", "jetbrains", "cursor", "windsurf", "open_vsx_registry", "notepad++"],
  ],
  ["Agentic AI & MCP", ["github_mcp_registry", "claude_desktop_extensions", "hugging_face"]],
  ["Code & container packages", ["npm", "pypi", "docker"]],
  [
    "OS software & package managers",
    ["windows", "mac", "linux", "homebrew", "chocolatey", "office_add_ins"],
  ],
];
const famTokens = FAMILIES.flatMap(([, t]) => t);
assert(famTokens.length === MARKETPLACES.length, "family partition size != marketplace enum size");
assert(new Set(famTokens).size === famTokens.length, "family partition has a duplicate token");
assert(
  famTokens.every((t) => MARKETPLACES.includes(t)),
  "a family token is not in the marketplace enum"
);

/* ============================================================================
   1. DECK SETUP — palette + helpers lifted from the custom pack's build_deck.js
   ========================================================================== */
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5 in — must be set before adding slides
pres.author = "Cortex XSIAM";
pres.title = `KOI Marketplace Pack v${PACK.pack.currentVersion} — Overview`;
pres.subject = "Official Marketplace KOI pack (demisto/content, Packs/Koi) — overview";

const BG = "000000";
const CARD = "15171B";
const CARD_HI = "1C2026";
const ORANGE = "E8551F";
const CYAN = "22D3EE";
const AMBER = "F5A524";
const GREEN = "3FB950";
const WHITE = "FFFFFF";
const BODY = "B4B7BD";
const MUTED = "6E747E";
const F = "Calibri";
const MONO = "Courier New";

const M = 0.6;
const W = 13.3 - M * 2; // 12.1

const FOOTER = `Marketplace KOI pack v${PACK.pack.currentVersion}  ·  ${PACK.source.repo} / ${PACK.source.path.split("/Integrations")[0]}  ·  integration only, ${nCommands} commands  ·  not the custom v1.3.0 pack`;

const newSlide = (footer = true) => {
  const s = pres.addSlide();
  s.background = { color: BG };
  if (footer)
    s.addText(FOOTER, {
      x: M, y: 7.02, w: W, h: 0.26, fontSize: 8, color: MUTED, fontFace: F, margin: 0,
    });
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

/* opts lets a crowded slide pull the heading up to make room for a legend row;
   every other slide keeps the default geometry. */
const heading = (s, kicker, title, opts = {}) => {
  const kickerY = opts.kickerY ?? 0.40;
  const titleY = opts.titleY ?? 0.67;
  const titleH = opts.titleH ?? 0.72;
  const titleFS = opts.titleFS ?? 31;
  if (kicker)
    s.addText(kicker.toUpperCase(), {
      x: M, y: kickerY, w: W, h: 0.26, fontSize: 11, bold: true,
      color: ORANGE, fontFace: F, charSpacing: 2, margin: 0,
    });
  s.addText(title, {
    x: M, y: titleY, w: W, h: titleH, fontSize: titleFS, bold: true, color: WHITE, fontFace: F, margin: 0,
  });
};

const arrow = (s, x, y) =>
  s.addShape(pres.ShapeType.rightArrow, {
    x, y, w: 0.30, h: 0.20, fill: { color: ORANGE }, line: { color: ORANGE, width: 0 },
  });

const flowBox = (s, x, y, w, h, title, sub, accent = ORANGE) => {
  card(s, x, y, w, h, CARD);
  /* a title that carries its own line break needs its box grown and the sub
     pushed below it, or the second title line lands on top of the sub text */
  const titleLines = title.split("\n").length;
  const titleH = 0.30 * titleLines;
  s.addText(title, {
    x: x + 0.18, y: y + 0.15, w: w - 0.36, h: titleH + 0.04,
    fontSize: 12.5, bold: true, color: WHITE, fontFace: F, margin: 0,
    lineSpacing: 16, valign: "top",
  });
  if (sub)
    s.addText(sub, {
      x: x + 0.18, y: y + 0.19 + titleH, w: w - 0.36, h: h - 0.35 - titleH,
      fontSize: 10, color: accent === CYAN ? CYAN : BODY, fontFace: F,
      margin: 0, lineSpacing: 13, valign: "top",
    });
};

/* --- monospace metrics ---------------------------------------------------
   Courier New advances exactly 0.6 em per glyph, so a token run's rendered
   width is predictable. These helpers let the generator wrap token lists
   itself instead of letting the renderer wrap them: renderer wrapping put a
   dangling separator at the end of a line and a stray leading space at the
   start of the next one. */
const monoWidth = (chars, fontSize) => (chars * 0.6 * fontSize) / 72; // inches
const monoFits = (widthIn, fontSize) => Math.floor((widthIn * 72) / (0.6 * fontSize));

/* Greedy-wrap tokens into lines no wider than widthIn, separator only BETWEEN
   tokens on the same line. Returns a "\n"-joined string. */
const wrapTokens = (tokens, sep, widthIn, fontSize) => {
  const max = monoFits(widthIn, fontSize);
  const lines = [];
  let cur = "";
  tokens.forEach((t) => {
    const candidate = cur ? cur + sep + t : t;
    if (cur && candidate.length > max) {
      lines.push(cur);
      cur = t;
    } else {
      cur = candidate;
    }
  });
  if (cur) lines.push(cur);
  assert(
    lines.every((l) => l.length <= max || l.split(sep).length === 1),
    "a single token is wider than its card — widen the card or drop the font size"
  );
  return lines.join("\n");
};

/* small source tag, so every slide says where its facts come from */
const sourceTag = (s, text, y = 6.62) =>
  s.addText(text, {
    x: M, y, w: W, h: 0.3, fontSize: 9.5, italic: true, color: MUTED, fontFace: F, margin: 0,
  });

/* ============================================================================
   SLIDE 1 — Title
   ========================================================================== */
{
  const s = newSlide(false);
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.1, y: -1.5, w: 6.2, h: 6.2,
    fill: { color: ORANGE, transparency: 92 }, line: { color: ORANGE, width: 1 },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.6, y: 3.4, w: 3.6, h: 3.6,
    fill: { color: CYAN, transparency: 94 }, line: { color: CYAN, width: 1 },
  });
  s.addText("CORTEX XSIAM  ·  OFFICIAL MARKETPLACE CONTENT PACK", {
    x: M, y: 1.52, w: W, h: 0.23, fontSize: 12, bold: true, color: ORANGE, fontFace: F,
    charSpacing: 3, margin: 0,
  });
  s.addText("KOI", {
    x: M, y: 1.74, w: 7.5, h: 1.60, fontSize: 90, bold: true, color: WHITE, fontFace: F, margin: 0,
  });
  s.addText(
    [
      { text: `${PACK.source.repo}  ·  ${PACK.source.path.split("/Integrations")[0]}  ·  v${PACK.pack.currentVersion}`, options: { color: CYAN, fontFace: MONO, fontSize: 13, breakLine: true } },
      { text: `support: ${PACK.pack.support}   author: ${PACK.pack.author}   category: ${PACK.integration.category}   from XSOAR ${PACK.integration.fromversion}`, options: { color: MUTED, fontFace: MONO, fontSize: 10.5 } },
    ],
    { x: M, y: 3.36, w: 9.4, h: 0.7, fontFace: MONO, margin: 0, lineSpacing: 17, valign: "top" }
  );
  s.addText(
    "Visibility over the software your workforce installs itself — browser and IDE extensions, MCP servers, code packages and OS software — across every endpoint KOI sees.",
    { x: M, y: 4.14, w: 8.6, h: 0.82, fontSize: 15, color: BODY, fontFace: F, margin: 0, lineSpacing: 21 }
  );
  const stats = [
    [String(nCommands), "commands"],
    [String(PACK.contextPrefixes.length), "context prefixes"],
    ["1", "integration"],
    ["0", "playbooks or rules"],
  ];
  stats.forEach(([n, l], i) => {
    const x = M + i * 2.35;
    s.addText(n, { x, y: 5.12, w: 2.2, h: 0.6, fontSize: 36, bold: true, color: i === 3 ? MUTED : ORANGE, fontFace: F, margin: 0 });
    s.addText(l, { x, y: 5.72, w: 2.2, h: 0.3, fontSize: 11, color: MUTED, fontFace: F, margin: 0 });
  });
  s.addText(
    "This is the Marketplace pack. A different, in-house KOI pack (v1.3.0, 26 commands) also exists and cannot coexist with it — see the comparison slide.",
    { x: M, y: 6.34, w: W, h: 0.5, fontSize: 10.5, italic: true, color: AMBER, fontFace: F, margin: 0, lineSpacing: 13 }
  );
  s.addText(FOOTER, { x: M, y: 7.02, w: W, h: 0.26, fontSize: 8, color: MUTED, fontFace: F, margin: 0 });
  s.addNotes(
    `Overview of the OFFICIAL Marketplace KOI pack, ${PACK.source.repo}/${PACK.source.path}, version ${PACK.pack.currentVersion}. ` +
      `Integration only: ${nCommands} commands, ${PACK.contextPrefixes.length} context prefixes, no playbooks, no parsing or modeling rules, no dashboard. ` +
      `Command facts in this deck are generated at build time from the pinned YAML (md5 ${PACK.source.md5}).`
  );
}

/* ============================================================================
   SLIDE 2 — What it gives you
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "What it covers", "The self-installed software surface");
  s.addText(
    `${MARKETPLACE_CMDS.length} of the ${nCommands} commands declare a marketplace filter (${MARKETPLACES.length} values); only ${PLATFORM_CMDS[0]} declares a platform filter (${PLATFORMS.length}). Filter vocabularies, not measured reach. Tokens in the five family cards are verbatim from that marketplace enum; the view card is the API's list.`,
    { x: M, y: 1.42, w: 11.6, h: 0.46, fontSize: 12, color: BODY, fontFace: F, margin: 0, lineSpacing: 15, valign: "top" }
  );

  const cw = (W - 0.7) / 3, ch = 1.72;
  FAMILIES.forEach(([title, tokens], i) => {
    const x = M + (i % 3) * (cw + 0.35);
    const y = 1.92 + Math.floor(i / 3) * (ch + 0.3);
    card(s, x, y, cw, ch);
    chip(s, x + 0.26, y + 0.24, String(tokens.length), i % 2 ? CYAN : ORANGE, 0.34);
    s.addText(title, {
      x: x + 0.72, y: y + 0.24, w: cw - 1.0, h: 0.36, fontSize: 13.5, bold: true, color: WHITE,
      fontFace: F, margin: 0, valign: "middle",
    });
    s.addText(wrapTokens(tokens, "  ·  ", cw - 0.56, 9.5), {
      x: x + 0.26, y: y + 0.72, w: cw - 0.52, h: ch - 0.9, fontSize: 9.5, color: BODY,
      fontFace: MONO, margin: 0, lineSpacing: 13, valign: "top",
    });
  });

  /* sixth cell: the view enum */
  const x6 = M + 2 * (cw + 0.35), y6 = 1.92 + (ch + 0.3);
  card(s, x6, y6, cw, ch, CARD_HI);
  s.addText(`view — the API's ${VIEWS_YAML.length + VIEWS_API_ONLY.length} accepted values`, {
    x: x6 + 0.26, y: y6 + 0.2, w: cw - 0.52, h: 0.3, fontSize: 12, bold: true, color: WHITE,
    fontFace: F, margin: 0,
  });
  s.addText(
    [
      { text: wrapTokens(VIEWS_YAML, " · ", cw - 0.56, 9), options: { color: BODY, fontSize: 9, breakLine: true } },
      { text: wrapTokens(VIEWS_API_ONLY, " · ", cw - 0.56, 9), options: { color: AMBER, fontSize: 9 } },
    ],
    { x: x6 + 0.26, y: y6 + 0.54, w: cw - 0.52, h: 0.80, fontFace: MONO, margin: 0, lineSpacing: 12, valign: "top" }
  );
  s.addText("grey = in the pack's view enum · amber = API-only, absent from it  [LIVE]", {
    x: x6 + 0.26, y: y6 + 1.36, w: cw - 0.52, h: 0.28, fontSize: 8.5, italic: true, color: MUTED,
    fontFace: F, margin: 0, valign: "top",
  });

  s.addText(
    `Filter and sort on top of that: risk_level (${RISK_LEVELS.join(", ")}), installation_method (${INSTALL_METHODS.join(", ")}), publisher, first-seen date and a query-builder search.`,
    { x: M, y: 5.94, w: W, h: 0.5, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 14 }
  );
  sourceTag(
    s,
    "Family tokens: the marketplace argument enum in marketplace-pack.json; the headings are an editorial grouping, not a pack construct.  The view card lists the API's accepted set, three values of which the pack's own enum omits: VERIFIED_FACTS §5.1 [LIVE].",
    6.5
  );
  s.addNotes(
    `The marketplace enum has ${MARKETPLACES.length} values and the platform enum ${PLATFORMS.length} — these are argument filter vocabularies, not a measured coverage figure. ` +
      `Attribute them precisely: ${MARKETPLACE_CMDS.length} commands declare marketplace (${MARKETPLACE_CMDS.join(", ")}), and ${PLATFORM_CMDS[0]} alone declares platform. ` +
      "The five family headings are mine, for reading; the tokens in them are verbatim from the marketplace enum. " +
      "The view card is different — it is the API's accepted set, and mcp_servers, all_items and repositories appear in it but not in the pack's own view enum. " +
      "All twelve values were probed individually on both instances, so nothing about the view enum is unprobed: the nine the API names return 200, " +
      "and browser_extensions, ide_extensions and packages return 400. all_items is accepted but returns zero rows on both instances, " +
      "while omitting view entirely returned 3,447 items on KOI_PAET and 5,644 on KOI_PLTS. " +
      "KOI_PAET returned 3,447 in both sweeps; only KOI_PLTS drifted, to 5,646 in a sweep hours later on 20 July 2026 — real inventory growth on that one tenant, not an unstable API. " +
      "Always name the instance when you quote either number, and treat both as a snapshot of one day, never as a count a reader should expect to reproduce."
  );
}

/* ============================================================================
   SLIDE 3 — What ships
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Contents", "What actually ships");

  const lw = 7.0;
  const ships = [
    ["A", "One integration", `${PACK.integration.display} — id ${PACK.integration.id}, category ${PACK.integration.category}.`, true],
    ["B", `${nCommands} commands`, `${nArgs} arguments, ${nOutputDecls} output declarations over ${nDistinctPaths} distinct context paths.`, true],
    ["C", "An event collector — XSIAM / platform only", `isfetchevents ${PACK.integration.isfetchevents}, xsoar ${PACK.integration.isfetchevents_xsoar} — Alerts and Audit. Disabled on XSOAR.`, true],
    ["—", "No playbooks", "Nothing orchestrates the commands. You supply the workflow.", false],
    ["—", "No parsing or modeling rules", "None ships in the pack, and no XDM field is populated in koi_koi_raw.", false],
    ["—", "No dashboard, no layouts", "Integration only. Everything else is yours to build.", false],
  ];
  ships.forEach(([g, t, d, yes], i) => {
    const y = 1.56 + i * 0.86;
    card(s, M, y, lw, 0.74);
    chip(s, M + 0.22, y + 0.19, g, yes ? ORANGE : MUTED);
    s.addText(t, {
      x: M + 0.78, y: y + 0.09, w: lw - 1.0, h: 0.30, fontSize: 13.5, bold: true,
      color: yes ? WHITE : MUTED, fontFace: F, margin: 0,
    });
    s.addText(d, {
      x: M + 0.78, y: y + 0.40, w: lw - 1.0, h: 0.28, fontSize: 10, color: BODY, fontFace: F, margin: 0,
    });
  });

  const px = M + lw + 0.4, pw = W - lw - 0.4;
  card(s, px, 1.56, pw, 5.10, CARD_HI);
  s.addText("Build facts", {
    x: px + 0.3, y: 1.76, w: pw - 0.6, h: 0.34, fontSize: 15, bold: true, color: WHITE, fontFace: F, margin: 0,
  });
  const facts = [
    ["Pack version", PACK.pack.currentVersion],
    ["Integration id", PACK.integration.id],
    ["From version", PACK.integration.fromversion],
    ["Docker image", PACK.integration.dockerimage],
    ["Marketplaces", PACK.pack.marketplaces.join(", ")],
    ["Support", PACK.pack.support],
    ["Config parameters", String(CFG.length)],
    /* Only the Connect parameters are required on every marketplace. The third
       required parameter is a Collect parameter, hidden: [xsoar] — qualified on
       the amber line below rather than listed here as if XSOAR asked for it. */
    [
      "Required at setup — Connect",
      requiredEverywhere.join(", "),
      `${requiredXsiamOnly.join(", ")} is required too, but it is a Collect parameter hidden on XSOAR — there it is not a setup input at all.`,
    ],
  ];
  facts.forEach(([k, v, extra], i) => {
    const y = 2.10 + i * 0.48;
    s.addText(k, { x: px + 0.3, y, w: pw - 0.6, h: 0.20, fontSize: 9, color: MUTED, fontFace: F, charSpacing: 1, margin: 0 });
    s.addText(v, { x: px + 0.3, y: y + 0.18, w: pw - 0.6, h: 0.30, fontSize: 10.5, color: CYAN, fontFace: MONO, margin: 0, valign: "top" });
    if (extra)
      s.addText(extra, {
        x: px + 0.3, y: y + 0.46, w: pw - 0.6, h: 0.44, fontSize: 9, color: AMBER,
        fontFace: F, margin: 0, lineSpacing: 11.5, valign: "top",
      });
  });
  s.addText(
    `${connectCfg.length} Connect and ${collectCfg.length} Collect parameters; every Collect one is hidden on XSOAR.`,
    { x: px + 0.3, y: 6.32, w: pw - 0.6, h: 0.30, fontSize: 9, italic: true, color: MUTED, fontFace: F, margin: 0, lineSpacing: 11.5, valign: "top" }
  );
  sourceTag(s, "All values, including required and hidden: [xsoar], generated at build time from marketplace-pack.json [YAML]; isfetchevents XSOAR override, YAML lines 990–991.  \"Integration only\" — no playbooks, rules or dashboard — is an inspection of the pack directory, not a tenant observation.  That no XDM field is populated in koi_koi_raw is [LIVE]: VERIFIED_FACTS §3.2.", 6.66);
  s.addNotes(
    `Integration only. ${nCommands} commands, ${nArgs} arguments, ${nOutputDecls} output declarations, ${nDistinctPaths} distinct context paths, ${CFG.length} configuration parameters. ` +
      "No playbooks, no parsing or modeling rules, no dashboard. " +
      "The event collector is XSIAM / platform only: the YAML sets isfetchevents: true and then overrides it with isfetchevents:xsoar: false, " +
      "and every Collect-section parameter is hidden on XSOAR. On an XSOAR tenant this pack is a command integration and nothing else. " +
      `On the required parameters: three carry required: true — ${requiredCfg.map((c) => c.name).join(", ")} — but ` +
      `${requiredXsiamOnly.join(", ")} sits in the Collect section with hidden: [xsoar]. ` +
      `So an XSOAR tenant is asked only for ${requiredEverywhere.join(" and ")}, which is consistent with the collector being XSIAM / platform only; ` +
      "on XSIAM all three are asked for."
  );
}

/* ============================================================================
   SLIDE 4 — The data model
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Data model", "Five context prefixes, and an item-centric shape");

  /* Every number on this slide is computed from marketplace-pack.json, and the five
     cards are made to ADD UP to the deck's own distinct-path total. The ten nested
     Koi.Inventory.Endpoint.* paths are counted inside the Koi.Inventory card — left
     out, the row read 4+9+9+9+27 = 58 while the source tag said 68. The assertion
     below fails the build if the cards ever stop summing to nDistinctPaths. */
  const invItem = prefixCount["Koi.Inventory"];
  const invEndpoint = prefixCount["Koi.Inventory.Endpoint"];
  const prefixes = [
    ["KOI.Event", prefixCount["KOI.Event"], "distinct paths", "koi-get-events", ORANGE],
    ["Koi.Policy", prefixCount["Koi.Policy"], "distinct paths", "policy list + status update", CYAN],
    ["Koi.Allowlist", prefixCount["Koi.Allowlist"], "distinct paths", "koi-allowlist-get", ORANGE],
    ["Koi.Blocklist", prefixCount["Koi.Blocklist"], "distinct paths", "koi-blocklist-get", CYAN],
    [
      "Koi.Inventory",
      invItem + invEndpoint,
      `${invItem} item + ${invEndpoint} nested Endpoint`,
      "list · item-get · search · item-endpoints-list",
      ORANGE,
    ],
  ];
  assert(
    prefixes.reduce((a, p) => a + p[1], 0) === nDistinctPaths,
    `the five prefix cards sum to ${prefixes.reduce((a, p) => a + p[1], 0)}, not the ${nDistinctPaths} distinct paths in the pack`
  );
  const cw = (W - 4 * 0.28) / 5;
  prefixes.forEach(([p, n, unit, by, c], i) => {
    const x = M + i * (cw + 0.28);
    card(s, x, 1.52, cw, 1.62);
    s.addText(p, { x: x + 0.20, y: 1.70, w: cw - 0.40, h: 0.32, fontSize: 12.5, bold: true, color: c, fontFace: MONO, margin: 0 });
    s.addText(String(n), { x: x + 0.20, y: 2.04, w: cw - 0.40, h: 0.50, fontSize: 26, bold: true, color: WHITE, fontFace: F, margin: 0 });
    s.addText(unit, { x: x + 0.20, y: 2.50, w: cw - 0.40, h: 0.22, fontSize: 8.5, color: MUTED, fontFace: F, margin: 0 });
    s.addText(by, { x: x + 0.20, y: 2.72, w: cw - 0.40, h: 0.30, fontSize: 8.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 10 });
  });

  /* the arithmetic, spelled out, so the row is visibly the whole of the total */
  s.addText(
    [
      {
        text: `${prefixes.map((p) => p[1]).join("  +  ")}  =  ${nDistinctPaths} distinct context paths`,
        options: { color: WHITE, bold: true, fontSize: 11.5 },
      },
      {
        text: `   —  the Koi.Inventory card includes the ${invEndpoint} nested Koi.Inventory.Endpoint.* paths.`,
        options: { color: MUTED, fontSize: 10.5 },
      },
    ],
    { x: M, y: 3.20, w: W, h: 0.28, fontFace: F, margin: 0, valign: "middle" }
  );

  s.addText("Item-centric: an endpoint is reached only through an item", {
    x: M, y: 3.54, w: W, h: 0.3, fontSize: 12, bold: true, color: ORANGE, fontFace: F, charSpacing: 1, margin: 0,
  });
  const flow = [
    ["koi-inventory-list", "or -search\nfind items", ORANGE],
    ["Koi.Inventory.*", `${invItem} item fields\nrisk, publisher,\ngovernance`, ORANGE],
    ["koi-inventory-item-\nendpoints-list", "item_id + marketplace\n+ version", CYAN],
    ["Koi.Inventory.Endpoint.*", `${invEndpoint} nested fields — hostname,\nos, serial, path,\nlast_logged_on_user`, CYAN],
  ];
  const bw = 2.72;
  flow.forEach(([t, d, c], i) => {
    const x = M + i * (bw + 0.42);
    flowBox(s, x, 3.88, bw, 1.42, t, d, c);
    if (i < flow.length - 1) arrow(s, x + bw + 0.06, 3.88 + 0.60);
  });

  card(s, M, 5.44, W, 1.08, CARD_HI);
  chip(s, M + 0.26, 5.68, "!", AMBER, 0.36);
  s.addText("Two things that bite", {
    x: M + 0.82, y: 5.56, w: 3.4, h: 0.3, fontSize: 12.5, bold: true, color: WHITE, fontFace: F, margin: 0,
  });
  s.addText(
    [
      { text: "There is no Koi.Device.* prefix.", options: { color: WHITE, bold: true, fontSize: 10.5 } },
      { text: " Endpoints exist only under Koi.Inventory.Endpoint.*, reached from an item — you cannot ask this pack \"what is on host X\" directly.   ", options: { color: BODY, fontSize: 10.5 } },
      { text: "The casing is inconsistent:", options: { color: WHITE, bold: true, fontSize: 10.5 } },
      { text: " KOI.Event for events, Koi.* for everything else. Nothing in the pack says why. Preserve it exactly as declared rather than normalising it — DT paths are case-sensitive.", options: { color: BODY, fontSize: 10.5 } },
    ],
    { x: M + 0.82, y: 5.86, w: W - 1.14, h: 0.58, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  sourceTag(s, `Every number on this slide is computed at build time from marketplace-pack.json (${nOutputDecls} declarations, ${nDistinctPaths} distinct paths, ${nSharedPaths} of them declared by more than one command); the build fails if the five cards stop summing to ${nDistinctPaths}.  Absence of Koi.Device.*: VERIFIED_FACTS §4.`, 6.60);
  s.addNotes(
    `Five prefixes, and the five cards add up: ${prefixes.map((p) => p[1]).join(" + ")} = ${nDistinctPaths}. The Koi.Inventory card carries ${invItem} item paths plus the ${invEndpoint} nested Koi.Inventory.Endpoint.* paths shown in the flow. ` +
      `${nOutputDecls} output declarations collapse to ${nDistinctPaths} distinct paths: ${nRedundantDecls} of the declarations are redundant, ` +
      `which is a count of declarations, not of paths — the number of distinct paths declared by more than one command is ${nSharedPaths}. ` +
      `Consequence: the three inventory commands that declare the item paths (${invItemPathCmds.join(", ")}) write the same prefix, so the last to run overwrites the previous context. ` +
      "koi-inventory-item-endpoints-list is NOT part of that collision — it declares only the nested Koi.Inventory.Endpoint.* paths and shares no path with the other three."
  );
}

/* ============================================================================
   SLIDE 5 — Command surface, grouped
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Command surface", `${nCommands} commands, all of them`);

  /* Card widths are sized from the longest command name each group has to show,
     so no name ever wraps mid-token. Equal fifths cannot hold
     inventory-item-endpoints-list at a legible size; the leftover width is
     shared out in proportion so the row still fills the page. */
  const CMD_FS = 9;
  const GAP5 = 0.24;
  const PAD5 = 0.20;
  const longest = GROUPS.map((g) =>
    Math.max(...g.cmds.map((c) => c.name.replace(/^koi-/, "").length))
  );
  const need = longest.map((n) => Math.max(monoWidth(n, CMD_FS) + 2 * PAD5 + 0.04, 1.45));
  const avail5 = W - 4 * GAP5;
  const needTotal = need.reduce((a, b) => a + b, 0);
  assert(needTotal <= avail5, "command group cards cannot fit the row at 9pt");
  const slack5 = avail5 - needTotal;
  const widths = need.map((n) => n + (slack5 * n) / needTotal);
  widths.forEach((w2, i) =>
    assert(
      monoWidth(longest[i], CMD_FS) <= w2 - 2 * PAD5,
      `group ${GROUPS[i].label}: longest command name does not fit its card`
    )
  );
  const xs = [];
  widths.reduce((acc, w2, i) => {
    xs[i] = acc;
    return acc + w2 + GAP5;
  }, M);

  GROUPS.forEach((g, i) => {
    const x = xs[i];
    const cw = widths[i];
    card(s, x, 1.50, cw, 2.72);
    s.addText(String(g.cmds.length), {
      x: x + 0.20, y: 1.64, w: cw - 0.4, h: 0.66, fontSize: 34, bold: true,
      color: i % 2 ? CYAN : ORANGE, fontFace: F, margin: 0,
    });
    s.addText(g.label, {
      x: x + 0.20, y: 2.28, w: cw - 0.4, h: 0.30, fontSize: 13, bold: true, color: WHITE, fontFace: F, margin: 0,
    });
    s.addText(
      g.cmds.map((c, k) => ({
        text: c.name.replace(/^koi-/, ""),
        options: {
          color: c.execution ? AMBER : BODY,
          fontSize: CMD_FS,
          fontFace: MONO,
          breakLine: k < g.cmds.length - 1,
        },
      })),
      { x: x + 0.20, y: 2.64, w: cw - 0.4, h: 1.0, margin: 0, lineSpacing: 13, valign: "top" }
    );
    const argTotal = g.cmds.reduce((a, c) => a + c.arguments.length, 0);
    const outTotal = g.cmds.reduce((a, c) => a + c.outputs.length, 0);
    s.addText(`${argTotal} args  ·  ${outTotal} outputs`, {
      x: x + 0.20, y: 3.90, w: cw - 0.4, h: 0.26, fontSize: 8.5, color: MUTED, fontFace: F, margin: 0,
    });
  });
  s.addText(`all prefixed koi-  ·  amber = execution: true  ·  ${mutatingCmds.length} commands change tenant state, but only these ${execCmds.length} carry the flag  ·  non-mutating is not the same as freely repeatable — see ${NOT_REPEATABLE.replace(/^koi-/, "")} below`, {
    x: M, y: 4.32, w: W, h: 0.26, fontSize: 9, italic: true, color: MUTED, fontFace: F, margin: 0,
  });

  /* The two execution:true names are set on their own monospace lines: in
     running prose at this card width they broke across lines at a hyphen,
     which reads as a different (non-existent) command. */
  const notes = [
    [
      `${readOnlyCmds.length} of ${nCommands}`,
      "non-mutating",
      [
        { text: `The other ${mutatingCmds.length} change tenant state. The pack flags only ${execCmds.length}:`, options: { color: BODY, fontSize: 10, fontFace: F, breakLine: true } },
        { text: execCmds.map((n) => n.replace(/^koi-/, "")).join("\n"), options: { color: AMBER, fontSize: 9, fontFace: MONO, breakLine: true } },
        { text: `${unflaggedMutators.map((n) => n.replace(/^koi-/, "")).join(", ")} mutate with no flag at all.`, options: { color: BODY, fontSize: 9.5, fontFace: F, breakLine: true } },
        /* non-mutating ≠ safe to repeat — VERIFIED_FACTS §1.1 */
        { text: `Only ${repeatableCmds.length} of the ${readOnlyCmds.length} are freely repeatable: ${NOT_REPEATABLE.replace(/^koi-/, "")} may duplicate events and disrupt the fetch.`, options: { color: AMBER, fontSize: 9.5, fontFace: F } },
      ],
      ORANGE,
    ],
    [String(noOutputCmds.length), "return no context", `All ${noOutputCmds.length} add/remove commands declare no outputs at all. A playbook cannot branch on their result.`, AMBER],
    [
      `${nRedundantDecls}`,
      "redundant declarations",
      `${nOutputDecls} declarations, ${nDistinctPaths} distinct paths. ${nSharedPaths} paths are declared by more than one command — the three inventory item commands and both policy commands overwrite each other's context.`,
      CYAN,
    ],
  ];
  const nw = (W - 0.7) / 3;
  notes.forEach(([n, l, d, c], i) => {
    const x = M + i * (nw + 0.35);
    card(s, x, 4.66, nw, 1.86, CARD_HI);
    s.addText(
      [
        { text: n + "  ", options: { color: c, bold: true, fontSize: 18 } },
        { text: l, options: { color: WHITE, bold: true, fontSize: 12.5 } },
      ],
      { x: x + 0.24, y: 4.82, w: nw - 0.48, h: 0.34, fontFace: F, margin: 0, valign: "middle" }
    );
    assert(
      typeof d === "string" || monoWidth(Math.max(...execCmds.map((e) => e.replace(/^koi-/, "").length)), 9) <= nw - 0.48,
      "an execution:true command name does not fit the read-only card"
    );
    s.addText(d, {
      x: x + 0.24, y: 5.20, w: nw - 0.48, h: 1.26, fontSize: 10, color: BODY, fontFace: F, margin: 0, lineSpacing: 12.5, valign: "top",
    });
  });
  sourceTag(s, "Groups, names, counts and the execution flag are all derived at build time from marketplace-pack.json.  Non-mutating / state-changing split and the get-events caveat: VERIFIED_FACTS §1.1 and §4.1.  Overwrite: §4.", 6.62);
  s.addNotes(
    GROUPS.map((g) => `${g.label}: ${g.cmds.map((c) => c.name).join(", ")}`).join(" | ") +
      `. Non-mutating (${readOnlyCmds.length}) — ${readOnlyCmds.join(", ")}. ` +
      `State-changing (${mutatingCmds.length}) — ${mutatingCmds.join(", ")}. ` +
      `execution:true is set on only ${execCmds.length} of those: ${execCmds.join(", ")}; ` +
      `${unflaggedMutators.join(", ")} mutate governance state with no such flag, so do not read "not flagged" as "safe". ` +
      `Do not read the ${readOnlyCmds.length} as "safe to repeat" either: ${NOT_REPEATABLE} is non-mutating but the pack's own description says it is for development and debugging only, ` +
      "as it may produce duplicate events, exceed API rate limits or disrupt the fetch mechanism, and its should_push_events argument writes events into koi_koi_raw when set to true. " +
      `So ${repeatableCmds.length} of the ${readOnlyCmds.length} are freely repeatable and that one is not. ` +
      `No declared outputs — ${noOutputCmds.join(", ")}. ` +
      `${nRedundantDecls} is a count of redundant declarations; ${nSharedPaths} is the number of distinct paths declared by more than one command.`
  );
}

/* ============================================================================
   SLIDE 6 — Event collection
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Event collection — XSIAM / platform only", "One dataset, two incompatible schemas");

  const evTypes = CFG.find((c) => c.name === "event_types_to_fetch");
  const maxFetch = CFG.find((c) => c.name === "max_fetch");
  const interval = CFG.find((c) => c.name === "eventFetchInterval");

  const boxes = [
    ["KOI API", `${PACK.configuration[0].defaultvalue}\nAlerts + audit logs`, ORANGE],
    ["Integration", `isfetchevents ${PACK.integration.isfetchevents}\nxsoar ${PACK.integration.isfetchevents_xsoar} — XSIAM only\nevery ${interval.defaultvalue} min, max ${maxFetch.defaultvalue}/type`, ORANGE],
    ["koi_koi_raw", "_vendor koi\n_product koi", CYAN],
    ["XQL only", "no XDM fields\nquery raw fields", ORANGE],
  ];
  const bw = 2.72;
  boxes.forEach(([t, d, c], i) => {
    const x = M + i * (bw + 0.42);
    flowBox(s, x, 1.50, bw, 1.34, t, d, c);
    if (i < boxes.length - 1) arrow(s, x + bw + 0.06, 1.50 + 0.56);
  });

  const halves = [
    ["Audit", "19,842", GREEN, "Flat, KOI-native", [
      "type · action · category · object_name · object_type",
      "hostname · item_version",
      "type values seen:",
      /* wrapped here rather than by the renderer, so no line ends on a
         separator and no line starts with a stray space */
      wrapTokens(
        ["extensions 16,579", "devices 2,971", "remediation 244", "policies 32",
          "approval_requests 8", "guardrails 6", "notifications 2"],
        " · ",
        (W - 0.4) / 2 - 0.56,
        8.8
      ),
    ]],
    ["Alerts", "314", AMBER, "OCSF", [
      "class_uid 2007 (Application Security Posture Finding)",
      "type_uid 200701 · is_alert true",
      "severity_id · confidence_id · risk_level_id · status_id",
      "resources / observables / metadata are JSON STRINGS —",
      "XQL must json_extract them or it silently returns nothing",
    ]],
  ];
  const hw = (W - 0.4) / 2;
  halves.forEach(([t, n, c, schema, lines], i) => {
    const x = M + i * (hw + 0.4);
    card(s, x, 3.04, hw, 2.44);
    s.addText(
      [
        { text: `source_log_type = ${t}`, options: { color: c, bold: true, fontSize: 12.5, fontFace: MONO } },
      ],
      { x: x + 0.26, y: 3.22, w: hw - 0.52, h: 0.32, margin: 0 }
    );
    s.addText(n, { x: x + 0.26, y: 3.56, w: 2.2, h: 0.54, fontSize: 28, bold: true, color: WHITE, fontFace: F, margin: 0 });
    s.addText(`events in 30 d  ·  ${schema}`, {
      x: x + 0.26, y: 4.08, w: hw - 0.52, h: 0.26, fontSize: 9, color: MUTED, fontFace: F, margin: 0,
    });
    s.addText(lines.join("\n"), {
      x: x + 0.26, y: 4.36, w: hw - 0.52, h: 1.0, fontSize: 8.8, color: BODY, fontFace: MONO, margin: 0, lineSpacing: 12, valign: "top",
    });
  });

  card(s, M, 5.60, W, 0.94, CARD_HI);
  chip(s, M + 0.26, 5.83, "!", ORANGE, 0.36);
  s.addText(
    [
      { text: "Nothing is normalised. ", options: { color: WHITE, bold: true, fontSize: 11 } },
      { text: "No parsing rule and no modeling rule ships in the pack, and no XDM field is populated at all — every Audit field is null on Alert rows and vice versa. ", options: { color: BODY, fontSize: 11 } },
      { text: "alert_type is never populated", options: { color: AMBER, bold: true, fontSize: 11 } },
      { text: ": any query or playbook keyed on it matches nothing.", options: { color: BODY, fontSize: 11 } },
    ],
    { x: M + 0.82, y: 5.74, w: W - 1.14, h: 0.68, fontFace: F, margin: 0, lineSpacing: 14, valign: "middle" }
  );
  sourceTag(s, `Dataset name, schema split and the JSON-string caveat: VERIFIED_FACTS §3 [LIVE, 30-day window to 20 Jul 2026, tenant api-ayman.xdr.eu].  The event counts are that one window on that one tenant and keep growing — a snapshot, not a figure to reproduce.  Absence of rules: pack inspection.  Fetch defaults: marketplace-pack.json [YAML]; event types offered: ${evTypes.defaultvalue}.`, 6.62);
  s.addNotes(
    "koi_koi_raw is verified live, not inferred from the vendor/product convention. Audit rows are flat and KOI-native, Alert rows are OCSF; the two share a dataset and nothing else. " +
      "No XDM mapping at all. Counts are from one tenant over one 30-day window — quote the tenant whenever you quote a number. " +
      "Note that everything on this slide applies to XSIAM / platform only: isfetchevents is overridden by isfetchevents:xsoar: false, and every Collect parameter is hidden on XSOAR."
  );
}

/* ============================================================================
   SLIDE 7 — Sharp edges
   ========================================================================== */
{
  const s = newSlide();

  /* Four kinds of thing, and they must not be levelled into one word.
     VERIFIED_FACTS §5 records five findings of three kinds — two defects, one
     documentation gap and two API observations — and card 6 is a fourth kind that
     is not a finding about the pack at all. Each KIND now carries its own colour,
     used for the chip AND the badge, and the legend row under the heading names
     them with counts derived from the cards. Before this, cards 3, 4 and 5 were all
     cyan, so a gap and two observations were indistinguishable at a glance. */
  const VIOLET = "A78BFA";
  const K_DEFECT = { badge: "DEFECT IN THE SHIPPED PACK", legend: "Defect in the shipped pack", color: ORANGE };
  const K_DOCGAP = { badge: "DOCUMENTATION GAP", legend: "Documentation gap", color: AMBER };
  const K_APIOBS = { badge: "API OBSERVATION", legend: "API observation", color: CYAN };
  const K_TENANT = { badge: "THIS TENANT'S CONFIGURATION", legend: "This tenant's configuration", color: VIOLET };
  const KIND_ORDER = [K_DEFECT, K_DOCGAP, K_APIOBS, K_TENANT];

  const edges = [
    [
      "1", K_DEFECT, "",
      "The view dropdown is incomplete",
      `The API accepts nine values; the YAML offers ${VIEWS_YAML.length}. Missing: ${VIEWS_API_ONLY.join(", ")}. All twelve were probed on both instances: mcp_servers holds real data (21 items on KOI_PAET, 42 on KOI_PLTS) but is never offered, and all_items is accepted yet returned zero rows on both.`,
    ],
    [
      "2", K_DEFECT, "",
      "The shipped example is broken",
      "The shipped command_examples.txt uses view=browser_extensions — a value in neither the YAML enum nor the API's accepted set. The live API answers 400, so anyone copying the example gets an error. ide_extensions and packages also 400, but are not in it.",
    ],
    [
      "3", K_DOCGAP, "",
      "inventory-search needs a filter shape",
      'The API wants {"combinator":"and","rules":[…]}; the pack never shows one. Send {} and it answers 400, naming the bad keys. Omitting the filter is blocked inside Koi.py before any call — read from the source, not executed. A missing example, not a bad error.',
    ],
    [
      "4", K_APIOBS, " · RESPONSE SHAPE",
      "Allow/blocklist carry no total",
      "/policies/allowlist and /policies/blocklist return only an items array — no total_count, unlike /policies and /inventory. Read items.length instead. An empty array is the correct answer for an empty list, not an error.",
    ],
    [
      "5", K_APIOBS, " · BEHAVIOUR",
      "Auth failure is unambiguous — 401",
      "An invalid bearer token returns HTTP 401 Unauthorized, verified with a deliberately bad key. No 403 was ever observed from here, so \"403 means blocked egress\" stays unverified and must not be stated as fact.",
    ],
    [
      "6", K_TENANT, "",
      "Two collectors, one dataset",
      "Not a pack fault — how this tenant happens to be configured. Both instances were set to fetch Alerts and Audit into the same koi_koi_raw, and the pack ships no field identifying which instance produced a row.",
    ],
  ];
  const kindCount = (k) => edges.filter(([, kind]) => kind === k).length;
  const nDefects = kindCount(K_DEFECT);
  const nOther = edges.length - nDefects;
  assert(nDefects === 2, "VERIFIED_FACTS §5: exactly two findings are defects in the shipped pack");
  assert(kindCount(K_DOCGAP) === 1, "VERIFIED_FACTS §5.3: exactly one documentation gap");
  assert(kindCount(K_APIOBS) === 2, "VERIFIED_FACTS §5.4 and §5.4a: exactly two API observations");
  assert(
    KIND_ORDER.reduce((a, k) => a + kindCount(k), 0) === edges.length,
    "a sharp-edges card carries a kind that is missing from the legend"
  );
  assert(
    new Set(KIND_ORDER.map((k) => k.color)).size === KIND_ORDER.length,
    "two kinds share a colour — the legend would not distinguish them"
  );

  heading(s, "Before you build on it", `${nDefects === 2 ? "Two" : String(nDefects)} defects in the pack, and ${nOther === 4 ? "four" : String(nOther)} things that are not defects`, { kickerY: 0.30, titleY: 0.55, titleH: 0.62 });

  /* legend — one swatch per kind, with the count of cards carrying it */
  s.addText(
    [{ text: "KINDS    ", options: { color: MUTED, bold: true, fontSize: 9, charSpacing: 1 } }].concat(
      ...KIND_ORDER.map((k) => [
        { text: "■ ", options: { color: k.color, fontSize: 11 } },
        { text: `${k.legend} (${kindCount(k)})     `, options: { color: BODY, fontSize: 9.5 } },
      ])
    ),
    { x: M, y: 1.20, w: W, h: 0.26, fontFace: F, margin: 0, valign: "middle" }
  );

  const cw = (W - 0.7) / 3, ch = 2.02, ROWGAP = 0.24, GRID_Y = 1.54;
  edges.forEach(([n, kind, qualifier, t, d], i) => {
    const x = M + (i % 3) * (cw + 0.35);
    const y = GRID_Y + Math.floor(i / 3) * (ch + ROWGAP);
    card(s, x, y, cw, ch);
    chip(s, x + 0.24, y + 0.18, n, kind.color, 0.32);
    s.addText(kind.badge + qualifier, {
      x: x + 0.66, y: y + 0.20, w: cw - 0.92, h: 0.28, fontSize: 8, bold: true,
      color: kind.color, fontFace: F, charSpacing: 1, margin: 0, valign: "middle",
    });
    s.addText(t, {
      x: x + 0.24, y: y + 0.58, w: cw - 0.48, h: 0.44, fontSize: 12.5, bold: true, color: WHITE, fontFace: F, margin: 0, lineSpacing: 15, valign: "top",
    });
    s.addText(d, {
      x: x + 0.24, y: y + 1.04, w: cw - 0.48, h: 0.94, fontSize: 9.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 12, valign: "top",
    });
  });

  const nRows = Math.ceil(edges.length / 3);
  const stripY = GRID_Y + (nRows - 1) * (ch + ROWGAP) + ch + 0.10;
  assert(stripY + 0.56 < 6.50, "the sharp-edges grid has grown into the source tag");
  card(s, M, stripY, W, 0.56, CARD_HI);
  s.addText(
    [
      { text: "None of these is a blocker.  ", options: { color: GREEN, bold: true, fontSize: 11 } },
      { text: "Each has a workaround: type the view value by hand, ignore the shipped example, paste the filter shape, read items.length instead of total_count, prefer omitting view to using all_items, and tag rows by instance yourself if you run more than one.", options: { color: BODY, fontSize: 11 } },
    ],
    { x: M + 0.3, y: stripY + 0.08, w: W - 0.6, h: 0.44, fontFace: F, margin: 0, lineSpacing: 14, valign: "top" }
  );
  sourceTag(s, `Colour = kind, as in the legend.  Cards 1–5: VERIFIED_FACTS §5 [LIVE against the KOI API, 20 Jul 2026, instances KOI_PAET and KOI_PLTS], except the Koi.py guard in card 3, read from the integration source rather than executed.  Card 6: §2, this tenant's instance configuration.  Only cards 1 and 2 are faults in the pack as published.`, 6.52);
  s.addNotes(
    "Do not level these into one word — the legend gives each kind its own colour. Only cards 1 and 2 are defects in the shipped pack (orange) — the incomplete view dropdown and the broken command_examples.txt — and both would be present on any tenant. " +
      "Card 3 is amber: a documentation gap, not a bug. The API's 400 names exactly which keys are wrong, so the error message is usable; what is missing is an example of the filter shape. " +
      "Its other half — that omitting the filter is stopped inside Koi.py before any API call — was read from the integration source, not executed, and is labelled that way. " +
      "Cards 4 and 5 are the same kind, cyan, and share a badge for that reason: two observations about how the API answers. Card 4 is the response shape of two endpoints; card 5 is behaviour — 401 was verified with a deliberately invalid key, and no 403 was ever seen, so do not claim 403 means anything here. " +
      "Card 6 is violet because it is not about the pack at all — it is how this tenant happens to be configured, two instances set to fetch into one dataset; the pack's only contribution is that it ships no field naming the instance, which is why rows cannot be attributed to an instance. " +
      "On card 1: all twelve view values were probed on both instances, so nothing about the view enum is unprobed. all_items is accepted and returns zero rows on both instances, while omitting view entirely returned 3,447 items on KOI_PAET and 5,644 on KOI_PLTS. Name the instance whenever you quote either. KOI_PAET returned 3,447 in both sweeps; only KOI_PLTS moved, to 5,646 hours later the same day, so treat that one as a drifting snapshot, not a threshold."
  );
}

/* ============================================================================
   SLIDE 8 — Not the other KOI pack
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Do not confuse them", "There are two KOI packs, and they collide");

  const cw = (W - 0.45) / 2;
  const panels = [
    ["This pack — Marketplace", ORANGE, `demisto/content · Packs/Koi · v${PACK.pack.currentVersion}`, [
      `${nCommands} commands`,
      "Integration only",
      "No playbooks",
      "No parsing or modeling rules",
      "No dashboard",
      `${PACK.contextPrefixes.length} context prefixes, item-centric`,
      "Installed from the Marketplace",
    ]],
    ["The other pack — custom", CYAN, "in-house build · v1.3.0 · not on the Marketplace", [
      "26 commands (a strict superset)",
      "Integration + 10 playbooks",
      "Parsing and modeling rules",
      "An alerts dashboard",
      "Adds device-centric commands and context",
      "Adds Koidex catalog, findings, approvals, remediations",
      "Delivered as a pack zip or source",
    ]],
  ];
  panels.forEach(([t, c, sub, list], i) => {
    const x = M + i * (cw + 0.45);
    card(s, x, 1.46, cw, 3.30);
    s.addText(t, { x: x + 0.3, y: 1.64, w: cw - 0.6, h: 0.34, fontSize: 16, bold: true, color: WHITE, fontFace: F, margin: 0 });
    s.addText(sub, { x: x + 0.3, y: 1.98, w: cw - 0.6, h: 0.28, fontSize: 10, color: c, fontFace: MONO, margin: 0 });
    s.addText(
      list.map((li, k) => ({ text: li, options: { bullet: { indent: 13 }, breakLine: k < list.length - 1 } })),
      { x: x + 0.32, y: 2.34, w: cw - 0.64, h: 2.3, fontSize: 11, color: BODY, fontFace: F, margin: 0, paraSpaceAfter: 6, lineSpacing: 15, valign: "top" }
    );
  });

  card(s, M, 4.92, W, 1.52, CARD_HI);
  chip(s, M + 0.3, 5.18, "!", AMBER, 0.40);
  s.addText("They cannot be installed on the same tenant", {
    x: M + 0.92, y: 5.08, w: W - 1.3, h: 0.34, fontSize: 15, bold: true, color: WHITE, fontFace: F, margin: 0,
  });
  s.addText(
    [
      { text: `Both are named ${PACK.pack.name}. Both carry integration id ${PACK.integration.id}. Both are category ${PACK.integration.category}, both are authored by "${PACK.pack.author}", both target ${PACK.pack.marketplaces.join("/")}, both use koi-* command names. `, options: { color: BODY, fontSize: 11 } },
      { text: "One silently overwrites the other.", options: { color: AMBER, bold: true, fontSize: 11, breakLine: true } },
      { text: "Anything written against the custom pack's extra 13 commands — devices-list, koidex-*, findings-list, users-list, remediations-list, runtime-policies and the rest — does not work here, and neither does any Koi.Device.* path.", options: { color: MUTED, fontSize: 10, italic: true } },
    ],
    { x: M + 0.92, y: 5.44, w: W - 1.3, h: 0.92, fontFace: F, margin: 0, lineSpacing: 14, valign: "top" }
  );
  sourceTag(s, "Left column: marketplace-pack.json + VERIFIED_FACTS.  Right column verified by reading the custom pack checkout at ../KOI on 20 Jul 2026 (pack_metadata.json v1.3.0, same three marketplaces; Integrations/Koi/Koi.yml id KOI, 26 koi-* commands; 10 playbook files; ModelingRules/, ParsingRules/, XSIAMDashboards/).", 6.56);
  s.addNotes(
    "This slide exists because the two packs are indistinguishable to a reader: same name, same integration id, same category, same author, same command prefix. " +
      "The right-hand column was verified by reading the custom pack checkout directly, not from memory."
  );
}

/* ============================================================================
   SLIDE 9 — What you build on top
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Scope", "What you would build on top of it");
  s.addText(
    "The pack gives you a clean API surface, and on XSIAM a working event collector. It does not give you content. Sized honestly, that is four pieces of work.",
    { x: M, y: 1.42, w: 10.6, h: 0.34, fontSize: 12, color: BODY, fontFace: F, margin: 0 }
  );
  const work = [
    ["1", "Normalisation", "Parsing and modeling rules for koi_koi_raw. Two schemas in one dataset, keyed on source_log_type, with JSON-string fields on the Alert side that need extracting before anything can be mapped to XDM.", ORANGE],
    ["2", "Detection & triage content", "Correlation rules over the raw fields, and whatever decides which items matter. Nothing keys on alert_type — it is never populated.", CYAN],
    ["3", "Orchestration", `Playbooks that chain the ${nCommands} commands. Watch the shared context prefixes: the ${invItemPathCmds.length} inventory commands that share the item paths overwrite each other, and the ${noOutputCmds.length} add/remove commands return nothing to branch on.`, ORANGE],
    ["4", "Visualisation & reporting", "Dashboards and widgets. Everything must be written against raw fields until the modeling rules above exist.", CYAN],
  ];
  const cw = (W - 3 * 0.3) / 4;
  work.forEach(([n, t, d, c], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 1.90, cw, 2.62);
    chip(s, x + 0.26, 2.10, n, c, 0.34);
    s.addText(t, { x: x + 0.26, y: 2.54, w: cw - 0.52, h: 0.36, fontSize: 14, bold: true, color: WHITE, fontFace: F, margin: 0 });
    s.addText(d, { x: x + 0.26, y: 2.94, w: cw - 0.52, h: 1.5, fontSize: 10, color: BODY, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" });
  });

  card(s, M, 4.82, W, 1.36, CARD_HI);
  s.addText("This is scope, not criticism", {
    x: M + 0.3, y: 4.98, w: 5.0, h: 0.32, fontSize: 13, bold: true, color: GREEN, fontFace: F, margin: 0,
  });
  s.addText(
    "The Marketplace pack does the part that is hard to do yourself — an authenticated, paginated, versioned client over the KOI API, plus a supported event collector on XSIAM. The content layer above it is the part that is specific to your estate, and it is the part you would want to own anyway.",
    { x: M + 0.3, y: 5.32, w: W - 0.6, h: 0.76, fontSize: 11, color: BODY, fontFace: F, margin: 0, lineSpacing: 14, valign: "top" }
  );
  sourceTag(s, "Editorial: this slide is an inference drawn from the gaps recorded in VERIFIED_FACTS §3.2, §4 and §5.  It states no new fact about the pack.", 6.26);
  s.addNotes("Framed as scope. Each of the four items points back at a specific verified gap rather than a general complaint.");
}

/* ============================================================================
   SLIDE 10 — Provenance
   ========================================================================== */
{
  const s = newSlide();
  heading(s, "Provenance", "What was checked, and what was not");

  const cw = (W - 0.45) / 2;

  card(s, M, 1.46, cw, 3.90);
  s.addText("Verified", { x: M + 0.3, y: 1.64, w: cw - 0.6, h: 0.34, fontSize: 16, bold: true, color: GREEN, fontFace: F, margin: 0 });
  s.addText("on the tenant or against the KOI API, 20 Jul 2026", { x: M + 0.3, y: 1.98, w: cw - 0.6, h: 0.26, fontSize: 10, color: MUTED, fontFace: MONO, margin: 0 });
  const ok = [
    "Which pack is installed — the Marketplace pack, brand KOI",
    "The dataset name koi_koi_raw — measured, not inferred",
    "20,156 events and 80 distinct hostnames over 30 days — a snapshot that drifts",
    "The Audit / Alerts schema split and the OCSF class",
    "That no XDM field is populated anywhere",
    "Fetch events enabled on both instances — XSIAM only",
    `The API behind ${exercisedCmds.length} of the ${nCommands} commands, exercised without changing tenant state — ${repeatableCmds.length} of those are freely repeatable, ${NOT_REPEATABLE.replace(/^koi-/, "")} is not`,
    `The ${mutatingCmds.length} state-changing commands were deliberately NOT run: ${mutatingCmds.map((n) => n.replace(/^koi-/, "")).join(", ")}`,
    "An invalid bearer token returns HTTP 401 (no 403 was ever observed)",
    "The two pack defects on the sharp-edges slide — the four other cards there are a documentation gap, two API observations and this tenant's configuration",
  ];
  s.addText(
    ok.map((li, k) => ({ text: li, options: { bullet: { indent: 13 }, breakLine: k < ok.length - 1 } })),
    { x: M + 0.32, y: 2.30, w: cw - 0.64, h: 3.0, fontSize: 10, color: BODY, fontFace: F, margin: 0, paraSpaceAfter: 3, lineSpacing: 13, valign: "top" }
  );

  const x2 = M + cw + 0.45;
  card(s, x2, 1.46, cw, 3.90);
  s.addText("Not verified", { x: x2 + 0.3, y: 1.64, w: cw - 0.6, h: 0.34, fontSize: 16, bold: true, color: AMBER, fontFace: F, margin: 0 });
  s.addText("stated as unverified, never asserted", { x: x2 + 0.3, y: 1.98, w: cw - 0.6, h: 0.26, fontSize: 10, color: MUTED, fontFace: MONO, margin: 0 });
  const gaps = [
    `Not one of the ${nCommands} commands was executed through XSIAM — no war-room output and no context mapping was observed`,
    "POST /investigations/search returns a 303 to /#/404, so demisto-sdk run cannot reach this tenant at all",
    "POST /incident returns 200 with an empty body and creates nothing",
    "An API-key user's playground is a malformed stub — every command there panics, including the built-in !Print",
    "So: XSOAR-side context mapping and human-readable output are asserted from the YAML and Koi.py, not observed",
    "The five state-changing commands, whose real behaviour is untested by design",
    "To close it: run the sweep from the XSIAM war room and compare against evidence/command-sweep.json",
  ];
  s.addText(
    gaps.map((li, k) => ({ text: li, options: { bullet: { indent: 13 }, breakLine: k < gaps.length - 1 } })),
    { x: x2 + 0.32, y: 2.30, w: cw - 0.64, h: 3.0, fontSize: 10, color: BODY, fontFace: F, margin: 0, paraSpaceAfter: 3, lineSpacing: 13, valign: "top" }
  );

  card(s, M, 5.48, W, 0.86, CARD_HI);
  s.addText(
    [
      { text: "How this deck is built:  ", options: { color: WHITE, bold: true, fontSize: 10.5 } },
      { text: `every command, argument, enum, context path and configuration value on these slides is read at build time from reference/marketplace-pack.json, derived mechanically from ${PACK.source.repo} ${PACK.source.path} (md5 ${PACK.source.md5}, checked against master ${PACK.source.verified_against_master}). Nothing about the command surface is hand-typed. The endpoint and auth details come from Koi.py, not the YAML.`, options: { color: BODY, fontSize: 10.5 } },
    ],
    { x: M + 0.3, y: 5.60, w: W - 0.6, h: 0.64, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" }
  );
  sourceTag(s, "VERIFIED_FACTS §1.1, §3, §4.1, §5 and §6.", 6.44);
  s.addNotes(
    `The API behind ${exercisedCmds.length} of the ${nCommands} commands was exercised, none of which change tenant state: ${exercisedCmds.join(", ")}. ` +
      `Of those, ${repeatableCmds.length} are freely repeatable; ${NOT_REPEATABLE} is not — its own description warns it may duplicate events, exceed rate limits or disrupt the fetch mechanism, and should_push_events writes into koi_koi_raw when true. ` +
      `The ${mutatingCmds.length} state-changing commands were deliberately not run: ${mutatingCmds.join(", ")}. ` +
      "Separately, none of the 13 was ever executed through XSIAM — a tenant limitation, recorded rather than papered over. " +
      "So no human-readable output, no war-room table and no context mapping was observed; those are asserted from the YAML and Koi.py."
  );
}

/* ============================================================================
   SLIDE 11 — Close
   ========================================================================== */
{
  const s = newSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.2, y: -2.2, w: 5.4, h: 5.4,
    fill: { color: ORANGE, transparency: 92 }, line: { color: ORANGE, width: 1 },
  });
  s.addText("IN ONE LINE", {
    x: M, y: 1.55, w: W, h: 0.3, fontSize: 12, bold: true, color: ORANGE, fontFace: F, charSpacing: 3, margin: 0,
  });
  s.addText("A supported client, and a collector on XSIAM.\nThe content layer is yours.", {
    x: M, y: 1.90, w: 9.6, h: 1.70, fontSize: 34, bold: true, color: WHITE, fontFace: F, margin: 0, lineSpacing: 42,
  });

  const takeaways = [
    ["Install it if", `you want ${nCommands} supported commands over the KOI inventory, policy and allow/block lists — and, on XSIAM, Alerts and Audit into koi_koi_raw with no code to maintain.`, ORANGE],
    ["Budget for", "normalisation and triage content. There are no rules, no playbooks and no dashboard in this pack.", CYAN],
    ["Check first", "that the other KOI pack is not installed. Same name, same integration id — one overwrites the other.", AMBER],
  ];
  const cw = (W - 0.7) / 3;
  takeaways.forEach(([t, d, c], i) => {
    const x = M + i * (cw + 0.35);
    card(s, x, 3.90, cw, 1.95);
    chip(s, x + 0.28, 4.14, String(i + 1), c);
    s.addText(t, { x: x + 0.28, y: 4.62, w: cw - 0.56, h: 0.32, fontSize: 13.5, bold: true, color: WHITE, fontFace: F, margin: 0 });
    s.addText(d, { x: x + 0.28, y: 4.96, w: cw - 0.56, h: 0.8, fontSize: 10.5, color: BODY, fontFace: F, margin: 0, lineSpacing: 13, valign: "top" });
  });
  s.addText(
    `KOI  ·  Marketplace pack v${PACK.pack.currentVersion}  ·  ${PACK.source.repo} / ${PACK.source.path}  ·  ${nCommands} commands  ·  integration only`,
    { x: M, y: 6.30, w: W, h: 0.3, fontSize: 11, color: MUTED, fontFace: MONO, margin: 0 }
  );
  s.addNotes("Close. Three decisions: install it for the API client and — on XSIAM, where the collector is enabled — the event collector; budget for the content layer; and check for the other pack first.");
}

/* ============================================================================
   WRITE
   ========================================================================== */
const out = path.join(__dirname, "KOI_Marketplace_Pack_Overview.pptx");

/* pptxgenjs stamps docProps/core.xml with the wall-clock time, which would make two
   runs differ byte-for-byte. Pin it to the date the upstream YAML was verified, and
   pin every zip entry's mtime, so the build is genuinely reproducible. */
const PINNED = `${PACK.source.verified_against_master}T00:00:00Z`;
const PINNED_DATE = new Date(PINNED);

pres
  .writeFile({ fileName: out })
  .then(async () => {
    const JSZip = require("jszip");
    const src = await JSZip.loadAsync(fs.readFileSync(out));
    const files = Object.keys(src.files).sort();
    const zip = new JSZip();
    for (const name of files) {
      if (src.files[name].dir) continue;
      let buf = await src.files[name].async("nodebuffer");
      if (name === "docProps/core.xml") {
        buf = Buffer.from(
          buf
            .toString("utf8")
            .replace(
              /(<dcterms:(?:created|modified)[^>]*>)[^<]*(<)/g,
              (_, a, b) => a + PINNED + b
            ),
          "utf8"
        );
      }
      zip.file(name, buf, { date: PINNED_DATE });
    }
    /* JSZip creates the implicit folder entries itself and stamps them with the
       wall clock, which made two runs differ in those bytes even though every
       file in them was identical. Pin those too, or "idempotent" is not true. */
    Object.keys(zip.files).forEach((name) => {
      if (zip.files[name].dir) zip.files[name].date = PINNED_DATE;
    });
    const rebuilt = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    fs.writeFileSync(out, rebuilt);
    console.log(
      `written ${out}  (${nCommands} commands, ${nArgs} args, ${nOutputDecls} outputs, ${nDistinctPaths} distinct paths, 11 slides)`
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
