/* Build "KOI — Marketplace Pack v1.2.3: Troubleshooting & Data Provenance Guide" (.docx)
 *
 * Pack under documentation: the OFFICIAL Marketplace KOI pack from demisto/content
 * (Packs/Koi, currentVersion 1.2.3, 13 commands, integration only).
 * NOT the custom in-house pack (v1.3.0, 26 commands).
 *
 * Sources of fact — nothing else is allowed in this document:
 *   ../reference/marketplace-pack.json  [YAML]  — mechanical extraction of the pinned Koi.yml.
 *                                                 Every command/argument/output table below is
 *                                                 built FROM this file at runtime.
 *   ../VERIFIED_FACTS.md                [LIVE]  — observed on tenant api-ayman.xdr.eu…, 20 Jul 2026.
 *                                       [INHERITED] — §8, carried from the custom-pack
 *                                                 investigation, NOT re-verified in this session.
 *   ../evidence/followup-probes.json    [LIVE]  — the raw per-instance probe results. The view
 *                                                 matrix in A5 and the inventory and view rows in
 *                                                 A7 — including the later unfiltered inventory
 *                                                 total per instance — are built FROM this file at
 *                                                 runtime, not transcribed.
 *
 * Run:
 *   export NODE_PATH=<repo>/node_modules
 *   node docs/build_troubleshooting.js
 * Idempotent: two runs produce the same file.
 */
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} = require("docx");
const fs = require("fs");
const path = require("path");

/* ============================ 0. Load the authority ============================ */

const PACK = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "reference", "marketplace-pack.json"), "utf8"));

/* [LIVE] Raw probe results, both instances. Loaded so the view matrix is read from the evidence
   file rather than retyped into this generator. */
const PROBES = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "evidence", "followup-probes.json"), "utf8"));
const INSTANCES = ["KOI_PAET", "KOI_PLTS"];

/* [LIVE] The EARLIER of the two sweeps run on 20 July 2026. Loaded so that a count which drifted
   between the two runs is printed as a pair read from both files, rather than one of them being
   picked silently. evidence/command-sweep.json is the earlier reading, evidence/followup-probes.json
   the later; both are correct as of their own run (VERIFIED_FACTS §7). */
const SWEEP = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "evidence", "command-sweep.json"), "utf8"));
const sweepInventory = inst => {
  const e = SWEEP.find(r => r.command === "koi-inventory-list" && r.instance === inst &&
    r.status === 200 && r.params && r.params.view === undefined);
  return e ? e.total_count : null;
};
const sweepView = (v, inst) => {
  const e = SWEEP.find(r => r.command === "koi-inventory-list" && r.instance === inst &&
    r.status === 200 && r.params && r.params.view === v);
  return e ? e.total_count : null;
};

const CMDS = [...PACK.commands].sort((a, b) => a.name.localeCompare(b.name));
const byName = Object.fromEntries(PACK.commands.map(c => [c.name, c]));
const arg = (cmd, name) => (byName[cmd].arguments || []).find(a => a.name === name);

/* Derived, at runtime, from the JSON — never hand-typed. */
const ALL_OUTPUT_PATHS = PACK.commands.flatMap(c => (c.outputs || []).map(o => o.contextPath));
const DISTINCT_PATHS = [...new Set(ALL_OUTPUT_PATHS)];
const DUP_PATHS = DISTINCT_PATHS.filter(p => ALL_OUTPUT_PATHS.filter(q => q === p).length > 1);
const NO_OUTPUT_CMDS = CMDS.filter(c => (c.outputs || []).length === 0).map(c => c.name);
const EXECUTION_CMDS = CMDS.filter(c => c.execution).map(c => c.name);
const pathsWithPrefix = pre => DISTINCT_PATHS.filter(
  p => p === pre || p.startsWith(pre + ".")).length;
const cmdsDeclaringPrefix = pre => CMDS.filter(c => (c.outputs || [])
  .some(o => o.contextPath.startsWith(pre + "."))).map(c => c.name);
/* Commands that actually COLLIDE under a prefix: those declaring at least one path that some other
   command also declares. Declaring a path under the prefix is not enough — koi-inventory-item-
   endpoints-list writes only Koi.Inventory.Endpoint.*, which no other command declares, so it
   overwrites nothing and nothing overwrites it. Computed, never hand-listed. */
const cmdsCollidingUnderPrefix = pre => CMDS.filter(c => (c.outputs || [])
  .some(o => o.contextPath.startsWith(pre + ".") && DUP_PATHS.includes(o.contextPath)))
  .map(c => c.name);
const cmdsUnderPrefixNotColliding = pre =>
  cmdsDeclaringPrefix(pre).filter(n => !cmdsCollidingUnderPrefix(pre).includes(n));
/* [LIVE] VERIFIED_FACTS §1.1 — the 8 commands whose API was actually called, read-only. */
const EXERCISED = ["koi-policy-list", "koi-allowlist-get", "koi-blocklist-get", "koi-inventory-list",
                   "koi-inventory-item-get", "koi-inventory-item-endpoints-list",
                   "koi-inventory-search", "koi-get-events"];
/* [LIVE] VERIFIED_FACTS §1.1 — every command that mutates state, whether or not it is flagged. */
const STATE_CHANGING = ["koi-policy-status-update", "koi-allowlist-items-add",
                        "koi-allowlist-items-remove", "koi-blocklist-items-add",
                        "koi-blocklist-items-remove"];

const VIEW_ARG = arg("koi-inventory-list", "view");
const VIEW_YAML = VIEW_ARG.predefined;                    /* [YAML] */
/* [LIVE] VERIFIED_FACTS §5.1 — the API states its own contract in its HTTP 400 body. */
const VIEW_API = ["agentic_ai", "ai_models", "all_items", "code_packages", "extensions",
                  "mcp_servers", "os_packages", "repositories", "software"];
const VIEW_MISSING = VIEW_API.filter(v => !VIEW_YAML.includes(v));
/* [LIVE] VERIFIED_FACTS §5.2 — observed HTTP 400 on the live API. */
const VIEW_REJECTED = ["browser_extensions", "ide_extensions", "packages"];
/* [LIVE] Every one of these values was probed individually on BOTH instances. The results are read
   out of evidence/followup-probes.json below — nothing here is inferred and nothing is unprobed. */
const VIEW_ALL = [...new Set([...VIEW_API, ...VIEW_REJECTED])].sort();
const probe = (v, inst) => PROBES.views.find(r => r.view === v && r.instance === inst);
/* Fail the build rather than print an unprobed cell: every value must exist for every instance. */
const missingProbe = VIEW_ALL.flatMap(v => INSTANCES.filter(i => !probe(v, i)).map(i => `${v}@${i}`));
if (missingProbe.length) {
  console.error("FATAL: no probe result for: " + missingProbe.join(", "));
  process.exit(1);
}
const num = n => Number(n).toLocaleString("en-US");
/* Status is one column only when both instances agree; if they ever diverge, both are printed. */
const viewStatus = v => {
  const [a, b] = INSTANCES.map(i => probe(v, i).status);
  return a === b ? String(a) : `${INSTANCES[0]} ${a} / ${INSTANCES[1]} ${b}`;
};
const viewCount = (v, inst) => {
  const r = probe(v, inst);
  return r.status === 200 ? num(r.total_count) : "—";
};
const viewZeroOnBoth = v => INSTANCES.every(i => probe(v, i).status === 200 && probe(v, i).total_count === 0);

/* These counts DRIFT: the tenant's inventory grew between the two sweeps. Where the two evidence
   files disagree the figure is rendered "earlier → later" — never one number, and never the two
   readings in different places as if one were wrong. Computed, so a new evidence file changes the
   text automatically. */
const viewCountDrift = (v, inst) => {
  const later = probe(v, inst);
  if (later.status !== 200) return "—";
  const earlier = sweepView(v, inst);
  return (earlier === null || earlier === later.total_count)
    ? num(later.total_count)
    : `${num(earlier)} → ${num(later.total_count)}`;
};
const DRIFTED_VIEWS = VIEW_ALL.flatMap(v => INSTANCES
  .filter(i => probe(v, i).status === 200 && sweepView(v, i) !== null &&
               sweepView(v, i) !== probe(v, i).total_count)
  .map(i => ({ view: v, instance: i, earlier: sweepView(v, i), later: probe(v, i).total_count })));
const DRIFT_SENTENCE = DRIFTED_VIEWS.map(d =>
  `view=${d.view} on ${d.instance} read ${num(d.earlier)} in the earlier sweep and ` +
  `${num(d.later)} a few hours later the same day`).join("; ");

/* [LIVE] Inventory size with no view argument at all, per instance. The earlier reading comes from
   command-sweep.json, the later one from the unfiltered_inventory section of followup-probes.json —
   so both readings of both instances are read from a file, and neither is hand-typed here. That
   section probed each instance twice inside the one run; the two attempts must agree, and the build
   fails rather than print a figure if they ever do not. */
const NO_VIEW_TOTAL = Object.fromEntries(INSTANCES.map(i => [i, sweepInventory(i)]));
if (INSTANCES.some(i => NO_VIEW_TOTAL[i] === null)) {
  console.error("FATAL: no no-view inventory total in evidence/command-sweep.json");
  process.exit(1);
}
const laterInventoryAttempts = inst => (PROBES.unfiltered_inventory || [])
  .filter(r => r.instance === inst && r.status === 200)
  .map(r => r.total_count);
const NO_VIEW_LATER = Object.fromEntries(INSTANCES.map(i => {
  const a = laterInventoryAttempts(i);
  if (!a.length) {
    console.error("FATAL: no unfiltered_inventory probe for " + i + " in evidence/followup-probes.json");
    process.exit(1);
  }
  if (new Set(a).size !== 1) {
    console.error("FATAL: unfiltered_inventory attempts disagree within one run on " + i + ": " + a.join(", "));
    process.exit(1);
  }
  return [i, a[0]];
}));
/* Instances whose no-view total actually MOVED between the two runs. KOI_PAET read the same figure
   in both sweeps, so it is not one of them and must never be described as drifting. */
const INV_DRIFTED = INSTANCES.filter(i => NO_VIEW_LATER[i] !== NO_VIEW_TOTAL[i]);
const INV_STEADY = INSTANCES.filter(i => !INV_DRIFTED.includes(i));
const INV_DRIFT_SENTENCE = INV_DRIFTED.map(i =>
  `the no-view inventory total on ${i} rose from ${num(NO_VIEW_TOTAL[i])} to ${num(NO_VIEW_LATER[i])}`).join("; ");
const INV_STEADY_SENTENCE = INV_STEADY.map(i =>
  `${i} returned ${num(NO_VIEW_TOTAL[i])} in both sweeps`).join("; ");
const invDrift = inst =>
  (NO_VIEW_LATER[inst] && NO_VIEW_LATER[inst] !== NO_VIEW_TOTAL[inst])
    ? `${num(NO_VIEW_TOTAL[inst])} → ${num(NO_VIEW_LATER[inst])}`
    : num(NO_VIEW_TOTAL[inst]);

/* koi-inventory-search failure modes, read from the same evidence file. Two are HTTP responses
   observed on both instances; the third is a code fact with no API call behind it. */
const searchCase = (c, inst) => PROBES.search_failure_modes.find(r => r.case === c && r.instance === inst);
const searchStatus = c => {
  const [a, b] = INSTANCES.map(i => searchCase(c, i).status);
  return a === b ? String(a) : `${INSTANCES[0]} ${a} / ${INSTANCES[1]} ${b}`;
};
const SEARCH_OK = Object.fromEntries(
  INSTANCES.map(i => [i, num(searchCase("well-formed filter", i).total_count)]));
/* [CODE] VERIFIED_FACTS §5.2 — the ONLY bad value that appears in the shipped command_examples.txt. */
const VIEW_IN_SHIPPED_EXAMPLE = ["browser_extensions"];

/* [YAML] Commands that are non-mutating but still not safe to re-run. koi-get-events is a GET, yet
   the pack's own description warns it may duplicate events, exhaust rate limits or disrupt the
   fetch loop, and its should_push_events argument writes into koi_koi_raw when true. Derived from
   the pack JSON so the flag cannot drift from the argument it depends on. */
const NOT_REPEATABLE = CMDS.filter(c => /development and debugging only/i.test(c.description || ""))
  .map(c => c.name);
const PUSH_ARG = arg("koi-get-events", "should_push_events");

/* The badge vocabulary of section 5, defined once. The section's preamble counts these keys, so
   the number it quotes cannot drift from the number of badges the blocks below it can carry. */
const BADGE = {
  exercised:     "API exercised read-only, 20 Jul 2026",
  notRun:        "NOT RUN — changes tenant state",
  execution:     "execution: true (potentially harmful)",
  unflagged:     "changes tenant state, NOT flagged execution: true",
  noOutputs:     "no context outputs — cannot be branched on",
  notRepeatable: "NOT safely repeatable — see the description above",
};
const BADGE_KINDS = Object.keys(BADGE).length;

/* [LIVE] VERIFIED_FACTS §4.1 — endpoint map read from Koi.py. Keyed by command name so the
   table is still assembled from the JSON command list at runtime. */
const ENDPOINTS = {
  "koi-get-events":                    ["GET",         "/alerts and /audit-logs"],
  "koi-policy-list":                   ["GET",         "/policies"],
  "koi-policy-status-update":          ["PUT",         "/policies/{id}"],
  "koi-allowlist-get":                 ["GET",         "/policies/allowlist"],
  "koi-allowlist-items-add":           ["POST",        "/policies/allowlist"],
  "koi-allowlist-items-remove":        ["DELETE",      "/policies/allowlist"],
  "koi-blocklist-get":                 ["GET",         "/policies/blocklist"],
  "koi-blocklist-items-add":           ["POST",        "/policies/blocklist"],
  "koi-blocklist-items-remove":        ["DELETE",      "/policies/blocklist"],
  "koi-inventory-list":                ["GET",         "/inventory"],
  "koi-inventory-search":              ["POST",        "/inventory/search"],
  "koi-inventory-item-get":            ["GET",         "/inventory/{item_id}"],
  "koi-inventory-item-endpoints-list": ["GET",         "/inventory/{item_id}/endpoints"],
};
const missingEndpoint = CMDS.filter(c => !ENDPOINTS[c.name]).map(c => c.name);
if (missingEndpoint.length) {
  console.error("FATAL: no endpoint recorded for: " + missingEndpoint.join(", "));
  process.exit(1);
}

/* Commands that DO NOT exist in this pack. Listed only to be denied. */
const NOT_IN_THIS_PACK = [
  "koi-devices-list", "koi-device-inventory-get", "koi-koidex-risk-report", "koi-koidex-search",
  "koi-remediations-list", "koi-approval-requests-list", "koi-findings-list", "koi-users-list",
  "koi-groups-list", "koi-runtime-policies-list", "koi-runtime-policy-get",
  "koi-fetch-context-get", "koi-fetch-context-set",
];

/* ============================ 0b. Companion pack (SEPARATE, additional content) ============================ */
/* [PACK] The optional companion pack shipped alongside this one. It is a DIFFERENT pack — no
   integration and no commands of its own — so nothing about it comes from marketplace-pack.json.
   Its name and version are read from its own pack_metadata.json and its contents are counted from
   the directory, so the cover note's figures cannot drift from what the pack actually contains.
   The build fails rather than print a guessed figure if the pack or its content is missing. */
const EXT_DIR = path.join(__dirname, "..", "Packs", "KoiContentExtension");
const countFiles = (dir, re) => {
  try { return fs.readdirSync(dir).filter(f => re.test(f)).length; } catch { return 0; }
};
let COMPANION;
try {
  const meta = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "pack_metadata.json"), "utf8"));
  COMPANION = {
    name: meta.name,                    /* "KOI Content Extension" */
    id: "KoiContentExtension",
    version: meta.currentVersion,
    support: meta.support,
    playbooks: countFiles(path.join(EXT_DIR, "Playbooks"), /^playbook-.*\.yml$/),
    dashboards: countFiles(path.join(EXT_DIR, "XSIAMDashboards"), /\.json$/),
    hasParsing: countFiles(path.join(EXT_DIR, "ParsingRules", "KoiContentExtension"), /\.xif$/) > 0,
    hasModeling: countFiles(path.join(EXT_DIR, "ModelingRules", "KoiContentExtension"), /\.xif$/) > 0,
  };
} catch (e) {
  console.error("FATAL: cannot read companion pack Packs/KoiContentExtension — " + e.message);
  process.exit(1);
}
if (!COMPANION.playbooks || !COMPANION.dashboards || !COMPANION.hasParsing || !COMPANION.hasModeling) {
  console.error("FATAL: companion pack Packs/KoiContentExtension is missing expected content " +
    "(playbooks/dashboard/parsing/modeling)");
  process.exit(1);
}
const COMPANION_ADDS =
  `parsing rules, modeling rules, ${COMPANION.playbooks} playbooks and ` +
  (COMPANION.dashboards === 1 ? "a dashboard" : `${COMPANION.dashboards} dashboards`);

/* [LIVE] VERIFIED_FACTS §7c — the event `marketplace` vocabulary is NOT the API/YAML vocabulary.
   Left column: the short form as it appears in koi_koi_raw. Right: the long form the API and the
   pack YAML `predefined` list use. api === null means the value is not a marketplace at all
   (built_in and side_loaded are installation_method values leaking into the field; ollama is simply
   absent from the API's list). Event/API item counts are a 21 Jul 2026 snapshot and drift — the
   MAPPING (left → right) is what is load-bearing. */
const MARKETPLACE_MAP = [
  { event: "software_windows",          events: 5301, api: "windows",                   items: 214 },
  { event: "pypi",                      events: 4674, api: "pypi",                      items: 1990 },
  { event: "chrome",                    events: 891,  api: "chrome_web_store",          items: 63 },
  { event: "built_in",                  events: 829,  api: null,                        items: null },
  { event: "npm",                       events: 775,  api: "npm",                       items: 325 },
  { event: "software_mac",              events: 617,  api: "mac",                       items: 192 },
  { event: "homebrew",                  events: 231,  api: "homebrew",                  items: 322 },
  { event: "vsc",                       events: 175,  api: "vscode",                    items: 64 },
  { event: "chocolatey",                events: 91,   api: "chocolatey",                items: 28 },
  { event: "cursor",                    events: 88,   api: "cursor",                    items: 11 },
  { event: "github",                    events: 65,   api: "github_mcp_registry",       items: 0 },
  { event: "edge",                      events: 48,   api: "edge_add_ons",              items: 11 },
  { event: "firefox",                   events: 19,   api: "firefox_add_ons",           items: 22 },
  { event: "docker",                    events: 15,   api: "docker",                    items: 5 },
  { event: "npp",                       events: 12,   api: "notepad++",                 items: 5 },
  { event: "openvsx",                   events: 10,   api: "open_vsx_registry",         items: 0 },
  { event: "jet",                       events: 5,    api: "jetbrains",                 items: 1 },
  { event: "ollama",                    events: 5,    api: null,                        items: null },
  { event: "claude_desktop_extensions", events: 5,    api: "claude_desktop_extensions", items: 3 },
  { event: "side_loaded",               events: 1,    api: null,                        items: null },
];
/* [YAML] Commands whose marketplace argument is validated against the pack's predefined long-form
   list. Derived from the JSON so the symptom cannot name a command that lacks the argument. */
const MKT_ARG = c => ((byName[c] && byName[c].arguments) || []).find(a => a.name === "marketplace");
const MARKETPLACE_CMDS = CMDS.filter(c => MKT_ARG(c.name)).map(c => c.name);
const MARKETPLACE_CMDS_REQUIRED = CMDS.filter(c => { const a = MKT_ARG(c.name); return a && a.required; })
  .map(c => c.name);
const MARKETPLACE_LONG = (() => {
  const a = CMDS.map(c => MKT_ARG(c.name)).find(x => x && (x.predefined || []).length);
  return a ? a.predefined : [];
})();
/* Guard: every long form the mapping targets must be a real YAML value. Fail the build rather than
   print a mapping that has silently drifted from the pack. */
const badMap = MARKETPLACE_MAP.filter(m => m.api && !MARKETPLACE_LONG.includes(m.api)).map(m => m.event);
if (badMap.length) {
  console.error("FATAL: marketplace mapping targets a value not in the pack YAML: " + badMap.join(", "));
  process.exit(1);
}
/* Values that COINCIDE between the event field and the API name (pass through unmapped), values that
   DIFFER (must be mapped), and values that are not a marketplace at all. Computed from the §7c table
   data — the authoritative per-value evidence. NB: §7c's prose says "only npm and pypi" coincide, but
   its own table shows several more (homebrew, chocolatey, cursor, docker, claude_desktop_extensions);
   the table is trusted here. npm and pypi must be among the matches, or the mapping has drifted. */
const MKT_MATCH = MARKETPLACE_MAP.filter(m => m.api === m.event).map(m => m.event);
const MKT_MAP_NEEDED = MARKETPLACE_MAP.filter(m => m.api && m.api !== m.event).map(m => m.event);
const MKT_NO_API = MARKETPLACE_MAP.filter(m => m.api === null).map(m => m.event);
if (!MKT_MATCH.includes("npm") || !MKT_MATCH.includes("pypi")) {
  console.error("FATAL: npm and pypi must map to themselves in the marketplace mapping");
  process.exit(1);
}

/* ============================ 1. Visual language ============================ */
/* Colour tokens, fonts, table style and heading hierarchy reused from the custom pack's
   docs/build_troubleshooting.js. Content is not reused. */

const ORANGE = "E8551F";   /* Part A / pack-specific headings */
const BLUE   = "1D4ED8";   /* Part B / inherited headings — deliberately a different accent */
const SLATE  = "1F2937";
const GRAY   = "6B7280";
const LIGHT  = "F3F4F6";
const RED    = "B42318";
const GREEN  = "1F7A3D";
const AMBER  = "92400E";
const HEADER_BG = "334155";
const INHERIT_BG = "EFF4FF";

/* Text column between the page margins. Every table spans it exactly, so table edges line up
   with the body text instead of stopping short of it. */
const TW = 9840;

const p = (text, o = {}) =>
  new Paragraph({
    spacing: { after: 120, ...(o.spacing || {}) },
    alignment: o.alignment,
    keepNext: o.keepNext,
    children: [new TextRun({ text, size: o.size || 22, bold: o.bold, italics: o.italics,
      color: o.color || SLATE, font: o.font || "Calibri" })],
  });

const rich = (runs, o = {}) =>
  new Paragraph({
    spacing: { after: 120, ...(o.spacing || {}) },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
    indent: o.fill ? { left: 120, right: 120 } : undefined,
    keepNext: o.keepNext,
    children: runs.map(r => new TextRun({ size: 22, color: SLATE, font: "Calibri", ...r })),
  });

/* Headings register themselves so the contents page is generated, not maintained by hand.
   Command-reference headings (koi-*) are excluded — they are listed in section 1.1 already. */
const OUTLINE = [];
const h1 = (t, color = ORANGE) => {
  OUTLINE.push({ level: 1, text: t, color });
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 },
    keepNext: true, keepLines: true,
    children: [new TextRun({ text: t, bold: true, size: 32, color, font: "Calibri" })] });
};
const h2 = (t, color = SLATE) => {
  if (!t.startsWith("koi-")) OUTLINE.push({ level: 2, text: t, color });
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 },
    keepNext: true, keepLines: true,
    children: [new TextRun({ text: t, bold: true, size: 26, color, font: "Calibri" })] });
};

const bullet = (t, o = {}) => new Paragraph({
  numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 },
  children: (Array.isArray(t) ? t : [{ text: t }]).map(r =>
    new TextRun({ size: 22, color: SLATE, font: "Calibri", ...r })), ...o });

let __inst = 0;
const newStep = () => { const instance = ++__inst;
  return t => new Paragraph({ numbering: { reference: "steps", level: 0, instance },
    spacing: { after: 80 },
    children: (Array.isArray(t) ? t : [{ text: t }]).map(r =>
      new TextRun({ size: 22, color: SLATE, font: "Calibri", ...r })) }); };

/* Code lines. keepLines + keepNext hold a multi-line block (and the sentence that explains it)
   together, so a two-line example is never split across a page boundary. */
const code = t => new Paragraph({
  spacing: { after: 60 }, shading: { type: ShadingType.CLEAR, fill: LIGHT },
  /* no side indent: the longest verified command line (101 chars) needs the whole text column */
  keepLines: true, keepNext: true,
  children: [new TextRun({ text: t, font: "Consolas", size: 16, color: "111827" })] });

/* A cell's text may contain "\n" — each line becomes its own paragraph, so a list of
   command names never breaks mid-name at one of its own hyphens. */
const cell = (t, { w, header = false, mono = false, monoSize, bold = false, color, fill } = {}) =>
  new TableCell({
    width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: header ? { type: ShadingType.CLEAR, fill: HEADER_BG }
                    : (fill ? { type: ShadingType.CLEAR, fill } : undefined),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: String(t).split("\n").map(line => new Paragraph({
      spacing: { after: 0 }, children: [new TextRun({
        text: line, size: header ? 20 : (mono && monoSize ? monoSize : 19), bold: header || bold,
        color: header ? "FFFFFF" : (color || SLATE), font: mono ? "Consolas" : "Calibri" })] })),
  });

/* opts: mono[] column indexes in Consolas, monoSize override for those columns,
   boldCol[] column indexes bold, fill: body-row shading, noHeader: treat row 0 as a body row.
   Every row is cantSplit: a row moves to the next page whole rather than tearing in half. */
const table = (widths, rows, opts = {}) => new Table({
  columnWidths: widths, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  rows: rows.map((r, i) => {
    const isHeader = i === 0 && !opts.noHeader;
    return new TableRow({ tableHeader: isHeader, cantSplit: true,
      children: r.map((t, j) => cell(String(t), { w: widths[j], header: isHeader,
        mono: !isHeader && (opts.mono || []).includes(j),
        monoSize: opts.monoSize,
        bold: !isHeader && (opts.boldCol || []).includes(j),
        fill: opts.fill,
        color: !isHeader && (opts.colColor || {})[j] })) });
  }) });

const hr = () => new Paragraph({ spacing: { after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ORANGE } }, children: [] });

/* Evidence tag, rendered inline: [LIVE] / [YAML] / [CODE] / [PACK] / [INHERITED] / [DERIVED] */
const TAGCOL = { LIVE: GREEN, YAML: BLUE, CODE: "6D28D9", PACK: "0F766E", INHERITED: AMBER,
                 DERIVED: GRAY, UNVERIFIED: RED };
const tag = k => ({ text: "[" + k + "] ", bold: true, size: 18, color: TAGCOL[k] });

/* Callout box: coloured left rule + tinted fill. keepLines so the tinted box is never
   torn in half by a page break. */
const callout = (label, text, color = RED, fill = LIGHT) => new Paragraph({
  spacing: { before: 120, after: 160 },
  shading: { type: ShadingType.CLEAR, fill },
  indent: { left: 160, right: 160 }, keepLines: true,
  border: { left: { style: BorderStyle.SINGLE, size: 18, color, space: 8 } },
  children: [
    new TextRun({ text: label + "  ", bold: true, size: 22, color, font: "Calibri" }),
    new TextRun({ text, size: 22, color: SLATE, font: "Calibri" }),
  ],
});

/* Symptom block: the repeating unit of Part A. */
const symptom = (n, title, { symptomText, cause, evidence, fix, extra = [] }) => [
  h2(`A${n}.  ${title}`),
  table([1500, TW - 1500], [
    ["Symptom", symptomText],
    ["Cause", cause],
    ["Evidence", evidence],
    ["Do this", fix],
  ], { noHeader: true, boldCol: [0], colColor: { 0: ORANGE } }),
  new Paragraph({ spacing: { after: 80 }, children: [] }),
  ...extra,
];

/* ============================ 2. Cover ============================ */

const cover = [
  new Paragraph({ spacing: { before: 1900, after: 100 }, children: [
    new TextRun({ text: "KOI", bold: true, size: 72, color: ORANGE, font: "Calibri" })] }),
  new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: "Marketplace Content Pack — Troubleshooting & Data Provenance",
      bold: true, size: 34, color: SLATE, font: "Calibri" })] }),
  hr(),
  new Paragraph({ spacing: { after: 240 }, children: [
    new TextRun({ text: `The official KOI pack from demisto/content — Packs/Koi, version ${PACK.pack.currentVersion}, ${PACK.counts.commands} commands, integration only.`,
      size: 26, color: GRAY, font: "Calibri" })] }),
  callout("READ THIS FIRST",
    `Two different content packs are called KOI. Both use integration id "${PACK.integration.id}", ` +
    `both are category ${PACK.integration.category}, both are authored by "${PACK.pack.author}", both use koi-* commands. ` +
    `This document describes ONLY the Marketplace pack, version ${PACK.pack.currentVersion}. ` +
    "It does not apply to the custom in-house pack (v1.3.0, 26 commands), which is a different implementation.",
    RED, "FEF2F2"),
  table([2600, TW - 2600], [
    ["Document", "KOI Marketplace Pack — Troubleshooting & Data Provenance Guide v1.0"],
    ["Pack", `${PACK.pack.name} — ${PACK.source.repo} / ${PACK.source.path}`],
    ["Pack version", PACK.pack.currentVersion],
    ["Integration", `${PACK.integration.display} (id ${PACK.integration.id}), fromversion ${PACK.integration.fromversion}`],
    ["Docker image", PACK.integration.dockerimage],
    ["Marketplaces", PACK.pack.marketplaces.join(", ")],
    ["Command surface", `${PACK.counts.commands} commands · ${PACK.counts.arguments} arguments · ${PACK.counts.outputs} output declarations`],
    ["Source pinned at", `md5 ${PACK.source.md5}, byte-identical to master on ${PACK.source.verified_against_master}`],
    ["Live verification", "Tenant api-ayman.xdr.eu.paloaltonetworks.com, instances KOI_PAET and KOI_PLTS, 20–21 July 2026. API-side only: the API behind 8 of the 13 commands was exercised read-only; the endpoints behind the 5 state-changing commands were not called, and no koi-* command was executed through XSIAM (section 3)"],
    ["Companion pack", `${COMPANION.name} (${COMPANION.id}) v${COMPANION.version} — SEPARATE, additional content. Not part of this pack. See the note below.`],
  ], { noHeader: true, boldCol: [0], colColor: { 0: SLATE } }),
  callout("OPTIONAL COMPANION PACK — SEPARATE, ADDITIONAL CONTENT",
    `A second, separate content pack, ${COMPANION.id} ("${COMPANION.name}", v${COMPANION.version}, ` +
    `${COMPANION.support}-supported), is published alongside this one. It ships NO integration and NO ` +
    `commands of its own; it adds ${COMPANION_ADDS} on top of the KOI integration, normalising and ` +
    `modelling the koi_koi_raw dataset this pack produces. It is NOT part of the Marketplace KOI pack, ` +
    `and nothing in this troubleshooting guide depends on it. Where a fix below names a "KOI Ext" ` +
    `playbook, that is this companion pack, flagged as such.`,
    BLUE, INHERIT_BG),
  new Paragraph({ children: [new PageBreak()] }),
];

/* ============================ 3. How to read this ============================ */

const howToRead = [
  h1("How to Read This Guide"),
  p("Every load-bearing claim in this guide is traceable to one of the four inputs listed in the appendix, and where the source matters it is marked with an inline evidence tag. Tags are applied by hand and are not applied to every sentence — the Symptom / Cause / Do this rows of Part A are advice composed from the tagged Evidence row directly beneath them, not independent claims. The tags mean:"),
  table([1700, TW - 1700], [
    ["Tag", "Meaning"],
    ["[YAML]", `Extracted mechanically from the pinned pack YAML (md5 ${PACK.source.md5}) and rebuilt into this document at generation time. Not transcribed by hand.`],
    ["[LIVE]", "Observed on the tenant or against the KOI API on 20 July 2026. The observation is recorded in VERIFIED_FACTS.md, and the per-instance probe results in evidence/followup-probes.json."],
    ["[CODE]", "Read from a pack source file that is NOT the integration YAML — Koi.py, or command_examples.txt. The YAML and the Python are different artefacts, so these are not tagged [YAML]. Read from source; not executed."],
    ["[PACK]", "Established by inspecting the pack directory itself — what the pack does and does not contain (for example: it ships an integration only, no parsing rules and no modeling rules). That is a filesystem fact about the pack, not an observation of the tenant or the API, so it is not tagged [LIVE]; and the integration YAML carries no inventory of the pack's other contents, so it is not tagged [YAML] either."],
    ["[INHERITED]", "Carried forward from the earlier custom-pack investigation. Pack-independent, but NOT re-verified in this session. Part B is entirely of this kind."],
    ["[DERIVED]", "Composed here from tagged facts — typically a query string assembled from verified dataset and field names. The facts are verified; this exact string was not itself executed."],
    ["[UNVERIFIED]", "Stated as unknown. Never asserted as fact."],
  ], { mono: [0] }),
  p("The document has two parts, and they are kept visually distinct on purpose:", { spacing: { before: 200 } }),
  bullet([{ text: "Part A", bold: true, color: ORANGE },
          { text: " (orange headings) — troubleshooting specific to this Marketplace pack, on this tenant, grounded in this session's verification. Each block's Evidence row says whether the symptom was observed here or reasoned from evidence gathered here." }]),
  bullet([{ text: "Part B", bold: true, color: BLUE },
          { text: " (blue headings, tinted background) — endpoint-side findings inherited from the custom-pack investigation. Pack-independent, not re-verified here." }]),
  callout("CASING", "Context paths in this pack are inconsistent and must stay that way: events are written to " +
    "KOI.Event.* (upper), everything else to Koi.* (mixed). \"Correcting\" either one breaks the DT paths in " +
    "any playbook or layout that reads them.", AMBER, "FFFBEB"),
  new Paragraph({ children: [new PageBreak()] }),
];

/* Contents is assembled at the end, from OUTLINE — see buildContents(). */

/* ============================ 4. What you are looking at ============================ */

const identity = [
  h1("1. Identifying the Pack Before You Troubleshoot Anything"),
  p("Half of all KOI troubleshooting time is spent debugging the wrong pack. Establish which one is installed before anything else."),

  h2("1.1 The command surface is the fingerprint"),
  rich([tag("YAML"), { text: `This pack ships exactly ${PACK.counts.commands} commands. If the instance you are looking at offers more than that — in particular anything device-centric — you are not on this pack.` }]),
  table([4000, 750, 900, TW - 5650],
    [["Command", "Args", "Outputs", "API call"]].concat(
      CMDS.map(c => [c.name, String((c.arguments || []).length), String((c.outputs || []).length),
                     ENDPOINTS[c.name][0] + " " + ENDPOINTS[c.name][1]])),
    { mono: [0, 3] }),
  rich([tag("YAML"), { text: `Base URL ${PACK.configuration.find(c => c.name === "url").defaultvalue} — that is the default of the pack's url parameter, and it is the only part of the API contract the YAML states. ` },
        tag("CODE"), { text: "The /api/external/v2 path suffix, the Authorization: Bearer <api_key> header and every endpoint path in the table above were read from Koi.py, not from the YAML (VERIFIED_FACTS §4.1). " },
        tag("LIVE"), { text: "Eight of those endpoints were then called directly and answered as described; the other five were not called at all — see the note below." }],
       { spacing: { before: 120 } }),
  callout("EIGHT OF THE THIRTEEN WERE EXERCISED — NOT ALL OF THEM",
    "The API behind 8 commands was called read-only on 20 July 2026: koi-policy-list, koi-allowlist-get, " +
    "koi-blocklist-get, koi-inventory-list, koi-inventory-item-get, koi-inventory-item-endpoints-list, " +
    "koi-inventory-search and koi-get-events. The 5 state-changing commands (koi-policy-status-update, " +
    "koi-allowlist-items-add / -remove, koi-blocklist-items-add / -remove) were deliberately NOT run, because " +
    "each one mutates tenant state. Their rows in the table above are the endpoint Koi.py would call, not an " +
    "observation. Nothing in this guide asserts that all 13 commands were exercised.",
    AMBER, "FFFBEB"),
  callout("\"READ-ONLY\" DESCRIBES HOW THEY WERE CALLED — SEVEN OF THE EIGHT ARE REPEATABLE, ONE IS NOT",
    "koi-get-events is a GET, but it is not safe to re-run casually. The pack's own description of it says to " +
    "\"use this command for development and debugging only, as it may produce duplicate events, exceed API rate " +
    "limits, or disrupt the fetch mechanism\", and its should_push_events argument (default " +
    (PUSH_ARG ? PUSH_ARG.defaultValue : "false") + ") pushes the events it retrieves into XSIAM — into koi_koi_raw — " +
    "when set to true. That argument is handled by the integration, not by the API: it is not a parameter of " +
    "GET /alerts or /audit-logs, and no such push could have happened here, because what was exercised on 20 July " +
    "2026 was an HTTP request to those two endpoints, made directly and read-only. The command itself was never " +
    "executed. Of the 8 non-mutating commands, 7 are freely repeatable and this one is not — do not put it in a " +
    "\"safe to repeat\" list without that caveat.",
    AMBER, "FFFBEB"),

  h2("1.2 Commands that do not exist here"),
  p("These belong to the custom in-house pack only. On this pack they fail as unknown commands, and any playbook, layout or dashboard built on them is inert:"),
  table([TW / 2, TW / 2], (() => {
    const rows = [["Not in this pack", "Not in this pack"]];
    for (let i = 0; i < NOT_IN_THIS_PACK.length; i += 2)
      rows.push([NOT_IN_THIS_PACK[i], NOT_IN_THIS_PACK[i + 1] || ""]);
    return rows;
  })(), { mono: [0, 1] }),
  callout("NO DEVICE PREFIX",
    "There is no Koi.Device.* context anywhere in this pack — not in the YAML, not in Koi.py, not in the README. " +
    "The model is item-centric: endpoints are reached only from an item, through Koi.Inventory.Endpoint.*, which " +
    "only koi-inventory-item-endpoints-list writes. If a query, layout or playbook reads Koi.Device.*, it will " +
    "never resolve.", RED, "FEF2F2"),

  h2("1.3 Context prefixes, and where they collide"),
  rich([tag("YAML"), { text: `${PACK.counts.outputs} output declarations span only ${DISTINCT_PATHS.length} distinct context paths. The ${PACK.counts.outputs - DISTINCT_PATHS.length} of difference is a count of redundant declarations, not of paths: ${DUP_PATHS.length} distinct paths are declared by more than one command, and those commands overwrite each other's context.` }]),
  table([2000, 900, 1400, TW - 4300],
    [["Prefix", "Paths", "Declared by", "Commands"]].concat(
      PACK.contextPrefixes.map(pre => {
        const cs = cmdsDeclaringPrefix(pre);
        /* one command per line — a command name must never break at its own hyphen */
        return [pre, String(pathsWithPrefix(pre)), String(cs.length), cs.join("\n")];
      })),
    { mono: [0, 3] }),
  rich([{ text: "Consequence: ", bold: true },
        { text: `the last command to run wins — but only among commands that share a path. ${cmdsCollidingUnderPrefix("Koi.Inventory").join(", ")} declare the same ${DUP_PATHS.filter(p => p.startsWith("Koi.Inventory.") && !p.startsWith("Koi.Inventory.Endpoint.")).length} Koi.Inventory item paths, and both policy commands declare the same Koi.Policy paths. In a playbook that calls two of them, read the context immediately after each call or copy it to a distinct key.` }],
       { spacing: { before: 160 } }),
  rich([{ text: "Not part of that: ", bold: true },
        { text: `${cmdsUnderPrefixNotColliding("Koi.Inventory").join(", ")} appears in the table above under Koi.Inventory, but it writes only the nested Koi.Inventory.Endpoint.* paths, which no other command declares. It cannot overwrite the three item-level commands and they cannot overwrite it.` }]),

  h2("1.4 Commands you cannot branch on"),
  rich([tag("YAML"), { text: `${NO_OUTPUT_CMDS.length} commands declare no outputs at all — they return a war-room message only. A playbook cannot test their result:` }]),
  ...NO_OUTPUT_CMDS.map(n => bullet([{ text: n, font: "Consolas", size: 20 }])),
  rich([tag("YAML"), { text: `${EXECUTION_CMDS.length} commands are marked execution: true (potentially harmful) and will prompt or be blocked by policy accordingly: ` },
        { text: EXECUTION_CMDS.join(", "), font: "Consolas", size: 20 }]),

  h2("1.5 Five commands change state; the pack flags only two of them"),
  rich([tag("YAML"), { text: `execution: true is set on ${EXECUTION_CMDS.join(" and ")} only. ` },
        tag("CODE"), { text: `But ${STATE_CHANGING.length} of the ${PACK.counts.commands} commands mutate tenant state — that is read from the HTTP method each one issues in Koi.py (PUT, POST or DELETE), not from having watched any of them run: none of the five was executed here. The other ${STATE_CHANGING.length - EXECUTION_CMDS.length} carry no flag at all, so they do not get the confirmation treatment execution: true triggers.` }]),
  table([3800, 1900, TW - 5700],
    [["Command", "execution: true", "What it does"]].concat(
      STATE_CHANGING.map(n => [
        n,
        byName[n].execution ? "yes" : "no — unflagged",
        ENDPOINTS[n][0] + " " + ENDPOINTS[n][1] + " — changes governance state",
      ])), { mono: [0, 2], monoSize: 16, colColor: { 1: RED } }),
  callout("DO NOT READ \"NOT FLAGGED\" AS \"SAFE\"",
    "The two add commands and koi-policy-status-update change the tenant's allowlist, blocklist and policy state " +
    "with no harmful-command flag. None of these five was run during verification, precisely because they mutate " +
    "state — so this guide describes no observed behaviour for any of them. Treat \"not flagged\" as \"not flagged\".",
    RED, "FEF2F2"),
];

/* ============================ 5. The data path ============================ */

const dataPath = [
  h1("2. The Data Path on This Tenant"),
  p("Two things flow out of this integration and they travel by different routes. Knowing which one you are debugging saves the whole investigation."),
  code("commands: war room -> instance -> engine -> https://api.prod.koi.security/api/external/v2"),
  code("events:   fetch loop -> instance -> engine -> /alerts + /audit-logs -> dataset koi_koi_raw"),
  rich([tag("YAML"), { text: `The second path exists on XSIAM / platform only. The pack sets isfetchevents: ${PACK.integration.isfetchevents} but overrides it with isfetchevents:xsoar: ${PACK.integration.isfetchevents_xsoar}, so on an XSOAR tenant there is no fetch loop and no dataset — see 2.1.` }]),
  rich([tag("LIVE"), { text: "Both instances (KOI_PAET, KOI_PLTS) run through engine c3664d21-63fb-4b2c-b16c-56cd547a3d79 with propagationLabels [\"all\"] — not direct tenant egress." }]),

  h2("2.1 Instance configuration as verified"),
  rich([tag("YAML"), { text: "Parameter names, types and defaults come from the pack. " },
        tag("LIVE"), { text: " The right-hand column is what both instances actually carry." }]),
  table([2300, 1150, 3150, TW - 6600],
    [["Parameter", "Required", "Pack default", "Live value on both instances"]].concat((() => {
      const live = {
        url: "https://api.prod.koi.security/",
        api_key: "set (per instance, different keys)",
        insecure: "false",
        proxy: "false",
        isFetchEvents: "true",
        event_types_to_fetch: "[\"Alerts\", \"Audit\"]",
        audit_types_filter: "[] — no filter, all audit types",
        max_fetch: "5000",
        eventFetchInterval: "1 (minute)",
      };
      return PACK.configuration.map(c => [
        c.name, c.required ? "yes" : "no",
        c.defaultvalue === null || c.defaultvalue === "" ? "—" : String(c.defaultvalue),
        live[c.name] || "not recorded",
      ]);
    })()), { mono: [0, 2, 3], monoSize: 16 }),
  rich([tag("YAML"), { text: `The ${PACK.configuration.filter(c => (c.hidden || []).includes("xsoar")).length} Collect-section parameters are hidden on the xsoar marketplace (hidden: ["xsoar"] in the pack). They only appear when the pack is installed from a marketplace target that supports event collection — see A1.` }],
       { spacing: { before: 160 } }),
  callout("EVENT COLLECTION IS XSIAM / PLATFORM ONLY",
    `The YAML sets isfetchevents: ${PACK.integration.isfetchevents} and then overrides it on the very next line with ` +
    `isfetchevents:xsoar: ${PACK.integration.isfetchevents_xsoar}. Every Collect parameter is likewise hidden: ["xsoar"]. ` +
    "On an XSOAR tenant this pack is a command integration and nothing else — no fetch loop, no dataset. " +
    "pack_metadata.json still lists xsoar among its marketplaces, so the pack installs there and simply does not " +
    "collect. Never say this pack \"ships an event collector\" without that qualifier.",
    AMBER, "FFFBEB"),

  h2("2.2 What is in the dataset"),
  rich([tag("LIVE"), { text: "Over 20 June – 20 July 2026:" }]),
  table([3000, 2000, TW - 5000], [
    ["Measure", "Value", "Note"],
    ["Dataset", "koi_koi_raw", "Confirmed to exist and be populated — no longer an inference"],
    ["Events", "20,156", "30-day window, this tenant"],
    ["Distinct hostnames", "80", ""],
    ["_vendor / _product", "koi / koi", "Consistent with send_events_to_xsiam(vendor=\"koi\", product=\"koi\") in Koi.py"],
    ["source_log_type = Audit", "19,842", "Flat, KOI-native schema"],
    ["source_log_type = Alerts", "314", "OCSF schema — class_uid 2007, type_uid 200701, is_alert true"],
  ], { mono: [1] }),
  callout("ONE DATASET, TWO SCHEMAS",
    "Audit rows and Alert rows share koi_koi_raw but have nothing in common. All OCSF fields are null on Audit " +
    "rows and all Audit fields are null on Alert rows. Always filter on source_log_type first — a query that does " +
    "not is averaging two unrelated tables.", AMBER, "FFFBEB"),
];

/* ============================ 6. PART A ============================ */

const partA_open = [
  new Paragraph({ children: [new PageBreak()] }),
  h1("Part A — Marketplace Pack Troubleshooting"),
  p("Fourteen failure modes. Each block gives the symptom as it presents, the cause, the evidence behind the diagnosis, and what to do. The Evidence row is the tagged part; the other three rows are advice composed from it."),
  p("They are not all of one kind, and the difference matters:", { spacing: { before: 120 } }),
  bullet([{ text: "Observed on this tenant on 20 July 2026 — ", bold: true },
          { text: "A2, A3, A4, A5, A8, A9. The condition described was seen, in the dataset or against the live API." }]),
  bullet([{ text: "Observed on this tenant on 21 July 2026 — ", bold: true },
          { text: "A11, A12, A13 and A14. The Alerts-stream duplication, the event-vs-API marketplace vocabulary mismatch, the run-on-demand scan behaviour and the user-profile scan scope were each measured live on 21 July 2026 (VERIFIED_FACTS §7b–§7e). A13 also re-verifies first-hand a finding first established in the earlier custom-pack investigation (Part B, B1)." }]),
  bullet([{ text: "Part observed, part read from the integration source — ", bold: true },
          { text: "A6 and A7. Of A6's three failure modes, two were reproduced as HTTP responses on both instances; the third is a refusal inside Koi.py, read from the source and never executed, because the integration raises before any API call is made. In A7, both instances' configuration and both KOI tenants' volumes were read live, but that the two instances land in the same koi_koi_raw dataset could not be observed: the pack ships no field identifying the producing instance, so no row can be attributed to one. That half follows from the configuration and from send_events_to_xsiam(vendor=\"koi\", product=\"koi\") in Koi.py. In both blocks the Evidence row says which half is which." }]),
  bullet([{ text: "Reasoned from verified evidence, not observed here — ", bold: true },
          { text: "A1 and A10. A1 describes an empty dataset, which is NOT the state of this tenant: koi_koi_raw exists and holds 20,156 events. A10 follows from the pack's own duplicate output declarations; the commands could not be run through XSIAM here (section 3), so the overwrite was never watched happening." }]),
];

const A1 = symptom(1, "Commands work but the dataset is empty", {
  symptomText: "koi-* commands return data in the war room. dataset = koi_koi_raw returns nothing, or the dataset does not exist.",
  cause: "Commands and event collection are independent. Commands go out on demand; events only flow if the instance is actually a collector. An instance installed from a marketplace target without event support has the Collect section hidden and isfetchevents effectively off — on an XSOAR tenant that is always the case, because the pack overrides isfetchevents to false there.",
  evidence: "NOT OBSERVED ON THIS TENANT — reasoned from the evidence below. [LIVE] Here both instances have Fetch " +
            "events enabled and koi_koi_raw is populated with 20,156 events, so this symptom is a failure mode to " +
            "recognise, not something seen here. [YAML] The pack declares isfetchevents: " + PACK.integration.isfetchevents +
            " but overrides it with isfetchevents:xsoar: " + PACK.integration.isfetchevents_xsoar + "; marketplaces are " +
            PACK.pack.marketplaces.join(", ") + " and the five Collect parameters carry hidden: [\"xsoar\"], so on XSOAR " +
            "there is no collector at all. [INHERITED] A pack zip built for the wrong marketplace target carries " +
            "isfetchevents: false and ships no rules.",
  fix: "Open the instance. If there is no \"Fetch events\" toggle at all, the installed pack build is not a collector — reinstall from the correct marketplace target rather than editing the instance. If the toggle is present but off, enable it and wait one fetch interval.",
  extra: [
    p("Confirm collection from the query side before touching the instance again:"),
    code("dataset = koi_koi_raw"),
    code("| comp count() as events by source_log_type"),
    rich([tag("DERIVED"), { text: "Query text composed from the verified dataset name and the verified discriminator field, and not executed in this form. " },
          tag("LIVE"), { text: "On this tenant that breakdown was two rows, Audit far larger than Alerts. Judge your own result by that shape — two rows, one much larger — not by matching a count." }]),
    rich([{ text: "If the dataset does not resolve at all", bold: true },
          { text: ", nothing has ever been written — this is an instance problem, not a query problem. If it resolves but is empty for your time window, check the fetch interval (" },
          { text: "eventFetchInterval", font: "Consolas", size: 20 },
          { text: " is 1 minute on this tenant) and widen the window." }]),
  ],
});

const A2 = symptom(2, "Events arrive but every XDM field is empty", {
  symptomText: "koi_koi_raw has rows, but xdm.* is null on all of them. Correlation rules, out-of-the-box XSIAM widgets and anything keyed on the Cortex Data Model match nothing.",
  cause: "Expected behaviour, not a fault. This pack ships an integration and nothing else — no parsing rules, no modeling rules. Nothing maps KOI events into XDM.",
  evidence: "[LIVE] No XDM fields are populated at all across the 30-day window on this tenant. [PACK] The pack " +
            "directory ships an integration only — no parsing rules, no modeling rules (VERIFIED_FACTS §3.2). That " +
            "second half is a filesystem fact about the pack, established by inspecting its contents: it is neither " +
            "an observation of the tenant nor a line of the YAML, which is why it is tagged [PACK] and not [LIVE] or " +
            "[YAML]. The custom pack's modeling rules are a different pack and do not apply here.",
  fix: "Query the raw fields. Do not wait for XDM to fill in — it never will unless you write and ship modeling rules yourself, which is additional content and outside this pack.",
  extra: [
    p("The raw fields that are actually populated, by schema:"),
    table([1700, TW - 1700], [
      ["source_log_type", "Fields to query"],
      ["Audit", "type, action, category, object_name, object_type, hostname, item_version"],
      ["Alerts", "class_uid, type_uid, is_alert, severity_id, confidence_id, risk_level_id, status_id, resources, observables, metadata"],
    ], { mono: [0, 1] }),
    rich([tag("LIVE"), { text: "Audit type values and counts observed over the 30-day window: extensions 16,579 · devices 2,971 · remediation 244 · policies 32 · approval_requests 8 · guardrails 6 · notifications 2. Observed category: system 16,825 · user 3,017. These are a snapshot of a dataset that is still being written to — read them as the shape of the distribution, not as figures your own query has to match." }],
         { spacing: { before: 160 } }),
    code("dataset = koi_koi_raw"),
    code("| filter source_log_type = \"Audit\""),
    code("| comp count() as events by type, category"),
    code("| sort desc events"),
    rich([tag("DERIVED"), { text: "Query composed from verified field names and not executed in this form. It is written to reproduce, on your own window, the breakdown recorded above — nothing is claimed here about what it returns. The figures above are the observation, taken from a dataset that is still being written to." }]),
  ],
});

const A3 = symptom(3, "XQL against resources or observables returns nothing", {
  symptomText: "A filter or comp on resources, observables or metadata silently returns zero rows — no error, no warning.",
  cause: "On alert rows these three are JSON strings, not objects. XQL treats them as opaque text, so any field-style access misses.",
  evidence: "[LIVE] Confirmed on alert rows in koi_koi_raw. The failure mode is silence, which is why it costs time.",
  fix: "Extract before you filter, with json_extract / json_extract_scalar.",
  extra: [
    code("dataset = koi_koi_raw"),
    code("| filter source_log_type = \"Alerts\""),
    code("| alter first_resource = json_extract(resources, \"$[0]\")"),
    code("| alter first_observable = json_extract(observables, \"$[0]\")"),
    code("| fields _time, severity_id, risk_level_id, status_id, first_resource, first_observable"),
    rich([tag("LIVE"), { text: "That resources/observables/metadata are JSON strings is verified. " },
          tag("DERIVED"), { text: " The query text above is composed from those verified field names and was not itself executed; adjust the JSON path to the element you need." }]),
    callout("WHY THIS MATTERS",
      "A query that treats these as structured fields returns an empty result rather than an error, so it reads as " +
      "\"there are no matching alerts\" instead of \"this query cannot work\". Never conclude absence from an empty " +
      "result on these three fields until you have re-run it with json_extract.", RED, "FEF2F2"),
  ],
});

const A4 = symptom(4, "alert_type is always null", {
  symptomText: "Any rule, query, playbook condition or dashboard keyed on alert_type matches nothing, on any alert row.",
  cause: "The field is never populated by this pack's collection path.",
  evidence: "[LIVE] filter alert_type != null over the full 30-day window returns zero rows.",
  fix: "Key on what is populated instead: source_log_type to separate the schemas, then class_uid / type_uid / severity_id / risk_level_id / status_id on alert rows.",
  extra: [
    code("dataset = koi_koi_raw"),
    code("| filter source_log_type = \"Alerts\" and alert_type != null"),
    code("| comp count() as n"),
    rich([tag("LIVE"), { text: "The underlying check was made: filter alert_type != null over the full 30-day window returned zero rows. " },
          tag("DERIVED"), { text: " The query text above is that check composed with source_log_type and a count, and was not itself executed in this form. It is written to be run as a check on your own window — nothing is claimed here about what it returns — and not to be built on as a working filter." }]),
    callout("PORTING FROM THE CUSTOM PACK",
      "The custom pack's triage content branches on alert_type. Ported to this pack unchanged, every branch is dead " +
      "and the failure is silent. Rewrite those conditions before porting anything.", AMBER, "FFFBEB"),
  ],
});

const A5 = symptom(5, "view=browser_extensions returns HTTP 400", {
  symptomText: "The value copied from the pack's own command_examples.txt is rejected by the API with HTTP 400.",
  cause: "The shipped example is wrong. browser_extensions is in neither the YAML dropdown nor the API's accepted set. ide_extensions and packages are rejected the same way — but, unlike browser_extensions, neither of those appears in the shipped example; they are simply values a reader might guess.",
  evidence: "[LIVE] All three return HTTP 400 against the live API, on both instances, and the 400 body states the " +
            "accepted set, so the error is not opaque. [CODE] Only browser_extensions occurs in " +
            "Packs/Koi/Integrations/Koi/command_examples.txt — that is a pack source file, not the integration YAML. " +
            "[YAML] The dropdown offers " + VIEW_YAML.length + " values. [LIVE] The API accepts " + VIEW_API.length +
            ", and every one of the " + VIEW_ALL.length + " values in the table below was called individually on both " +
            "instances (evidence/followup-probes.json).",
  fix: "Use one of the values the API actually accepts. Three of them are missing from the dropdown and must be typed by hand.",
  extra: [
    p("Every value, on both instances. The two count columns are total_count from the response body — a snapshot of a live inventory that grows, not a threshold to test against. What is stable is the HTTP status column:",
      { keepNext: true }),
    table([2000, 1150, 1050, 800, 1350, 1350, TW - 7700],
      [["view value", "In dropdown", "In API set", "HTTP", "KOI_PAET items", "KOI_PLTS items", "Note"]].concat(
        VIEW_ALL.map(v => [
          v,
          VIEW_YAML.includes(v) ? "yes" : "no",
          VIEW_API.includes(v) ? "yes" : "no",
          viewStatus(v),
          viewCount(v, "KOI_PAET"),
          viewCount(v, "KOI_PLTS"),
          VIEW_IN_SHIPPED_EXAMPLE.includes(v) ? "the one bad value in the shipped example"
            : (VIEW_REJECTED.includes(v) ? "not in the shipped example"
              : [VIEW_MISSING.includes(v) ? "missing from the dropdown, must be typed by hand" : "",
                 viewZeroOnBoth(v) ? "accepted, but 0 rows on both tenants" : ""]
                .filter(Boolean).join("; ")),
        ])), { mono: [0], monoSize: 16 }),
    rich([tag("LIVE"), { text: "All " + VIEW_ALL.length + " values were probed one at a time on both instances — the " +
            VIEW_API.length + " the API names in its own 400 body, plus the " + VIEW_REJECTED.length +
            " a reader might plausibly guess. Every cell above is an observed HTTP response, taken from " +
            "evidence/followup-probes.json; none of it is inferred from the 400 body, and no view value is left " +
            "unprobed. Both instances returned the same status for every value. " },
          { text: "all_items is the one to watch: it is accepted and still returns nothing — HTTP 200 with total_count 0 on both tenants, which is a result, not an error. Omitting view entirely returned " +
            invDrift("KOI_PAET") + " items on KOI_PAET and " + invDrift("KOI_PLTS") +
            " on KOI_PLTS, so to ask for everything, omit the argument rather than passing all_items.", italics: true }],
         { spacing: { before: 140 } }),
    callout("THESE COUNTS DRIFT — DO NOT TURN THEM INTO EXPECTED RESULTS",
      "The counts above are the later of two sweeps run a few hours apart on 20 July 2026, and on some figures the " +
      "two sweeps do not agree: " + DRIFT_SENTENCE + ", and " + INV_DRIFT_SENTENCE + " over the same interval. " +
      "The drift is per tenant, not universal — " + INV_STEADY_SENTENCE + ". And it is between runs, never within " +
      "one: each instance's unfiltered inventory was probed twice inside a single run and returned the same figure " +
      "both times (attempt_within_run 1 and 2 in evidence/followup-probes.json). So this is inventory growth on the " +
      "tenant that moved, not the API wobbling — and both readings are correct as of their own run. A test step must " +
      "therefore assert a shape: HTTP 200, a total_count present and non-zero, the expected fields on the first " +
      "record. A reader whose numbers differ from these has not failed a test.", AMBER, "FFFBEB"),
    rich([{ text: "Missing from the dropdown but valid: ", bold: true },
          { text: VIEW_MISSING.join(", "), font: "Consolas", size: 20 },
          { text: ". Nothing in the YAML is invalid — the list is incomplete." }],
         { spacing: { before: 160 } }),
    rich([tag("LIVE"), { text: "This matters most for mcp_servers, the MCP-server audit case: it returned HTTP 200 with total_count " +
            viewCount("mcp_servers", "KOI_PAET") + " on KOI_PAET and " + viewCount("mcp_servers", "KOI_PLTS") +
            " on KOI_PLTS, but the argument dropdown will never offer it. repositories is likewise real data (" +
            viewCount("repositories", "KOI_PAET") + " / " + viewCount("repositories", "KOI_PLTS") +
            ") that the dropdown hides." }]),
    code("!koi-inventory-list view=mcp_servers limit=50"),
  ],
});

const A6 = symptom(6, "koi-inventory-search fails on its filter", {
  symptomText: "The command errors instead of returning items. What the error says depends on how the filter is wrong — and the three cases have different causes.",
  cause: "The API wants the query-builder object — a combinator and a rules array — and the pack documents the argument as \"query builder syntax\" without showing the shape. What the pack lacks is an example, not a usable error message.",
  evidence: "[LIVE] The structured filter below returned HTTP " + searchStatus("well-formed filter") +
            " with total_count " + SEARCH_OK.KOI_PAET + " on KOI_PAET and " + SEARCH_OK.KOI_PLTS + " on KOI_PLTS. " +
            "Two of the three failure modes below were reproduced as HTTP responses, on both instances: the filter key " +
            "omitted from the request returned " + searchStatus("filter key omitted from request") +
            ", and an empty filter object {} returned " + searchStatus("empty filter object") + ". [CODE] The third was " +
            "not reproduced and cannot be — it is a code fact, read from Koi.py line 468, where the integration raises " +
            "before any HTTP call is made. There is no response to observe, and it was never executed here. " +
            "[YAML] filter_json and filter_raw_json_entry_id are both optional in the YAML. [CODE] The refusal when " +
            "neither is given lives in the integration code, not in the YAML.",
  fix: "Always pass a complete {combinator, rules} object. Read the 400 body before guessing — it names the offending key. For anything long, put the JSON in a war-room file and pass filter_raw_json_entry_id, which takes priority over filter_json.",
  extra: [
    p("Three distinct failure modes. Do not conflate them — they fail in different places, and they are not all known in the same way:", { keepNext: true }),
    table([2700, 1500, 1500, TW - 5700], [
      ["What you do", "Where it fails", "How this is known", "What you get"],
      ["Call the command with neither filter_json nor filter_raw_json_entry_id",
       "The integration, before any HTTP call",
       "[CODE] read from Koi.py line 468 — never executed, no API call to observe",
       "Koi.py raises \"Either 'filter_json' or 'filter_raw_json_entry_id' must be provided.\" No API call is made at all."],
      ["Pass a filter that is present but malformed, e.g. {}",
       "The API",
       "[LIVE] reproduced on both instances",
       "HTTP " + searchStatus("empty filter object") + " — and the body names the problem: filter.combinator must be one of the following values: and, or … filter.rules must be an array. The 400 is not bare and not unexplained."],
      ["Omit the filter key from a direct API request",
       "The API",
       "[LIVE] reproduced on both instances",
       "HTTP " + searchStatus("filter key omitted from request") + " Internal Server Error. Reachable only by calling the API yourself; the command cannot produce it, because the integration stops you first."],
    ]),
    code("!koi-inventory-search filter_json=`{\"combinator\": \"and\", \"rules\": [{\"field\": \"risk_level\", \"operator\": \"=\", \"value\": \"high\"}]}`"),
    rich([tag("LIVE"), { text: "That exact filter object is the verified working one — total_count " + SEARCH_OK.KOI_PAET + " on KOI_PAET, " + SEARCH_OK.KOI_PLTS + " on KOI_PLTS. Those are the counts this filter returned; no comparison was run against koi-inventory-list with the same risk level, so nothing is claimed about the two agreeing. Only the operator \"=\" was tested — no other operator was tried, so none is asserted to be valid or invalid. " },
          tag("DERIVED"), { text: " The war-room command line wrapping it is illustrative — the commands could not be executed through XSIAM on this tenant (section 3)." }]),
    p("Arguments this command accepts, straight from the pack:", { spacing: { before: 160 }, keepNext: true }),
    table([3200, 1000, 1600, TW - 5800],
      [["Argument", "Required", "Default", "Description"]].concat(
        byName["koi-inventory-search"].arguments.map(a => [
          a.name, a.required ? "yes" : "no",
          a.defaultValue === null ? "—" : String(a.defaultValue),
          a.description,   /* full text — never truncated */
        ])), { mono: [0, 2] }),
  ],
});

const A7 = symptom(7, "Two instances, one dataset, no way to tell them apart", {
  symptomText: "Row counts look doubled, or an alert appears twice, and nothing in the row says which instance produced it.",
  cause: "Both instances have Fetch events enabled and both write Alerts and Audit into the same koi_koi_raw dataset. The pack ships no field identifying the producing instance.",
  evidence: "[LIVE] Both KOI_PAET and KOI_PLTS are configured identically apart from their API key: isFetchEvents " +
            "true on both, event_types_to_fetch [\"Alerts\", \"Audit\"] on both. [CODE] The destination dataset is not " +
            "configurable — Koi.py calls send_events_to_xsiam(vendor=\"koi\", product=\"koi\"), which is what makes it " +
            "koi_koi_raw. That both instances land in that one dataset is therefore a consequence of their " +
            "configuration and of the integration code, not something observed row by row: as the Cause row says, " +
            "the pack ships no field identifying the producing instance, so no row can be attributed to an instance " +
            "in the first place.",
  fix: "Do not try to separate them inside the dataset — there is no field to do it with. Separate them upstream: give each instance a distinct KOI tenant scope, or disable Fetch events on one instance if the two KOI tenants overlap.",
  extra: [
    p("The two KOI tenants behind these instances hold very different volumes, which is itself a useful discriminator when you are sanity-checking a count. Where a figure moved between the two sweeps of 20 July 2026 it is shown as earlier → later:", { keepNext: true }),
    table([3400, 3220, 3220], [
      ["Measure (via API, 20 Jul 2026 — a snapshot; the figures that moved between the two runs carry an arrow)", "KOI_PAET", "KOI_PLTS"],
      ["Inventory items", invDrift("KOI_PAET"), invDrift("KOI_PLTS")],
      ["Policies", "32", "28"],
      ["Allowlist entries", "0 (empty)", "5"],
      ["Blocklist entries", "0 (empty)", "17"],
      ["view=mcp_servers", viewCountDrift("mcp_servers", "KOI_PAET"), viewCountDrift("mcp_servers", "KOI_PLTS")],
      ["view=software", viewCountDrift("software", "KOI_PAET"), viewCountDrift("software", "KOI_PLTS")],
      ["Alerts available via API", "296", "48,526"],
      ["Audit records available via API", "8,789", "96,196"],
    ]),
    rich([tag("LIVE"), { text: "Two things follow. These two tenants differ by two orders of magnitude on alerts, so any row-count assertion in a test plan must name the tenant it was measured on — as every figure in the table above does. And some of the counts drift between runs — " + DRIFT_SENTENCE + ", and " + INV_DRIFT_SENTENCE + " over the same few hours, while " + INV_STEADY_SENTENCE + " — so none of the figures above is a pass/fail threshold. Only a figure that moved carries an arrow; the reading to the right of it is the later one, and the A5 matrix prints that same later reading. Assert on shape instead: HTTP 200, a total_count present and non-zero." }],
         { spacing: { before: 160 } }),
  ],
});

const A8 = symptom(8, "The instance runs through an engine — your reachability test is testing the wrong path", {
  symptomText: "curl or a network test from the tenant to api.prod.koi.security succeeds, and the commands still fail.",
  cause: "Both instances execute on an engine, not on the tenant. The tenant's own egress is not the path the commands take, so a test from the tenant proves nothing about it.",
  evidence: "[LIVE] Engine c3664d21-63fb-4b2c-b16c-56cd547a3d79, propagationLabels [\"all\"], on both instances.",
  fix: "Run the reachability test from the engine host, against the same base URL and with the same proxy settings the instance carries (insecure and proxy are both false on these instances). Test integration on the instance itself exercises the real path; ad-hoc tests from elsewhere do not.",
  extra: [
    callout("THE GENERAL FORM OF THIS MISTAKE",
      "Any evidence gathered from a machine that is not the one running the integration is circumstantial. That " +
      "applies to DNS, TLS interception, proxy configuration and egress filtering alike.", AMBER, "FFFBEB"),
  ],
});

const A9 = symptom(9, "Allowlist and blocklist \"return nothing\" — checking total_count", {
  symptomText: "A check written as \"assert total_count > 0\" fails on koi-allowlist-get and koi-blocklist-get even when the lists are fine.",
  cause: "Those two endpoints return only an items array. There is no total_count on them, unlike /policies and /inventory. Reading a field that never exists is not the same as an empty list.",
  evidence: "[LIVE] /policies/allowlist and /policies/blocklist return items only. Both lists were genuinely empty on KOI_PAET, and 5 / 17 on KOI_PLTS.",
  fix: "Assert on the length of the items array. An empty items array is a correct, non-error result — it means the list is empty, not that the call failed.",
  extra: [
    rich([tag("YAML"), { text: `Both commands take no arguments at all (koi-allowlist-get: ${byName["koi-allowlist-get"].arguments.length} args, koi-blocklist-get: ${byName["koi-blocklist-get"].arguments.length}), so there is nothing to misconfigure on the call itself.` }]),
    code("!koi-allowlist-get"),
    code("!koi-blocklist-get"),
  ],
});

const A10 = symptom(10, "Context from one inventory command disappears after the next one runs", {
  symptomText: "A playbook reads Koi.Inventory.item_id and gets the wrong item, or a value that was there a task ago is gone.",
  cause: `${cmdsCollidingUnderPrefix("Koi.Inventory").length} commands declare the identical Koi.Inventory item paths, and both policy commands declare the identical Koi.Policy.* paths. Same key, last writer wins.`,
  evidence: "[YAML] " + DUP_PATHS.length + " of " + DISTINCT_PATHS.length + " distinct context paths are declared by more than one command — " +
            PACK.counts.outputs + " declarations over " + DISTINCT_PATHS.length + " paths, a difference of " +
            (PACK.counts.outputs - DISTINCT_PATHS.length) + " redundant declarations. Not observed running here: the commands could not be executed " +
            "through XSIAM on this tenant (section 3), so this follows from what the pack declares, not from a watched overwrite.",
  fix: "Read the context immediately after each call, or copy it into a task-specific key with Set before calling the next inventory command. Do not assume a prefix survives a second command.",
  extra: [
    table([2600, 4200, TW - 6800], [
      ["Prefix", "Commands that overwrite each other", "Declares the prefix but collides with nothing"],
      ["Koi.Inventory", cmdsCollidingUnderPrefix("Koi.Inventory").join("\n"),
       cmdsUnderPrefixNotColliding("Koi.Inventory").join("\n") + "\n(writes only Koi.Inventory.Endpoint.*)"],
      ["Koi.Policy", cmdsCollidingUnderPrefix("Koi.Policy").join("\n"),
       cmdsUnderPrefixNotColliding("Koi.Policy").join("\n") || "—"],
    ], { mono: [0, 1, 2], monoSize: 16 }),
    rich([{ text: "Three commands, not four. ", bold: true },
          { text: `${cmdsUnderPrefixNotColliding("Koi.Inventory").join(", ")} writes only the ${pathsWithPrefix("Koi.Inventory.Endpoint")} nested Koi.Inventory.Endpoint.* paths. It shares no context path with the other three, so it neither overwrites them nor is overwritten by them.` }],
         { spacing: { before: 140 } }),
  ],
});

const A11 = symptom(11, "Alert counts look inflated — the same alert appears hundreds of times", {
  symptomText: "A count() over Alerts is far larger than the number of real alerts. One alert shows up as hundreds of near-identical rows in koi_koi_raw, and every widget, query or triage step that counts alert rows — or fires once per row — is overstated.",
  cause: "The integration re-sends every still-open alert on each fetch cycle, so koi_koi_raw holds one row per alert PER FETCH, not one row per alert. With eventFetchInterval = 1 minute, an alert that stays open for hours is re-inserted once a minute. Audit records are point-in-time and are not duplicated.",
  evidence: "[LIVE] Measured 21 July 2026. Over the last 24 hours the Alerts stream held 734 rows for just 3 distinct " +
            "alerts — a 244.7× inflation; over 90 days, 1,048 rows for 317 distinct alerts (3.3×). Audit is unaffected: " +
            "257 rows / 257 distinct over 24 h and 20,148 / 20,148 over 90 d (1.0×). Within one notification, 357 rows " +
            "carried 1 distinct _time and 1 distinct message but 357 distinct _insert_time — the same alert re-inserted " +
            "357 times, once per fetch minute. Nothing dedupes on the way in, because the pack ships no parsing rule.",
  fix: "Dedupe every alert count on the notification identity. The only correct key is metadata.notification_event_id. " +
       "On already-ingested rows there is no promoted column, so extract it inline with " +
       "json_extract_scalar(metadata, \"$.notification_event_id\"). Never count() alert rows directly.",
  extra: [
    p("Four candidate identifiers were measured over the same 90-day window. Only one identifies the alert occurrence:",
      { keepNext: true }),
    table([3900, 1500, TW - 5400], [
      ["Field", "Distinct / 1,048 rows", "What it identifies"],
      ["_id", "1,048", "the row — counts every duplicate"],
      ["metadata.notification_event_id", "317", "the alert occurrence — the correct key"],
      ["observables[event.id] (koi_event_id)", "20", "the scan batch — far too coarse"],
      ["finding_info.uid (finding_uid)", "3", "the finding / policy definition — far too coarse"],
    ], { mono: [0], monoSize: 16 }),
    p("Corrected count — dedupe first, then count:", { spacing: { before: 160 }, keepNext: true }),
    code("dataset = koi_koi_raw"),
    code("| filter source_log_type = \"Alerts\""),
    code("| alter koi_notification_id = json_extract_scalar(metadata, \"$.notification_event_id\")"),
    code("| comp count_distinct(koi_notification_id) as alerts"),
    rich([tag("LIVE"), { text: "On this data (21 July 2026), count() over Alerts returns 734 where " +
            "count_distinct(koi_notification_id) returns 3. " },
          tag("DERIVED"), { text: " The query text above is composed from those verified field names and was not " +
            "executed as written; metadata is a plain object, not an array, so no coalesce is needed." }],
         { spacing: { before: 140 } }),
    callout("EVERY count() OVER ALERTS IS OVERSTATED",
      "The integration re-sends every still-open alert on each 1-minute fetch, so a row count is multiplied by however " +
      "many fetch cycles each alert survived. Any triage playbook that reacts per alert row fires repeatedly for one " +
      "real alert. Dedupe on the notification id — count_distinct(koi_notification_id) — and on historical rows extract " +
      "it inline: json_extract_scalar(metadata, \"$.notification_event_id\"). Audit is unaffected; this is Alerts-only.",
      RED, "FEF2F2"),
  ],
});

const A12 = symptom(12, "A marketplace value from an event is rejected with HTTP 400", {
  symptomText: "A command that takes a marketplace argument fails with HTTP 400 when the marketplace value came from an event in koi_koi_raw. The value looks valid but the API refuses it.",
  cause: "The marketplace field in koi_koi_raw uses SHORT forms (software_windows, chrome, vsc, …). The API and the pack's YAML predefined list use LONG forms (windows, chrome_web_store, vscode, …). The two vocabularies differ for most values — including the single most common event value, software_windows (which the API only accepts as windows) — so a value read from an event and passed to a command unchanged is usually rejected. Some values do coincide and pass through: npm and pypi (pypi is the second most common event value overall), plus homebrew, chocolatey, cursor, docker and claude_desktop_extensions.",
  evidence: "[LIVE] Verified 21 July 2026 by testing every marketplace value against GET /inventory?marketplace=. The " +
            "koi_koi_raw marketplace field uses short forms and the API / YAML predefined list uses long forms; the two " +
            "coincide for only a handful of values and differ for the majority. In a controlled operator test the same " +
            "day, 16 of 19 real events (84 %) carried a value that failed HTTP 400 unmapped and succeeded once mapped — " +
            "only pypi worked untouched. [YAML] The " + MARKETPLACE_LONG.length + " long-form names are the predefined " +
            "list on the marketplace argument.",
  fix: "Map the event short form to the API long form between reading an event and calling a command. Three event " +
       "values (" + MKT_NO_API.join(", ") + ") have no API equivalent at all — treat them as \"unknown marketplace\" " +
       "and do not pass them on.",
  extra: [
    rich([tag("YAML"), { text: `${MARKETPLACE_CMDS.length} commands take a marketplace argument and validate it against ` +
            `the ${MARKETPLACE_LONG.length} long-form names; ${MARKETPLACE_CMDS_REQUIRED.join(" and ")} require it. ` +
            `Passing a raw event value to any of them fails with HTTP 400.` }]),
    p("Event short form → API long form. The mapping is the fact; the two count columns are a 21 Jul 2026 snapshot and drift:",
      { spacing: { before: 120 }, keepNext: true }),
    table([2750, 1000, 2900, 1050, TW - 7700],
      [["Event value (koi_koi_raw)", "Events", "API / YAML value", "API items", "Note"]].concat(
        MARKETPLACE_MAP.map(m => [
          m.event,
          num(m.events),
          m.api === null ? "— none —" : m.api,
          m.items === null ? "—" : num(m.items),
          m.api === null
            ? (m.event === "ollama" ? "not in the API list" : "installation_method value leaking into the field")
            : (m.api === m.event ? "matches — passes through unchanged" : "must be mapped"),
        ])), { mono: [0, 2], monoSize: 16 }),
    rich([tag("LIVE"), { text: "Where the Event and API columns differ, the value is rejected with HTTP 400 if passed " +
            "to a command unchanged; where they match (Note column), it passes through. The highest-frequency event " +
            "value, software_windows, differs, so most real traffic needs the mapping (pypi, the second most common, is " +
            "one of the few that passes through). " + MKT_NO_API.join(", ") + " are not " +
            "marketplaces at all (built_in and side_loaded are installation_method values that leak into the field; " +
            "ollama is simply absent from the API's list), so they must be dropped rather than mapped." }],
         { spacing: { before: 140 } }),
    rich([tag("LIVE"), { text: "In the companion pack (separate content — see the cover), KOI Ext - Extract Alert " +
            "Context reads item.marketplace straight from the alert payload and downstream playbooks pass it to " +
            "koi-inventory-item-get, koi-inventory-item-endpoints-list and koi-blocklist-items-add. The mapping above " +
            "must be applied between reading the event and calling the command." }]),
    callout("MAP EVENT VALUES BEFORE CALLING A COMMAND",
      "Do not feed a marketplace value from an event straight into a command unless you have confirmed it is one of the " +
      "few that coincide. Map the short form to the long form first. The chrome rows fail HTTP 400 unmapped, and any " +
      "audit-driven flow using software_windows — the most common value in the dataset — fails likewise. Treat " +
      MKT_NO_API.join(", ") + " as unknown and drop them.",
      RED, "FEF2F2"),
  ],
});

const A13 = symptom(13, "A host stops producing events — KOI is run-on-demand, and nothing scanned it", {
  symptomText: "koi_koi_raw is populated overall, but one host has produced no events for days. A tester watching a single quiet host sees an empty result and reports collection as broken.",
  cause: "KOI has no resident agent on Windows — it is run-on-demand. Between scans nothing runs on the host, so nothing is generated. A scan must be triggered before any events appear, and KOI is change-driven: a scan of an unchanged host still produces nothing.",
  evidence: "[LIVE] Re-verified first-hand 21 July 2026. Two test hosts (win-workstation, koi-win-test) had produced no " +
            "events since 15 July — six days — while other hosts reported continuously; nothing was wrong with them, " +
            "nothing had run the scan. Running KOI Deployment Script - Windows via core-script-run returned " +
            "COMPLETED_SUCCESSFULLY in 135 s, and a scan of an unchanged host produced no events at all. [INHERITED] The " +
            "earlier custom-pack investigation established the same run-on-demand behaviour (Part B, B1).",
  fix: "Do not read an empty result on one host as a collection failure. Confirm a scan has actually run — trigger KOI " +
       "Deployment Script - Windows through core-script-run — and confirm something changed on the host since the last " +
       "scan. After a successful scan, events are queryable in koi_koi_raw within roughly 4–10 minutes.",
  extra: [
    callout("SCAN, THEN CHANGE, THEN WAIT",
      "Three things must all be true before a host produces events: (1) a scan has run — KOI is run-on-demand, there is " +
      "no resident agent between scans; (2) something changed since the last scan — a re-scan of an unchanged host is a " +
      "no-op, and a re-install of an already-inventoried item is also a no-op because KOI is change-driven; (3) a few " +
      "minutes have passed — ingestion takes roughly 4–10 minutes after the scan completes. An empty dataset on a quiet " +
      "host is expected, not a fault.", AMBER, "FFFBEB"),
    rich([tag("LIVE"), { text: "The scan is driven the same way the Script Runner workflow drives it — a core-script-run " +
            "of KOI Deployment Script - Windows (name → uid → run). " },
          tag("PACK"), { text: "That Script Runner workflow is additional content in the separate " + COMPANION.name +
            " pack, not part of the Marketplace pack; core-script-run itself is Cortex-native." }]),
  ],
});

const A14 = symptom(14, "You installed something but KOI doesn't see it", {
  symptomText: "A package, extension or repository was installed on a scanned host, a scan ran, and it still does not appear in KOI's inventory or events.",
  cause: "KOI scans user-profile locations and ignores the SYSTEM profile. If the install landed in a SYSTEM-profile path — as anything the Cortex EDR agent installs does, because the agent runs as SYSTEM — KOI never sees it. It is the PATH that decides, not the identity of the installing process.",
  evidence: "[LIVE] Verified 21 July 2026 by a controlled three-way comparison, all three installs driven by a SYSTEM " +
            "process. tabulate==0.9.0 landed in the SYSTEM profile and was NOT detected — " +
            "/inventory/tabulate/endpoints?version=0.9.0 returned HTTP 404. inflection==0.5.1 in a user profile WAS " +
            "detected (event 09:55:12), and a git clone into a user profile WAS detected (event 09:48:06). Same " +
            "installing identity throughout, so the path — not the process — is the variable.",
  fix: "Install into a user-profile path if you want KOI to inventory it. For detection testing, make the change in a " +
       "user profile the agent scans, and use an item verified absent from the host beforehand — KOI is change-driven, " +
       "so a re-install of an already-inventoried item produces nothing.",
  extra: [
    table([2600, TW - 4200, 1600], [
      ["Package / item", "Target path", "Detected?"],
      ["tabulate==0.9.0", "C:\\Windows\\system32\\config\\systemprofile\\…\\site-packages (SYSTEM profile)", "No — 404"],
      ["inflection==0.5.1", "C:\\Users\\amahmoud\\AppData\\Roaming\\Python\\… (user profile)", "Yes — 09:55:12"],
      ["octocat/Hello-World (git clone)", "C:\\Users\\amahmoud\\Documents\\koi-test-repo (user profile)", "Yes — 09:48:06"],
    ], { mono: [0, 1], monoSize: 16 }),
    callout("PATH, NOT PROCESS",
      "KOI scans user-profile locations only. A SYSTEM-profile install is invisible no matter what installed it — and " +
      "anything the Cortex EDR agent runs installs as SYSTEM. This is also why detection tests can be automated through " +
      "the agent: the requirement is a user-profile path, not an interactive user. B6 is the same surprise from the " +
      "opposite direction — KOI's own bundled Python makes PyPI packages appear on hosts where nobody installed Python.",
      AMBER, "FFFBEB"),
  ],
});

/* ============================ 7. Environment finding ============================ */

const envFinding = [
  new Paragraph({ children: [new PageBreak()] }),
  h1("3. Environment Finding — Automating Command Tests on This Tenant"),
  rich([tag("LIVE"), { text: "This is a tenant limitation, not a pack fault. It is recorded because anyone trying to automate a command sweep will hit it, lose a day to it, and conclude the pack is broken." }]),
  table([3400, TW - 3400], [
    ["What was attempted", "What happened"],
    ["POST /investigations/search", "303 redirect to /#/404. demisto-sdk run depends on this endpoint, so it cannot run commands on this tenant at all."],
    ["POST /incident", "HTTP 200 with an empty body. No incident is created — XSIAM does not accept incident creation over the XSOAR API."],
    ["Running a command in the playground", "An API-key user's playground is auto-created as a malformed stub (type: 0, modified 0001-01-01T00:00:00Z). Every command run there — including the built-in !Print — returns Panic [runtime error: invalid memory address or nil pointer dereference] (56)."],
  ]),
  callout("WHAT THIS DOES AND DOES NOT ESTABLISH",
    "Command behaviour was therefore checked one layer down, against the same endpoints, with the same bearer auth " +
    "and the same API keys the two instances use — for 8 of the 13 commands. The other 5 change tenant state and " +
    "were deliberately not run at all. For those 8, this establishes that the endpoints exist, that parameters are " +
    "accepted or rejected as described, and what the response shapes are. It establishes NOTHING about the XSOAR " +
    "side: no command was ever executed in a war room on this tenant, so no human-readable output, no war-room " +
    "table and no context mapping was observed. Those are asserted from the YAML and from Koi.py — two different " +
    "artefacts, tagged [YAML] and [CODE] respectively wherever used — and must not be read as tested.",
    AMBER, "FFFBEB"),
  rich([tag("LIVE"), { text: "One authentication fact did come out of this: an invalid bearer token returns HTTP 401 {\"message\":\"Unauthorized\",\"statusCode\":401}. " },
        tag("UNVERIFIED"), { text: "No 403 was ever observed from this machine. Do not read a 403 as proof of blocked egress — that mapping was never seen here." }]),
  rich([{ text: "To close the gap: ", bold: true },
        { text: "run the command sweep from the XSIAM UI war room, which does not use the API path that fails, and compare the results against evidence/command-sweep.json in this repository." }]),
  rich([tag("UNVERIFIED"), { text: "No claim is made anywhere in this guide about a command's war-room table layout or its human-readable output." }]),
];

/* ============================ 8. PART B — inherited ============================ */

const partB = [
  new Paragraph({ children: [new PageBreak()] }),
  h1("Part B — Endpoint Findings Inherited from the Custom-Pack Investigation", BLUE),
  callout("INHERITED — NOT RE-VERIFIED IN THIS SESSION",
    "Everything in Part B was established during the earlier custom-pack investigation on a live Windows endpoint. " +
    "These findings are pack-independent — they concern the KOI agent on the endpoint, not the content pack — which " +
    "is why they are reproduced here. They were NOT re-verified against this Marketplace pack or in this session. " +
    "Treat them as strong prior evidence, not as fresh observation. Every heading in this part is blue for that reason. " +
    "This part adds nothing to the inherited notes: where a practical next step goes beyond what those notes actually " +
    "record, it is tagged [UNVERIFIED] and marked untested rather than presented as a finding.",
    BLUE, INHERIT_BG),

  h2("B1. There is no resident KOI agent on Windows", BLUE),
  rich([tag("INHERITED"), { text: "KOI on Windows is run-on-demand: there is no service, no resident process and no scheduled task between runs. A scheduled Job is therefore the scan scheduler." }], { fill: INHERIT_BG }),
  rich([{ text: "Consequence: ", bold: true }, { text: "no Job run means no scan — not a delayed scan, not a partial one. An investigation into stale endpoint data starts with the Job, not the endpoint." }]),
  rich([tag("PACK"), { text: "Note for this pack specifically: the Job-plus-Script-Runner workflow is content from the custom pack. It is not part of the Marketplace pack, which ships an integration only. That is a statement about what the two pack directories contain, established by inspecting them — not an observation of this tenant or its API, and not something the integration YAML says, which is why it is tagged [PACK] rather than [LIVE] or [YAML]." }]),

  h2("B2. The file map — the four files recorded under C:\\ProgramData\\Koi", BLUE),
  rich([tag("INHERITED"), { text: "The inherited notes record these four files under " },
        { text: "C:\\ProgramData\\Koi\\", bold: true, font: "Consolas" },
        { text: ". Their descriptions below go no further than those notes; nothing about install layout elsewhere on the disk was recorded, so nothing is claimed about it here." }],
       { fill: INHERIT_BG }),
  table([3000, TW - 3000], [
    ["File", "What the inherited notes say"],
    ["settings.json", "Scan configuration; pulled from the backend rather than written locally by the scan (see B3)"],
    ["agent_policies.json", "Enforcement policy set; carries the cid (KOI tenant id) and the deviceId for this endpoint"],
    ["agent_activity.jsonl", "Agent activity record. Named in the inherited file list; its contents were not characterised, and no expected size is claimed"],
    ["agent_enforcement.log", "Enforcement engine log. Named in the inherited file list; its contents were not characterised, and no expected size is claimed"],
  ], { mono: [0], fill: INHERIT_BG }),

  h2("B3. Only a fresh mtime proves an authenticated round trip", BLUE),
  rich([tag("INHERITED"), { text: "settings.json and agent_policies.json are not written locally by the scan — they are pulled from the backend after the agent authenticates. A new modification time on those two files is the only evidence that the complete round trip succeeded. Reachability alone proves nothing." }], { fill: INHERIT_BG }),
  code("dir C:\\ProgramData\\Koi"),
  rich([tag("UNVERIFIED"), { text: "What follows is a suggested reading of that check, not a tested one. The inherited notes establish only the sentence above — that a fresh mtime is the proof of a round trip. The three interpretations below have not been reproduced in this session or in the notes, and are offered as a starting point for investigation, not as findings." }],
       { fill: INHERIT_BG, spacing: { before: 140 } }),
  table([3400, TW - 3400], [
    ["Observation", "Suggested next step — untested"],
    ["Backend responds, config files fresh", "Consistent with a healthy round trip including credentials. Look elsewhere"],
    ["Backend responds, config files stale", "Network is reachable, so look at enrolment, credentials, or a run failing before its config fetch"],
    ["Backend does not respond", "Look at the network path: egress filtering, proxy, TLS interception or DNS"],
  ], { fill: INHERIT_BG }),

  h2("B4. Extension display names come from _locales, not the manifest", BLUE),
  rich([tag("INHERITED"), { text: "Chrome stores a localization placeholder in manifest.json and the real display name in _locales\\<lang>\\messages.json. KOI resolves it the way Chrome does." }], { fill: INHERIT_BG }),
  code("C:\\Users\\<user>\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\<id>\\<version>_0\\manifest.json"),
  p("So a manifest whose name field reads __MSG_<key>__ is not corruption. Comparing KOI's display name against manifest.json:name alone produces a false mismatch."),

  h2("B5. Installed software needs both registry hives", BLUE),
  rich([tag("INHERITED"), { text: "Querying only the first hive misses every 32-bit application on a 64-bit host." }], { fill: INHERIT_BG }),
  code("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"),
  code("HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"),

  h2("B6. KOI bundles its own Python", BLUE),
  rich([tag("INHERITED"), { text: "KOI ships a bundled Python runtime, so PyPI packages appear in inventory on hosts where nobody ever installed Python — KOI is partly inventorying its own interpreter. Do not treat that as a false positive or as shadow IT." }], { fill: INHERIT_BG }),

  h2("B7. The powershell -Command - trap", BLUE),
  rich([tag("INHERITED"), { text: "powershell -Command - executes piped stdin line by line, so multi-line foreach and if blocks break apart. You get a header, no rows, and no error — a silently wrong answer." }], { fill: INHERIT_BG }),
  rich([{ text: "Use -EncodedCommand with base64 UTF-16LE instead:", bold: true }]),
  code("python3 -c \"import base64;print(base64.b64encode(open('s.ps1').read().encode('utf-16-le')).decode())\""),
  code("powershell -NoProfile -EncodedCommand <base64>"),

  h2("B8. Install path decides event collection", BLUE),
  rich([tag("INHERITED"), { text: "A pack zip built for the wrong marketplace target carries isfetchevents: false and ships no rules. This is the root cause behind symptom A1 and the reason A1 tells you to reinstall rather than edit the instance." }], { fill: INHERIT_BG }),
];

/* ============================ 9. Triage order ============================ */

const triageStep = newStep();
const triage = [
  new Paragraph({ children: [new PageBreak()] }),
  h1("4. Fast Triage Order"),
  p("Work down the list. The first check that fails localises the fault."),
  triageStep([{ text: "Is this the right pack? ", bold: true },
    { text: `Count the commands — this pack has exactly ${PACK.counts.commands} (section 1.1). Anything device-centric means you are on the custom pack and this guide does not apply.` }]),
  triageStep([{ text: "Commands or events? ", bold: true },
    { text: "They travel different routes. Failing commands point at the instance, the engine or the API; a missing dataset points at collection (A1); a single quiet host that has simply not been scanned produces nothing even while collection is healthy (A13)." }]),
  triageStep([{ text: "Does the instance have Fetch events at all? ", bold: true },
    { text: "No toggle means the wrong pack build — reinstall (A1, B8)." }]),
  triageStep([{ text: "Does koi_koi_raw resolve, and does it split into Audit and Alerts? ", bold: true },
    { text: "If it resolves but your query returns nothing, filter on source_log_type first (section 2.2)." }]),
  triageStep([{ text: "Are you counting Alerts? ", bold: true },
    { text: "The Alerts stream is massively duplicated — one row per alert per fetch. Dedupe on the notification id before counting, or before firing per row (A11)." }]),
  triageStep([{ text: "Is the query reading a field that is never populated? ", bold: true },
    { text: "xdm.* never fills (A2); alert_type is always null (A4); resources/observables/metadata need json_extract (A3)." }]),
  triageStep([{ text: "Is the command failing with HTTP 400? ", bold: true },
    { text: "Check view against the API's accepted set, not the dropdown (A5), check that filter_json carries {combinator, rules} (A6), and if the 400 is on a marketplace value, confirm it is the API long form and not the event short form (A12)." }]),
  triageStep([{ text: "Installed something the scan should have caught? ", bold: true },
    { text: "It is inventoried only if it is in a user-profile path — a SYSTEM-profile install is invisible (A14)." }]),
  triageStep([{ text: "Are you testing the path the integration actually uses? ", bold: true },
    { text: "These instances run on an engine — a test from the tenant proves nothing (A8)." }]),
  triageStep([{ text: "Only then look at the endpoint, ", bold: true },
    { text: "and read Part B as prior evidence rather than as verified fact for this pack." }]),
];

/* ============================ 10. Command reference ============================ */

const reference = [
  new Paragraph({ children: [new PageBreak()] }),
  h1("5. Command Reference — Generated From the Pack"),
  rich([tag("YAML"), { text: `Every row below is emitted at build time from ${PACK.source.path} (md5 ${PACK.source.md5}). Nothing here is hand-typed, so it cannot drift from the pack.` }]),
  rich([{ text: `${BADGE_KINDS} kinds of badge appear on the command blocks below. Every block carries exactly one of the first two; the other ${BADGE_KINDS - 2} appear only where they apply, so a block may carry one badge or several.`, bold: true }]),
  rich([tag("LIVE"), { text: `"${BADGE.exercised}" marks the ${EXERCISED.length} commands whose endpoint was called on that date. "${BADGE.notRun}" marks the ${STATE_CHANGING.length} that were deliberately never called. No command in this section was executed through XSIAM (section 3), so nothing here describes war-room output. ` },
        tag("YAML"), { text: `The remaining ${BADGE_KINDS - 2} come from the pack: "${BADGE.execution}" on the ${EXECUTION_CMDS.length} commands the pack flags; "${BADGE.unflagged}" on the ${STATE_CHANGING.length - EXECUTION_CMDS.length} that mutate state without that flag; "${BADGE.noOutputs}" on the ${NO_OUTPUT_CMDS.length} that declare no outputs; and "${BADGE.notRepeatable}" on ${NOT_REPEATABLE.join(", ")}.` }]),
  rich([tag("YAML"), { text: `That last badge rests on two different sources. The pack's own description of ${NOT_REPEATABLE.join(", ")} says to use it for development and debugging only, as it may produce duplicate events, exceed API rate limits or disrupt the fetch mechanism, and the YAML declares a should_push_events argument (default ${PUSH_ARG ? PUSH_ARG.defaultValue : "false"}) described as pushing events to Cortex XSIAM. ` },
        tag("CODE"), { text: `That the destination is koi_koi_raw is not in the YAML — it follows from send_events_to_xsiam(vendor="koi", product="koi") in Koi.py, read from the source. The argument is handled by the integration and is not a parameter of the underlying GET, so nothing was pushed by the direct API requests made here.` }]),
  rich([{ text: `Being non-mutating is not the same as being repeatable: ${EXERCISED.length - NOT_REPEATABLE.length} of the ${EXERCISED.length} commands whose API was exercised are freely repeatable, and that one is not.` }]),
  ...CMDS.flatMap(c => {
    const args = c.arguments || [];
    const outs = c.outputs || [];
    const blocks = [
      h2(c.name),
      rich([{ text: c.description }], { spacing: { after: 100 }, keepNext: true }),
      rich([
        { text: ENDPOINTS[c.name][0] + " " + ENDPOINTS[c.name][1], font: "Consolas", size: 19, color: GRAY },
        { text: "   ·   " + args.length + " arguments   ·   " + outs.length + " outputs", size: 19, color: GRAY },
        ...(c.execution ? [{ text: "   ·   " + BADGE.execution, size: 19, bold: true, color: RED }] : []),
        ...(STATE_CHANGING.includes(c.name) && !c.execution
          ? [{ text: "   ·   " + BADGE.unflagged, size: 19, bold: true, color: RED }] : []),
        ...(outs.length === 0 ? [{ text: "   ·   " + BADGE.noOutputs, size: 19, bold: true, color: RED }] : []),
        ...(EXERCISED.includes(c.name)
          ? [{ text: "   ·   " + BADGE.exercised, size: 19, color: GREEN }]
          : [{ text: "   ·   " + BADGE.notRun, size: 19, bold: true, color: AMBER }]),
        ...(NOT_REPEATABLE.includes(c.name)
          ? [{ text: "   ·   " + BADGE.notRepeatable, size: 19, bold: true, color: AMBER }] : []),
      ], { keepNext: true }),
    ];
    if (args.length) {
      blocks.push(table([3450, 800, 1600, TW - 5850],
        [["Argument", "Req.", "Default", "Predefined values / notes"]].concat(
          args.map(a => [
            a.name,
            a.required ? "yes" : "no",
            a.defaultValue === null ? "—" : String(a.defaultValue),
            a.predefined && a.predefined.length
              ? a.predefined.join(", ")
              : (a.isArray ? "free text (list)" : "free text"),
          ])), { mono: [0, 2, 3] }));
    } else {
      blocks.push(p("No arguments.", { italics: true, color: GRAY }));
    }
    if (outs.length) {
      blocks.push(p("Context outputs:", { spacing: { before: 120 }, bold: true, keepNext: true }));
      blocks.push(table([5050, 1000, TW - 6050],
        [["Context path", "Type", "Description"]].concat(
          outs.map(o => [o.contextPath, o.type, o.description])),   /* full text — never truncated */
        { mono: [0] }));
    }
    return blocks;
  }),
];

/* ============================ 11. Appendix ============================ */

const appendix = [
  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix — Provenance of This Document"),
  p("This guide is generated. Re-running the generator against the same four inputs produces the same document."),
  table([3800, TW - 3800], [
    ["Input", "Role"],
    ["reference/marketplace-pack.json", "[YAML] Mechanical extraction of the pinned Koi.yml. Every command, argument, default, predefined list, context path, configuration parameter and count in this document is read from it at build time."],
    ["VERIFIED_FACTS.md", "[LIVE] / [CODE] / [PACK] / [INHERITED] Everything observed on the tenant and the KOI API on 20–21 July 2026 — including the 21 July end-to-end scan, marketplace-vocabulary and Alerts-duplication findings (§7b–§7e) folded into A11–A14 — the facts read from Koi.py and command_examples.txt, what inspection of the pack directory establishes, plus the §8 endpoint findings inherited from the custom-pack investigation."],
    ["Packs/KoiContentExtension/", "[PACK] The separate companion pack. Its name, version and content counts on the cover (parsing rules, modeling rules, playbooks, dashboard) are read from its pack_metadata.json and directory at build time. It is additional content, not part of the Marketplace pack."],
    ["evidence/followup-probes.json", "[LIVE] Raw per-instance probe results, the LATER of the two sweeps. The view matrix in A5, the inventory and view rows in A7 (paired with the earlier sweep wherever the count moved) and the search failure-mode statuses in A6 are read from this file at build time, not transcribed. Its unfiltered_inventory section holds the later no-view inventory total for each instance, probed twice inside the one run — the generator fails rather than print a figure if those two attempts disagree."],
    ["evidence/command-sweep.json", "[LIVE] The EARLIER sweep. Read so that counts which moved between the two runs are printed as earlier → later pairs, both readings coming from the files themselves rather than one being chosen silently over the other. A count that reads the same in both files is printed once, with no arrow."],
    ["docs/build_troubleshooting.js", "This generator."],
  ], { mono: [0] }),
  callout("COUNTS IN THIS DOCUMENT ARE A SNAPSHOT",
    "On some figures the two sweeps of 20 July 2026 disagree, because inventory grew between them: " +
    DRIFT_SENTENCE + ", and " + INV_DRIFT_SENTENCE + ". The drift is per tenant — " + INV_STEADY_SENTENCE +
    " — and between runs, not within one. Both readings are correct as of their own run, and both are read from " +
    "the evidence files. Every count here is therefore a snapshot, never a pass/fail threshold — assert on shape " +
    "instead.", AMBER, "FFFBEB"),
  p("Composed rather than quoted:", { bold: true, spacing: { before: 240 } }),
  bullet([tag("DERIVED"), { text: "The XQL query strings in A1, A2, A3, A4 and A11. The dataset name, the discriminator field and every field name in them are [LIVE]; the query text itself was composed here and was not executed as written." }]),
  bullet([tag("DERIVED"), { text: "The war-room command lines (!koi-…) shown as examples. Argument names and values are [YAML] or [LIVE]; the commands could not be executed through XSIAM on this tenant — see section 3." }]),
  bullet([tag("DERIVED"), { text: "The two ASCII path diagrams in section 2, which restate the [LIVE] engine and endpoint facts in a different form." }]),
  p("How tagging is applied — the method, not a guarantee:", { bold: true, spacing: { before: 240 } }),
  bullet([{ text: "Tags are placed by hand, sentence by sentence. This document does not claim that every factual sentence in it carries a tag, and some do not: read an untagged sentence as inheriting the evidence level of the tagged statement it sits under, not as a stronger claim." }]),
  bullet([{ text: "Where tags are placed: the Evidence row of every Part A block, the lead statement of every Part B finding, and sentences elsewhere that assert something about the pack, the API or the tenant that a reader might otherwise have to take on trust." }]),
  bullet([{ text: "Deliberately untagged: the Symptom, Cause and Do this rows of Part A, the triage list in section 4, callouts, and headings. These are advice composed from the tagged Evidence row of the same block — not independent claims, and they carry no evidence of their own." }]),
  bullet([{ text: "Also untagged: consequence sentences that restate the operational implication of the tagged line immediately above them — for example B1's \"no Job run means no scan\" and B4's \"a manifest whose name field reads __MSG_<key>__ is not corruption\". They are reasoning from the [INHERITED] finding above them and are no better evidenced than it is." }]),
  bullet([{ text: "If any sentence, tagged or not, says more than its source supports, that is a defect in this generator; report it rather than trusting it." }]),
  p("Three claims that are easy to get wrong, stated here plainly: the API behind only 8 of the 13 commands was exercised, and only as direct HTTP requests — no koi-* command was ever executed through XSIAM on this tenant. 5 commands change tenant state while the pack flags only 2 of them, which is read from the HTTP method each one issues, not from having run them. And of the 8 whose API was exercised, 7 are freely repeatable — koi-get-events is not.",
    { spacing: { before: 160 }, italics: true, color: GRAY }),
  hr(),
  rich([{ text: "Pack documented: ", bold: true },
        { text: `${PACK.pack.name} ${PACK.pack.currentVersion} — ${PACK.source.repo}/${PACK.source.path}. Not the custom in-house pack (v1.3.0, 26 commands).` }]),
];

/* ============================ 12. Contents ============================ */
/* Built last, from the headings that registered themselves as they were constructed.
   Word users also get a live field they can update; it sits under the generated list. */

const buildContents = () => [
  p("Contents", { bold: true, size: 28 }),
  ...OUTLINE.map(o => new Paragraph({
    spacing: { after: o.level === 1 ? 60 : 30, before: o.level === 1 ? 120 : 0 },
    indent: { left: o.level === 1 ? 0 : 340 },
    children: [new TextRun({
      text: o.text, size: o.level === 1 ? 22 : 20, bold: o.level === 1,
      color: o.level === 1 ? o.color : GRAY, font: "Calibri" })],
  })),
  p("Section 5 lists all " + PACK.counts.commands + " commands individually; those headings are omitted here.",
    { italics: true, color: GRAY, size: 18, spacing: { before: 200 } }),
  new Paragraph({ children: [new PageBreak()] }),
];

/* ============================ 13. Assemble ============================ */

const FOOTER_TEXT = `KOI Marketplace pack v${PACK.pack.currentVersion} (demisto/content) — Troubleshooting & Data Provenance   ·   `;

const doc = new Document({
  title: `KOI Marketplace pack v${PACK.pack.currentVersion} — Troubleshooting & Data Provenance Guide v1.0`,
  description: `Troubleshooting guide for the official Marketplace KOI pack (${PACK.source.repo}/${PACK.source.path}, v${PACK.pack.currentVersion}, ${PACK.counts.commands} commands). Not the custom in-house pack.`,
  creator: "Generated by docs/build_troubleshooting.js",
  lastModifiedBy: "Generated by docs/build_troubleshooting.js",
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
      style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
      style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
  ] },
  styles: { paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 32, bold: true, color: ORANGE, font: "Calibri" } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 26, bold: true, color: SLATE, font: "Calibri" } },
  ] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: FOOTER_TEXT, size: 16, color: GRAY, font: "Calibri" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY, font: "Calibri" }),
        new TextRun({ text: " / ", size: 16, color: GRAY, font: "Calibri" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GRAY, font: "Calibri" }),
      ] })] }) },
    children: [
      ...cover, ...buildContents(), ...howToRead,
      ...identity, ...dataPath,
      ...partA_open, ...A1, ...A2, ...A3, ...A4, ...A5, ...A6, ...A7, ...A8, ...A9, ...A10,
      ...A11, ...A12, ...A13, ...A14,
      ...envFinding, ...partB, ...triage, ...reference, ...appendix,
    ],
  }],
});

/* docx stamps docProps/core.xml with the current clock, which would make two runs differ
   byte-for-byte. Pin it to the verification date and pin every zip entry's date, so the
   generator is genuinely idempotent: same inputs -> identical file. */
const STAMP_ISO = "2026-07-20T00:00:00Z";
const STAMP = new Date(STAMP_ISO);
const JSZip = require("jszip");

async function normalise(buf) {
  const zip = await JSZip.loadAsync(buf);
  const core = "docProps/core.xml";
  if (zip.files[core]) {
    const xml = (await zip.file(core).async("string"))
      .replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${STAMP_ISO}$2`)
      .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${STAMP_ISO}$2`);
    zip.file(core, xml);
  }
  for (const f of Object.values(zip.files)) f.date = STAMP;
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE",
    compressionOptions: { level: 9 }, streamFiles: false });
}

Packer.toBuffer(doc).then(normalise).then(buf => {
  const out = path.join(__dirname, "KOI_Marketplace_Pack_Troubleshooting_Guide_v1.0.docx");
  fs.writeFileSync(out, buf);
  console.log(`written ${buf.length} bytes -> ${out}`);
  console.log(`pack ${PACK.pack.name} v${PACK.pack.currentVersion} · ${PACK.counts.commands} commands · ` +
              `${DISTINCT_PATHS.length} distinct context paths · ${DUP_PATHS.length} duplicated · ` +
              `${NO_OUTPUT_CMDS.length} commands with no outputs`);
});
