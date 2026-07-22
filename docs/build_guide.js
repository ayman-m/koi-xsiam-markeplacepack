/*
 * Build "KOI Content Pack (Marketplace v1.2.3) — Customer Install & Usage Guide" (.docx)
 *
 * Visual language and helper functions reused from ../../KOI/docs/build_guide.js (custom pack).
 * ALL content is rebuilt for the OFFICIAL MARKETPLACE pack.
 *
 * Sources of fact (nothing else is permitted):
 *   A. ../reference/marketplace-pack.json  — mechanically derived from the pinned upstream
 *      Koi.yml (demisto/content@master, md5 5497cdddedeb0c0d7d0b371aa075a64c).
 *      Loaded at runtime; every command/argument/output/config table is generated FROM IT.
 *   B. ../VERIFIED_FACTS.md — verified on tenant api-ayman.xdr.eu.paloaltonetworks.com, 20 Jul 2026.
 *
 * Idempotent: fixed document timestamps, no randomness, no wall-clock reads.
 */
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} = require("docx");
const fs = require("fs");
const path = require("path");

const PACK = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "reference", "marketplace-pack.json"), "utf8"));

/* ---------------- design tokens (from the custom-pack generator) ---------------- */
const ORANGE = "E8551F";
const SLATE = "1F2937";
const GRAY = "6B7280";
const LIGHT = "F3F4F6";
const RED = "B91C1C";
const RED_BG = "FDECEC";
const AMBER_BG = "FEF6E7";
const HEADER_BG = "334155";
const CONTENT_W = 9360; // Letter, 1" margins

const FIXED_DATE = new Date(Date.UTC(2026, 6, 20, 0, 0, 0)); // keeps the build byte-identical

/* ---------------- helpers ---------------- */
const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, ...(opts.spacing || {}) },
    alignment: opts.align,
    children: [new TextRun({ text, size: opts.size || 22, bold: opts.bold, italics: opts.italics, color: opts.color || SLATE, font: opts.font || "Calibri" })],
    ...(opts.para || {}),
  });

const rich = (runs, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, ...(opts.spacing || {}) },
    children: runs.map(r => new TextRun({ size: 22, color: SLATE, font: "Calibri", ...r })),
  });

/* headings are recorded in document order so the contents page can be generated
   statically — a TOC field renders empty in every converter that does not run
   Word's field update, which left page 2 of the PDF blank. */
const HEADINGS = [];
const h1 = t => {
  HEADINGS.push({ level: 1, text: t });
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, keepNext: true, children: [new TextRun({ text: t, bold: true, size: 32, color: ORANGE, font: "Calibri" })] });
};
const h2 = t => {
  HEADINGS.push({ level: 2, text: t });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, keepNext: true, children: [new TextRun({ text: t, bold: true, size: 26, color: SLATE, font: "Calibri" })] });
};
const h3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 }, keepNext: true, children: [new TextRun({ text: t, bold: true, size: 22, color: HEADER_BG, font: "Calibri" })] });

const bullet = (t, opts = {}) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children: (Array.isArray(t) ? t : [{ text: t }]).map(r => new TextRun({ size: 22, color: SLATE, font: "Calibri", ...r })),
    ...opts,
  });

let __stepInstance = 0;
const newStep = () => {
  const instance = ++__stepInstance;
  return t =>
    new Paragraph({
      numbering: { reference: "steps", level: 0, instance },
      spacing: { after: 80 },
      children: (Array.isArray(t) ? t : [{ text: t }]).map(r => new TextRun({ size: 22, color: SLATE, font: "Calibri", ...r })),
    });
};

/* Paragraph shading runs to the right indent exactly, so a full line of code sits
   flush against the edge of the grey box. 9pt keeps the longest XQL line clear of it. */
const code = t =>
  new Paragraph({
    spacing: { after: 60 },
    shading: { type: ShadingType.CLEAR, fill: LIGHT },
    indent: { left: 220, right: 260 },
    children: [new TextRun({ text: t, font: "Consolas", size: 18, color: "111827" })],
  });

/* callout box: one-cell table with a coloured fill */
const callout = (title, body, { fill = AMBER_BG, accent = ORANGE } = {}) =>
  new Table({
    columnWidths: [CONTENT_W],
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill },
        margins: { top: 140, bottom: 140, left: 180, right: 180 },
        borders: { left: { style: BorderStyle.SINGLE, size: 18, color: accent } },
        children: [
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: title, bold: true, size: 22, color: accent, font: "Calibri" })] }),
          ...(Array.isArray(body) ? body : [body]).map(b =>
            new Paragraph({
              spacing: { after: 60 },
              children: (Array.isArray(b) ? b : [{ text: b }]).map(r => new TextRun({ size: 21, color: SLATE, font: "Calibri", ...r })),
            })),
        ],
      })],
    })],
  });

const cell = (t, { w, header = false, bold = false, mono = false, fill, small = false, monoSize, smallSize } = {}) =>
  new TableCell({
    width: { size: w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: header ? { type: ShadingType.CLEAR, fill: HEADER_BG } : (fill ? { type: ShadingType.CLEAR, fill } : undefined),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({
        text: t === null || t === undefined || t === "" ? "—" : String(t),
        size: header ? 21 : (mono && monoSize ? monoSize : (small ? (smallSize || 17) : 20)),
        bold: header || bold,
        color: header ? "FFFFFF" : SLATE,
        font: mono ? "Consolas" : "Calibri",
      })],
    })],
  });

const table = (widths, rows, opts = {}) =>
  new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: rows.map((r, i) => new TableRow({
      tableHeader: i === 0,
      cantSplit: true, // a row broken over a page leaves its identifier cell empty on the second page
      children: r.map((t, j) => cell(t, {
        w: widths[j],
        header: i === 0,
        bold: r.__bold && j === 0,
        mono: i > 0 && (r.__mono === j || (opts.mono || []).includes(j)),
        monoSize: opts.monoSize,
        smallSize: opts.smallSize,
        small: i > 0 && (opts.small || []).includes(j),
        fill: i > 0 ? r.__fill : undefined,
      })),
    })),
  });

const hr = () => new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ORANGE } }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

/* ---------------- data derived from marketplace-pack.json at runtime ---------------- */
const CMDS = PACK.commands;
const CFG = PACK.configuration;
const allOutputs = CMDS.flatMap(c => c.outputs);
const distinctPaths = [...new Set(allOutputs.map(o => o.contextPath))];
const dupPaths = distinctPaths.filter(pth => allOutputs.filter(o => o.contextPath === pth).length > 1);
const execCmds = CMDS.filter(c => c.execution).map(c => c.name);
const noOutputCmds = CMDS.filter(c => c.outputs.length === 0).map(c => c.name);
/* The context prefix of a command is derived from its OWN declared paths, not assumed to be the
   first two segments: koi-inventory-item-endpoints-list declares only Koi.Inventory.Endpoint.*,
   so calling its prefix Koi.Inventory would put it in a bucket it shares no path with (7.3).
   Take the longest common dotted-segment prefix of the command's outputs, never consuming a
   leaf segment; fall back to the distinct two-segment roots if the command spans more than one. */
const prefixOf = c => {
  if (!c.outputs.length) return "none";
  const segs = c.outputs.map(o => o.contextPath.split("."));
  const maxCommon = Math.min(...segs.map(s => s.length - 1));
  let i = 0;
  while (i < maxCommon && segs.every(s => s[i] === segs[0][i])) i++;
  return i > 0
    ? segs[0].slice(0, i).join(".")
    : [...new Set(segs.map(s => s.slice(0, 2).join(".")))].join(", ");
};
/* small counts read badly as digits at the start of a sentence; still derived, never typed */
const __WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen"];
const NUMWORD = (n, cap = false) => {
  const w = __WORDS[n] !== undefined ? __WORDS[n] : String(n);
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
};
const CFG_TYPE = { 0: "Short text", 8: "Boolean", 9: "Encrypted", 12: "Long text", 14: "Encrypted (credential)", 15: "Single select", 16: "Multi select", 17: "Fetch interval", 19: "Events fetch interval" };

/* API endpoint map — VERIFIED_FACTS.md §4.1. READ FROM Koi.py, the integration's source code:
   that is neither the YAML nor a live observation. 8 of the 11 distinct endpoints were also
   exercised by direct API request; PUT /policies/{id} and the POST/DELETE calls on
   /policies/allowlist and /policies/blocklist never were. Not invented. */
const ENDPOINTS = {
  "koi-get-events": "GET /alerts and GET /audit-logs",
  "koi-policy-list": "GET /policies",
  "koi-policy-status-update": "PUT /policies/{id}",
  "koi-allowlist-get": "GET /policies/allowlist",
  "koi-allowlist-items-add": "POST /policies/allowlist",
  "koi-allowlist-items-remove": "DELETE /policies/allowlist",
  "koi-blocklist-get": "GET /policies/blocklist",
  "koi-blocklist-items-add": "POST /policies/blocklist",
  "koi-blocklist-items-remove": "DELETE /policies/blocklist",
  "koi-inventory-list": "GET /inventory",
  "koi-inventory-search": "POST /inventory/search",
  "koi-inventory-item-get": "GET /inventory/{item_id}",
  "koi-inventory-item-endpoints-list": "GET /inventory/{item_id}/endpoints",
};

/* Which commands were actually exercised against the live API, and which were deliberately
   not run — VERIFIED_FACTS.md §1.1. 8 exercised, 5 held back because every one mutates
   tenant state. Not derivable from the YAML: recorded from the evidence file. */
const EXERCISED = [
  "koi-policy-list", "koi-allowlist-get", "koi-blocklist-get", "koi-inventory-list",
  "koi-inventory-item-get", "koi-inventory-item-endpoints-list", "koi-inventory-search",
  "koi-get-events",
];
const NOT_RUN = [
  "koi-policy-status-update", "koi-allowlist-items-add", "koi-allowlist-items-remove",
  "koi-blocklist-items-add", "koi-blocklist-items-remove",
];
/* Every command in NOT_RUN changes state. Only two of them carry execution: true. */
const MUTATING = NOT_RUN;
const unflaggedMutators = MUTATING.filter(n => !CMDS.find(c => c.name === n).execution);

/* Fail loudly rather than print a wrong count if the pinned source ever disagrees. */
for (const n of [...EXERCISED, ...NOT_RUN]) {
  if (!CMDS.find(c => c.name === n)) throw new Error("unknown command in evidence list: " + n);
}
if (EXERCISED.length + NOT_RUN.length !== CMDS.length) throw new Error("evidence lists do not cover all commands");

const PACK_LABEL = `${PACK.pack.name} — Marketplace pack v${PACK.pack.currentVersion} (demisto/content)`;

/* ---------------- Cover ---------------- */
const cover = [
  new Paragraph({ spacing: { before: 2200, after: 200 }, children: [new TextRun({ text: "KOI Content Pack", bold: true, size: 68, color: ORANGE, font: "Calibri" })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Marketplace edition, version " + PACK.pack.currentVersion, bold: true, size: 38, color: SLATE, font: "Calibri" })] }),
  hr(),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Customer Install & Usage Guide", size: 32, color: GRAY, font: "Calibri" })] }),
  table([2600, 6760], [
    ["Document", "KOI Content Pack — Customer Install & Usage Guide"],
    ["Pack", `${PACK.pack.name} (the pack published in the Cortex Marketplace)`],
    ["Pack version", PACK.pack.currentVersion],
    ["Source of record", `${PACK.source.repo} / ${PACK.source.path}`],
    ["Source md5", PACK.source.md5],
    ["Integration id / display", `${PACK.integration.id} / ${PACK.integration.display}`],
    ["Category", PACK.integration.category],
    ["Support / author", `${PACK.pack.support} / ${PACK.pack.author}`],
    ["Ships", `Integration only — ${PACK.counts.commands} commands, ${PACK.counts.arguments} arguments, ${PACK.counts.outputs} output declarations`],
    ["Applies to", "Cortex XSIAM (event collection + commands) and Cortex XSOAR (commands only)"],
    ["Optional companion pack", "KOI Content Extension (KoiContentExtension, v1.0.0) — parsing rules, modeling rules, 10 playbooks and a dashboard. SEPARATE, additional content; NOT part of this Marketplace pack (see 1.3)."],
    ["Document date", "20 July 2026"],
  ]),
  new Paragraph({ spacing: { before: 260 }, children: [] }),
  callout("This is the MARKETPLACE KOI pack, not a custom KOI pack", [
    [{ text: "There is more than one pack called " }, { text: "KOI", font: "Consolas", size: 20 }, { text: ". They share the pack name, the integration id " }, { text: "KOI", font: "Consolas", size: 20 }, { text: ", the category " }, { text: PACK.integration.category, font: "Consolas", size: 20 }, { text: ", the author \"" + PACK.pack.author + "\" and the " }, { text: "koi-*", font: "Consolas", size: 20 }, { text: " command namespace, so they are indistinguishable at a glance." }],
    [{ text: "This guide describes ONLY the pack identified in the table above: " + PACK.source.repo + " / " + PACK.source.path + ", version " + PACK.pack.currentVersion + ", " + PACK.counts.commands + " commands, integration only. Verify the version in the Marketplace before applying anything in this document.", bold: true }],
  ], { fill: RED_BG, accent: RED }),
  pageBreak(),
];

/* ---------------- 1. About ---------------- */
const about = [
  h1("1. About This Pack"),
  h2("1.1 What the pack is"),
  p(`The ${PACK.pack.name} pack connects Cortex to the KOI API. It contains a single content item: the ${PACK.integration.display} integration. The integration does two things — it collects KOI events into Cortex XSIAM, and it exposes ${PACK.counts.commands} commands for querying KOI inventory and for reading and changing KOI governance objects (policies, allowlist, blocklist).`),
  table([2900, 6460], [
    ["Property", "Value"],
    ["Pack name", PACK.pack.name],
    ["Pack version", PACK.pack.currentVersion],
    ["Pack created", PACK.pack.created],
    ["Support level", PACK.pack.support],
    ["Author", PACK.pack.author],
    ["Pack categories", PACK.pack.categories.join(", ")],
    ["Marketplaces", PACK.pack.marketplaces.join(", ")],
    ["Integration id", PACK.integration.id],
    ["Integration display name", PACK.integration.display],
    ["Integration category", PACK.integration.category],
    ["Minimum Cortex version (fromversion)", PACK.integration.fromversion],
    ["Docker image", PACK.integration.dockerimage],
    ["Event collector (isfetchevents)", `${String(PACK.integration.isfetchevents)}, but overridden to ${String(PACK.integration.isfetchevents_xsoar)} for xsoar — event collection is XSIAM / platform only`],
    ["Commands", String(PACK.counts.commands)],
    ["Command arguments", String(PACK.counts.arguments)],
    ["Declared outputs", `${PACK.counts.outputs} declarations across ${distinctPaths.length} distinct context paths`],
  ], { mono: [1] }),

  h2("1.2 Collision warning: this pack cannot coexist with a custom KOI pack"),
  callout("One tenant, one KOI pack", [
    [{ text: "A separate, privately built KOI pack exists (a different implementation, with a larger command set). It uses the ", }, { text: "same pack name (KOI)", bold: true }, { text: ", the " }, { text: "same integration id (KOI)", bold: true }, { text: ", the " }, { text: "same category (" + PACK.integration.category + ")", bold: true }, { text: " and the same " }, { text: "koi-*", font: "Consolas", size: 20 }, { text: " command names." }],
    [{ text: "Because Cortex keys content on those identifiers, the two packs cannot be installed side by side. Installing one over the other overwrites it: the integration definition, its commands and its instance configuration are replaced.", bold: true }],
    "Practical consequences: any playbook, automation or query built against the other pack's commands or context paths breaks silently at the point where a command it calls no longer exists. Decide which pack a tenant runs, and record that decision. If you are unsure which pack a tenant currently has, compare the command list in section 6 of this guide against the commands the installed integration actually offers.",
  ], { fill: RED_BG, accent: RED }),

  h2("1.3 What ships in the pack — and what does not"),
  p("This pack is an integration and nothing else. There are no playbooks, no automations, no parsing rules, no modeling rules, no dashboards, no layouts and no incident/alert types."),
  table([2600, 1500, 5260], [
    ["Content type", "In this pack", "What that means for you"],
    ["Integration", "Yes (1)", `The ${PACK.integration.display} integration: ${PACK.counts.commands} commands on every platform, plus an event collector that is enabled on Cortex XSIAM only (section 2.1).`],
    ["Playbooks", "No", "No triage, investigation or response automation ships with the pack. Any automation is yours to build."],
    ["Automations / scripts", "No", "No helper scripts are installed."],
    ["Parsing rules", "No", "Collected events are stored exactly as the collector sends them. No field promotion, no reshaping."],
    ["Modeling rules", "No", "Events are NOT normalised to XDM. No Cortex Data Model field is populated by this pack."],
    ["Dashboards / widgets", "No", "No KOI dashboard is installed. Build your own on the raw dataset (section 8)."],
    ["Layouts, incident/alert types", "No", "KOI events are not turned into typed alerts by this pack."],
  ]),
  callout("Events are not normalised", [
    "Because the pack ships no parsing rule and no modeling rule, KOI events land raw. Verified on the tenant: no XDM field is populated at all — every query, correlation rule, dashboard widget and report you build must target the raw KOI field names shown in section 8. Content that assumes XDM (for example, generic XDM-based correlation rules) will not match KOI data.",
    [{ text: "Sources: that the pack ships no parsing rule and no modeling rule is from inspecting the pack's own contents; that no XDM field is populated is from VERIFIED_FACTS.md §3.2 (live, 20 July 2026).", italics: true, color: GRAY }],
  ]),
  /* spacer paragraph terminates the adjacent-table chain so LibreOffice does not repeat the
     content-types table header at the top of the page this callout flows onto */
  new Paragraph({ spacing: { after: 0 }, children: [] }),
  callout("An optional companion pack adds the missing content — as SEPARATE content", [
    [{ text: "Everything this pack lacks — parsing rules, modeling rules, playbooks and a dashboard — is available in a separate, optional companion pack, " }, { text: "KOI Content Extension", bold: true }, { text: " (pack folder " }, { text: "KoiContentExtension", font: "Consolas", size: 20 }, { text: ", currentVersion 1.0.0, community support). It ships " }, { text: "no integration and no commands of its own", bold: true }, { text: ": it normalises and models the " }, { text: "koi_koi_raw", font: "Consolas", size: 20 }, { text: " dataset this integration produces, and adds 10 investigation and response playbooks built strictly against the 13 commands documented here, plus one alerts dashboard." }],
    [{ text: "It is additional content and is NOT part of the Marketplace KOI pack described in this guide. It declares the KOI pack as a mandatory dependency, so this Marketplace pack must be installed first. Install the companion pack only if you want the normalisation and playbooks; nothing in this guide requires it.", bold: true }],
    [{ text: "Source: the companion pack's own pack_metadata.json and its contents under Packs/KoiContentExtension/. This is outside the VERIFIED_FACTS evidence base for the Marketplace pack.", italics: true, color: GRAY }],
  ], { fill: AMBER_BG, accent: ORANGE }),
];

/* ---------------- 2. Requirements ---------------- */
const requirements = [
  h1("2. Requirements"),
  h2("2.1 Platform"),
  table([2900, 6460], [
    ["Requirement", "Value"],
    ["Minimum Cortex version", `${PACK.integration.fromversion} (the integration's fromversion)`],
    ["Docker image", PACK.integration.dockerimage],
    ["Event collection", `Cortex XSIAM / platform only. The YAML sets isfetchevents = ${PACK.integration.isfetchevents} and then overrides it with isfetchevents:xsoar = ${PACK.integration.isfetchevents_xsoar}; every Collect-section parameter is additionally hidden on xsoar. On an XSOAR tenant the pack is a command integration and nothing else.`],
    ["Marketplaces the pack targets", PACK.pack.marketplaces.join(", ") + " — note that xsoar is still listed even though the collector is disabled there"],
  ], { mono: [1] }),
  callout("On XSOAR this pack collects no events at all", [
    [{ text: "The pack advertises an event collector, but it is switched off for the xsoar marketplace at the source level: " }, { text: `isfetchevents: ${PACK.integration.isfetchevents}` , font: "Consolas", size: 20 }, { text: " is immediately followed by " }, { text: `isfetchevents:xsoar: ${PACK.integration.isfetchevents_xsoar}`, font: "Consolas", size: 20 }, { text: ", and the Collect parameters carry " }, { text: "hidden: [xsoar]", font: "Consolas", size: 20 }, { text: "." }],
    "Everything in section 8 of this guide — the dataset, the schemas, the XQL — applies to Cortex XSIAM only. On XSOAR you get the commands and nothing else.",
    [{ text: "Source: the pinned pack source (lines 990–991) and VERIFIED_FACTS.md §2.", italics: true, color: GRAY }],
  ], { fill: RED_BG, accent: RED }),
  h2("2.2 KOI API access"),
  bullet([{ text: "An API key for your KOI tenant. ", bold: true }, { text: "The pack's own parameter help for " }, { text: "api_key", font: "Consolas", size: 20 }, { text: " reads: \"" + (CFG.find(c => c.name === "api_key").additionalinfo || "") + "\"" }]),
  bullet([{ text: "Authentication is a bearer token: the integration sends " }, { text: "Authorization: Bearer <api_key>", font: "Consolas", size: 20 }, { text: "." }]),
  bullet([{ text: "API base: " }, { text: "https://api.prod.koi.security", font: "Consolas", size: 20 }, { text: " with the path prefix " }, { text: "/api/external/v2", font: "Consolas", size: 20 }, { text: ". The default value of the Server URL parameter is " }, { text: String(CFG.find(c => c.name === "url").defaultvalue), font: "Consolas", size: 20 }, { text: "." }]),
  p("Source: VERIFIED_FACTS.md §4.1 (endpoint map read from the integration's Koi.py) and marketplace-pack.json (parameter defaults).", { italics: true, color: GRAY }),
  h2("2.3 Network path"),
  p("Whatever executes the integration must reach the KOI API over outbound HTTPS (TCP 443) to api.prod.koi.security. That executor is either the Cortex tenant itself or a Cortex engine."),
  callout("If you run through an engine, test from the engine", [
    "On the reference deployment both KOI instances run through a Cortex engine rather than direct tenant egress. When an engine is in the path, a connectivity test performed from the tenant proves nothing: the traffic does not take that route. Test reachability from the engine host.",
    [{ text: "Source: VERIFIED_FACTS.md §2 (live).", italics: true, color: GRAY }],
  ]),
];

/* ---------------- 3. Install ---------------- */
const stepInstall = newStep();
const install = [
  h1("3. Installing the Pack"),
  p("The pack is published in the Cortex Marketplace and is installed from there. No SDK, no zip and no manual item import is required."),
  stepInstall([{ text: "Confirm no conflicting KOI pack is present. ", bold: true }, { text: "See section 1.2. If a different KOI pack (same name, same integration id) is installed, installing this one replaces it." }]),
  stepInstall([{ text: "Open the Marketplace ", bold: true }, { text: "in your Cortex tenant and search for " }, { text: PACK.pack.name, font: "Consolas", size: 20 }, { text: "." }]),
  stepInstall([{ text: "Check the version. ", bold: true }, { text: "This guide describes version " + PACK.pack.currentVersion + ". If the Marketplace offers a newer version, re-check the command list and parameters against the release notes before relying on this document." }]),
  stepInstall([{ text: "Install the pack, ", bold: true }, { text: "then confirm that the " }, { text: PACK.integration.display, font: "Consolas", size: 20 }, { text: " integration appears in the integrations list and that nothing else did — no playbooks, no rules, no dashboards (section 1.3)." }]),
  p("Navigation labels ↑ are Cortex UI wording and are not part of the pack sources; they were not re-verified for this document. Everything about the pack itself (name, version, contents) is from the pinned source.", { italics: true, color: GRAY }),
];

/* ---------------- 4. Instance configuration ---------------- */
const configSection = [
  h1("4. Configuring an Integration Instance"),
  p(`The integration declares ${CFG.length} configuration parameters. The table below is generated from the pack source, so it lists every parameter the integration actually has — including the ones that appear only on Cortex XSIAM.`),
  h2("4.1 All configuration parameters"),
  /* col 0 holds event_types_to_fetch (20 chars) and col 3 the default Server URL;
     both wrapped mid-token at the previous widths. */
  table([2500, 1500, 1050, 2000, 2310], [
    ["Parameter name", "Display name", "Required", "Default", "Purpose"],
    ...CFG.map(c => {
      const r = [
        c.name,
        c.display,
        c.required ? "Yes" : "No",
        c.defaultvalue === null || c.defaultvalue === undefined ? "—" : String(c.defaultvalue),
        (c.additionalinfo && c.additionalinfo.trim()) ? c.additionalinfo.trim() : "(no help text in the pack)",
      ];
      r.__mono = 0;
      return r;
    }),
  ], { small: [3, 4], monoSize: 18 }),
  h2("4.2 How the parameters are grouped and typed"),
  table([2500, 1200, 1650, 1100, 2910], [
    ["Parameter", "Section", "Type", "Advanced", "Hidden on"],
    ...CFG.map(c => {
      const r = [
        c.name,
        c.section || "—",
        CFG_TYPE[c.type] !== undefined ? `${CFG_TYPE[c.type]} (${c.type})` : String(c.type),
        c.advanced ? "Yes" : "No",
        c.hidden && c.hidden.length ? c.hidden.join(", ") : "—",
      ];
      r.__mono = 0;
      return r;
    }),
  ], { small: [1, 2, 3, 4], monoSize: 18 }),
  p("Parameters hidden on the xsoar marketplace are the event-collection parameters: they are shown on Cortex XSIAM only. Together with the isfetchevents:xsoar override (section 2.1), this means an XSOAR instance has no collector to configure.", { italics: true, color: GRAY }),
  h2("4.3 A known-good configuration"),
  p("The configuration below was in use on both instances of the reference tenant on 20 July 2026, and is a reasonable starting point:"),
  table([2900, 6460], [
    ["Parameter", "Value in use"],
    ["url (Server URL)", "https://api.prod.koi.security/"],
    ["isFetchEvents (Fetch events)", "true"],
    ["event_types_to_fetch", "Alerts, Audit"],
    ["audit_types_filter", "empty (no filter — all audit types)"],
    ["max_fetch", "5000"],
    ["eventFetchInterval", "1 (minute)"],
    ["insecure / proxy", "false / false"],
  ], { mono: [1] }),
  p("Source: VERIFIED_FACTS.md §2 (live).", { italics: true, color: GRAY }),
  callout("Two instances, one dataset", [
    "If you configure more than one instance with event collection enabled, all of them write into the same koi_koi_raw dataset, and the pack ships no field identifying which instance produced a row. On the reference tenant, two instances (KOI_PAET and KOI_PLTS) fetch Alerts and Audit into that one dataset. If you need to tell the sources apart, plan for it before you turn on the second collector.",
    [{ text: "Source: VERIFIED_FACTS.md §2 (live).", italics: true, color: GRAY }],
  ]),
];

/* ---------------- 5. Verify ---------------- */
const stepVerify = newStep();
const verifySection = [
  h1("5. Verifying the Instance"),
  stepVerify([{ text: "Run the instance Test. ", bold: true }, { text: "This exercises the Server URL and the API key." }]),
  stepVerify([{ text: "Run a read-only command from the CLI / War Room, ", bold: true }, { text: "for example:" }]),
  code("!koi-policy-list limit=5"),
  code("!koi-inventory-list limit=5"),
  stepVerify([{ text: "If event collection is enabled, ", bold: true }, { text: "wait one fetch interval and query the dataset (section 8)." }]),
  callout("What could not be verified for this document", [
    [{ text: `The API behind ${EXERCISED.length} of the ${PACK.counts.commands} commands — not all of them — was exercised one layer down`, bold: true }, { text: ", by direct request to the KOI API endpoints listed in section 6, using the same bearer authentication and the same API keys the instances use. These are the commands whose endpoints that covers:" }],
    [{ text: EXERCISED.join(", "), font: "Consolas", size: 19 }],
    [{ text: `The remaining ${NOT_RUN.length} were deliberately NOT run, because every one of them changes state in your KOI tenant`, bold: true }, { text: ":" }],
    [{ text: NOT_RUN.join(", "), font: "Consolas", size: 19 }],
    [{ text: "Nothing in this guide describes the observed behaviour of those five. What is said about them comes from the pack's own files alone — the YAML for what they declare, Koi.py for the endpoints they would call." }],
    "No command was executed through the Cortex tenant used for verification, because that tenant rejects the API paths the tooling needs (investigation search returns a redirect, incident creation returns an empty body, and an API-key user's playground is created malformed so every command run there panics). No War Room output and no context mapping was ever observed.",
    "Established by the API-level testing: those endpoints exist, the parameters are accepted or rejected as documented, and the response shapes are as recorded. NOT established: the Cortex-side context mapping and human-readable output of any command — those come from the pack's own files (the YAML for what is declared, Koi.py for what the code does) and are presented as such throughout this guide.",
    [{ text: "Source: VERIFIED_FACTS.md §1.1 and §6.", italics: true, color: GRAY }],
  ]),
];

/* ---------------- 6. Command reference (generated) ---------------- */
/* koi-get-events does not change KOI state, but it is the one non-mutating command that is
   NOT freely repeatable: the pack calls it development/debugging only, and should_push_events
   writes events into koi_koi_raw. VERIFIED_FACTS.md §1.1. Give it its own cell wording rather
   than letting it inherit the plain "read-only" of the other seven. */
const NOT_REPEATABLE = "koi-get-events";

const cmdIndexRows = CMDS.map(c => {
  const mutates = MUTATING.includes(c.name);
  const r = [
    c.name,
    mutates
      ? (c.execution ? "Yes — flagged execution: true" : "Yes — NOT flagged")
      : (c.name === NOT_REPEATABLE
        ? "No — but not safe to repeat; can write to koi_koi_raw (9.5)"
        : "No — read-only, repeatable"),
    String(c.arguments ? c.arguments.length : 0),
    String(c.outputs.length),
    prefixOf(c),
  ];
  r.__mono = 0;
  if (c.execution) r.__fill = RED_BG;
  else if (mutates) r.__fill = AMBER_BG;
  return r;
});

const argTable = (c) => {
  const args = c.arguments || [];
  if (!args.length) return [p("This command takes no arguments.", { italics: true, color: GRAY })];
  return [
    p("Arguments", { bold: true, spacing: { before: 100, after: 60 }, para: { keepNext: true } }),
    /* Widths measured against the rendered PDF, not guessed. Four cells in this table
       hold strings that cannot be hyphenated and so dictate a minimum width:
         col 0  items_list_raw_json_entry_id  126.3pt at 7.5pt DejaVu Sans Mono
         col 1  the header "Required"          39.6pt
         col 2  the default Alerts,Audit       38.6pt at 8pt Carlito
         col 3  claude_desktop_extensions,     94.0pt at 8pt Carlito
         col 4  ...items_list_raw_json_entry_id in prose, ~100pt at 8pt Carlito
       Anything narrower breaks an identifier mid-token. */
    table([2800, 1040, 1060, 2160, 2300], [
      ["Argument", "Required", "Default", "Predefined values", "Description"],
      ...args.map(a => {
        const r = [
          a.name + (a.isArray ? " (list)" : ""),
          a.required ? "Yes" : "No",
          a.defaultValue === null || a.defaultValue === undefined || a.defaultValue === "" ? "—" : String(a.defaultValue),
          (a.predefined && a.predefined.length) ? a.predefined.join(", ") : "—",
          a.description,
        ];
        r.__mono = 0;
        return r;
      }),
    ], { small: [2, 3, 4], smallSize: 16, monoSize: 15 }),
  ];
};

const outTable = (c) => {
  if (!c.outputs.length) {
    return [
      p("Outputs", { bold: true, spacing: { before: 100, after: 60 }, para: { keepNext: true } }),
      callout("This command declares no outputs", [
        "It writes nothing to the context — it returns a War Room message only. A playbook cannot branch on its result, and a subsequent command cannot read what it did. If you need to confirm the change, follow it with the matching -get command.",
      ]),
    ];
  }
  return [
    p("Outputs", { bold: true, spacing: { before: 100, after: 60 }, para: { keepNext: true } }),
    /* the longest declared path, Koi.Inventory.Endpoint.last_logged_on_user, measures
       214.8pt at 8.5pt DejaVu Sans Mono and needs ~4500 twips including cell margins;
       the type column has to hold "Unknown" (~39pt at 10pt) on one line */
    table([4600, 1050, 3710], [
      ["Context path", "Type", "Description"],
      ...c.outputs.map(o => {
        const r = [o.contextPath, o.type, o.description];
        r.__mono = 0;
        return r;
      }),
    ], { small: [2], monoSize: 17 }),
  ];
};

const commandSection = [
  h1("6. Command Reference"),
  p(`Every table in this section is generated from the pinned pack source (${PACK.source.path}, md5 ${PACK.source.md5}). Nothing here is transcribed by hand. The pack declares ${PACK.counts.commands} commands, ${PACK.counts.arguments} arguments and ${PACK.counts.outputs} outputs.`),
  callout("Commands that are NOT in this pack", [
    [{ text: "The other KOI pack has a larger command set. These names do not exist here and will fail with \"unknown command\": " }],
    [{ text: "koi-devices-list, koi-device-inventory-get, koi-koidex-risk-report, koi-koidex-search, koi-remediations-list, koi-approval-requests-list, koi-findings-list, koi-users-list, koi-groups-list, koi-runtime-policies-list, koi-runtime-policy-get, koi-fetch-context-get, koi-fetch-context-set", font: "Consolas", size: 19 }],
    "There is likewise no Koi.Device.* context prefix in this pack (section 7).",
  ], { fill: RED_BG, accent: RED }),
  h2("6.1 Command index"),
  /* the "Outputs" header needs ~1100 twips or it wraps to "Output / s" */
  table([2900, 1900, 700, 1100, 2760], [
    ["Command", "Changes state (and is it flagged?)", "Args", "Outputs", "Context prefix"],
    ...cmdIndexRows,
  ], { small: [1, 4] }),
  rich([
    { text: `${MUTATING.length} of the ${PACK.counts.commands} commands change state in your KOI tenant, but only ${execCmds.length} are flagged execution: true`, bold: true },
    { text: ` in the pack source — ${execCmds.join(" and ")}. Cortex treats those two as potentially harmful and will require confirmation or explicit permission to run them from a playbook. The other ${unflaggedMutators.length} mutate governance state with no such flag and run without that guard: ` },
    { text: unflaggedMutators.join(", "), font: "Consolas", size: 20 },
    { text: `. Treat all ${MUTATING.length} as state-changing regardless of the flag — "not flagged" means not flagged, not safe. The remaining ${CMDS.length - MUTATING.length} commands change nothing in your KOI tenant, but only ${CMDS.length - MUTATING.length - 1} of them are freely repeatable.` },
  ]),
  rich([
    { text: NOT_REPEATABLE, font: "Consolas", size: 20 },
    { text: " is the exception, and the row above says so. ", bold: false },
    { text: "It is a GET and it changes nothing in KOI, but it is not safe to run repeatedly", bold: true },
    { text: ": the pack's own description of it says it is for development and debugging only, as it may produce duplicate events, exceed API rate limits, or disrupt the fetch mechanism. Its " },
    { text: "should_push_events", font: "Consolas", size: 20 },
    { text: " argument writes the events it retrieves into the " },
    { text: "koi_koi_raw", font: "Consolas", size: 20 },
    { text: " dataset when set to true, alongside whatever the collector is already fetching. Leave it at its default and do not put this command in a loop, a scheduled job, or a \"safe to re-run\" runbook step. See 9.5." },
  ]),
  p(`API endpoints quoted per command below are read from the integration's own source code, Koi.py (VERIFIED_FACTS.md §4.1) — that is the pack's source code, not its YAML and not by itself a live observation. The map has 11 entries; ${EXERCISED.length} of them were additionally exercised by direct API request, and the three behind the ${NOT_RUN.length} state-changing commands (PUT /policies/{id}, POST and DELETE on /policies/allowlist, POST and DELETE on /policies/blocklist) were never called. Everything else per command is from the pack source.`, { italics: true, color: GRAY }),
];

/* Event → command/API marketplace mapping — VERIFIED_FACTS.md §7c (live, 21 July 2026).
   The marketplace value recorded in a koi_koi_raw event uses short forms; the marketplace
   argument required by koi-inventory-item-get and koi-inventory-item-endpoints-list (and the
   API) uses long forms. Passing an event value straight through returns HTTP 400 where the two
   differ. built_in / side_loaded are installation_method values leaking into the marketplace
   field; ollama has no API equivalent. Event counts show only how common each value is. */
const MARKETPLACE_MAP = [
  ["software_windows", "5,301", "windows", ""],
  ["pypi", "4,674", "pypi", "unchanged — spelled the same in both"],
  ["chrome", "891", "chrome_web_store", ""],
  ["built_in", "829", "—", "installation_method value in the marketplace field; treat as unknown, do not pass on"],
  ["npm", "775", "npm", "unchanged — spelled the same in both"],
  ["software_mac", "617", "mac", ""],
  ["homebrew", "231", "homebrew", ""],
  ["vsc", "175", "vscode", ""],
  ["chocolatey", "91", "chocolatey", ""],
  ["cursor", "88", "cursor", ""],
  ["github", "65", "github_mcp_registry", ""],
  ["edge", "48", "edge_add_ons", ""],
  ["firefox", "19", "firefox_add_ons", ""],
  ["docker", "15", "docker", ""],
  ["npp", "12", "notepad++", ""],
  ["openvsx", "10", "open_vsx_registry", ""],
  ["jet", "5", "jetbrains", ""],
  ["ollama", "5", "—", "no API equivalent; treat as unknown, do not pass on"],
  ["claude_desktop_extensions", "5", "claude_desktop_extensions", "unchanged — spelled the same in both"],
  ["side_loaded", "1", "—", "installation_method value in the marketplace field; treat as unknown, do not pass on"],
];
const marketplaceMapTable = table(
  [2600, 1300, 2400, 3060],
  [
    ["Event value (koi_koi_raw)", "Events", "Command / API value", "Notes"],
    ...MARKETPLACE_MAP.map(r => { const row = r.slice(); row.__mono = 0; return row; }),
  ],
  { mono: [0, 2], small: [1, 3], monoSize: 17, smallSize: 16 },
);

CMDS.forEach((c, i) => {
  commandSection.push(h2(`6.${i + 2} ${c.name}`));
  if (c.execution) {
    commandSection.push(callout("Potentially harmful — flagged execution: true in the pack", [
      "This command changes state in your KOI tenant and is marked as potentially harmful in the pack source. Cortex gates it accordingly. Review the arguments before running it, and be aware that it declares no outputs, so nothing records what it removed.",
      [{ text: "It was not run during verification. Nothing in this guide describes its observed behaviour.", italics: true, color: GRAY }],
    ], { fill: RED_BG, accent: RED }));
  } else if (MUTATING.includes(c.name)) {
    commandSection.push(callout("Changes state — but is NOT flagged execution: true", [
      "This command modifies governance state in your KOI tenant, and the pack does not mark it as potentially harmful. It therefore runs without the confirmation Cortex applies to flagged commands. Treat it with the same care as the flagged ones.",
      [{ text: "It was not run during verification. Nothing in this guide describes its observed behaviour.", italics: true, color: GRAY }],
    ], { fill: AMBER_BG, accent: ORANGE }));
  } else if (c.name === NOT_REPEATABLE) {
    commandSection.push(callout("Read-only against KOI, but NOT safe to repeat", [
      "This command changes nothing in your KOI tenant, so it is not one of the five state-changing commands. It is still the one non-mutating command you should not re-run casually: the pack's own description says it is for development and debugging only, as it may produce duplicate events, exceed API rate limits, or disrupt the fetch mechanism.",
      [{ text: "should_push_events", font: "Consolas", size: 20 }, { text: " writes the retrieved events into the " }, { text: "koi_koi_raw", font: "Consolas", size: 20 }, { text: " dataset when set to true — the same dataset the collector writes to. Leave it at its default. Use the event collector for ingestion; use this command only to look at what the API returns." }],
      [{ text: "Source: the description is from the pack source; the caveat is recorded in VERIFIED_FACTS.md §1.1.", italics: true, color: GRAY }],
    ], { fill: AMBER_BG, accent: ORANGE }));
  }
  commandSection.push(p(c.description));
  commandSection.push(rich([
    { text: "API endpoint: ", bold: true },
    { text: ENDPOINTS[c.name] || "—", font: "Consolas", size: 20 },
    { text: "   ·   Context prefix: " , bold: true },
    { text: prefixOf(c), font: "Consolas", size: 20 },
  ]));
  argTable(c).forEach(x => commandSection.push(x));
  outTable(c).forEach(x => commandSection.push(x));
  /* The marketplace mapping is anchored here because koi-inventory-item-get is the first command
     that REQUIRES marketplace; koi-inventory-item-endpoints-list two commands below also does. */
  if (c.name === "koi-inventory-item-get") {
    commandSection.push(callout("Argument trap: the marketplace value in an event is not the marketplace value this command wants", [
      [{ text: "koi-inventory-item-get", font: "Consolas", size: 20 }, { text: " and " }, { text: "koi-inventory-item-endpoints-list", font: "Consolas", size: 20 }, { text: " both REQUIRE " }, { text: "marketplace", font: "Consolas", size: 20 }, { text: ". The value recorded in a " }, { text: "koi_koi_raw", font: "Consolas", size: 20 }, { text: " event is not the value these commands accept. Events use short forms (" }, { text: "software_windows", font: "Consolas", size: 19 }, { text: ", " }, { text: "chrome", font: "Consolas", size: 19 }, { text: ", " }, { text: "vsc", font: "Consolas", size: 19 }, { text: "); the argument and the API use long forms (" }, { text: "windows", font: "Consolas", size: 19 }, { text: ", " }, { text: "chrome_web_store", font: "Consolas", size: 19 }, { text: ", " }, { text: "vscode", font: "Consolas", size: 19 }, { text: "). Where they differ, passing the event value straight through returns " }, { text: "HTTP 400", bold: true }, { text: "." }],
      [{ text: "npm", font: "Consolas", size: 19 }, { text: " and " }, { text: "pypi", font: "Consolas", size: 19 }, { text: " are spelled the same in both; most other high-frequency values are not. Map every event value through the table below before calling either command. Three event values — " }, { text: "built_in", font: "Consolas", size: 19 }, { text: ", " }, { text: "side_loaded", font: "Consolas", size: 19 }, { text: " and " }, { text: "ollama", font: "Consolas", size: 19 }, { text: " — have no API equivalent (the first two are " }, { text: "installation_method", font: "Consolas", size: 19 }, { text: " values leaking into the marketplace field). Treat all three as \"unknown marketplace\" and do not pass them on." }],
      [{ text: "Source: VERIFIED_FACTS.md §7c (live, 21 July 2026).", italics: true, color: GRAY }],
    ], { fill: RED_BG, accent: RED }));
    commandSection.push(p("Event marketplace value → command / API marketplace value", { bold: true, spacing: { before: 100, after: 60 }, para: { keepNext: true } }));
    commandSection.push(marketplaceMapTable);
    commandSection.push(p("The Events column holds 21 July 2026 counts on the reference tenant and only indicates how common each value is — not an expected result. Source: VERIFIED_FACTS.md §7c (live).", { italics: true, color: GRAY }));
  }
});

/* ---------------- 7. Context model ---------------- */
const contextSection = [
  pageBreak(),
  h1("7. The Context Model"),
  h2("7.1 Five prefixes, and the casing is not a typo"),
  p(`The pack writes to ${PACK.contextPrefixes.length} context prefixes. Note the inconsistent casing: the event command writes KOI.Event.* in capitals, everything else writes Koi.*. This is what the pack declares. Do not "fix" it in your own content — DT expressions and context paths are case-sensitive, and correcting the case breaks the lookup.`),
  table([2300, 1000, 6060], [
    ["Prefix", "Paths", "Written by"],
    ...PACK.contextPrefixes.map(pref => {
      const paths = distinctPaths.filter(pth => pth.startsWith(pref + "."));
      const writers = CMDS.filter(c => c.outputs.some(o => o.contextPath.startsWith(pref + "."))).map(c => c.name);
      const r = [pref, String(paths.length), writers.join(", ")];
      r.__mono = 0;
      return r;
    }),
  ], { small: [2] }),
  p("Koi.Inventory.Endpoint.* is nested beneath Koi.Inventory and is counted within it above; it is the only place endpoints appear. That nesting is why four commands are listed against Koi.Inventory: koi-inventory-item-endpoints-list writes only the 10 nested Endpoint.* paths and shares no context path with the other three (see 7.3).", { italics: true, color: GRAY }),

  h2("7.2 The model is item-centric — there is no device object"),
  callout("Koi.Device.* does not exist in this pack", [
    "There is no device-listing command and no device context prefix. The count of 'Koi.Device.' occurrences is zero in the integration YAML, zero in Koi.py and zero in the integration README.",
    [{ text: "Endpoints are reached only from an item: run " }, { text: "koi-inventory-item-endpoints-list", font: "Consolas", size: 20 }, { text: " with an item_id, marketplace and version, and read " }, { text: "Koi.Inventory.Endpoint.*", font: "Consolas", size: 20 }, { text: ". You cannot start from a host and enumerate what it runs — the traversal only goes item → endpoints." }],
    [{ text: "Source: VERIFIED_FACTS.md §4.", italics: true, color: GRAY }],
  ], { fill: RED_BG, accent: RED }),
  p("If you need a per-device view, you must build it yourself by iterating items and grouping the endpoint results — accepting that this only ever covers items you have already listed."),

  h2("7.3 Three inventory commands write the same 27 paths — the last one wins"),
  rich([
    { text: `The pack declares ${PACK.counts.outputs} output declarations but only ${distinctPaths.length} distinct context paths. The difference, ${PACK.counts.outputs - distinctPaths.length}, is a count of redundant declarations, not of paths: ${dupPaths.length} distinct paths are declared by more than one command. ` },
    { text: "koi-inventory-list", font: "Consolas", size: 20 },
    { text: ", " },
    { text: "koi-inventory-item-get", font: "Consolas", size: 20 },
    { text: " and " },
    { text: "koi-inventory-search", font: "Consolas", size: 20 },
    { text: " — three commands, not four — declare an identical set of 27 Koi.Inventory.* item paths, and " },
    { text: "koi-policy-list", font: "Consolas", size: 20 },
    { text: " and " },
    { text: "koi-policy-status-update", font: "Consolas", size: 20 },
    { text: " share all nine Koi.Policy.* paths. 27 + 9 = the " + dupPaths.length + " shared paths." },
  ]),
  rich([
    { text: "koi-inventory-item-endpoints-list is not part of this collision.", bold: true },
    { text: " It appears under Koi.Inventory in the table in 7.1 only because " },
    { text: "Koi.Inventory.Endpoint.*", font: "Consolas", size: 20 },
    { text: " is nested there. It writes those 10 nested paths and nothing else, and shares no context path with the other three, so it neither overwrites them nor is overwritten by them." },
  ]),
  callout("Ordering hazard in playbooks", [
    "Because those three commands write the same 27 paths, the last one to run overwrites the previous one's context. A playbook that lists inventory, then fetches one item, then reads Koi.Inventory expecting the list gets the single item instead.",
    "Two ways to avoid it: read the context immediately after the command that produced it and copy it into your own key (for example with Set), or do not mix the three in one playbook branch.",
  ]),
  h2("7.4 Four commands write nothing at all"),
  rich([
    { text: `${noOutputCmds.length} commands declare no outputs: ` },
    { text: noOutputCmds.join(", "), font: "Consolas", size: 20 },
    { text: ". They return a War Room message only. A playbook cannot test whether they succeeded from context, and a downstream task has nothing to consume. To confirm the result, call " },
    { text: "koi-allowlist-get", font: "Consolas", size: 20 },
    { text: " or " },
    { text: "koi-blocklist-get", font: "Consolas", size: 20 },
    { text: " afterwards and compare the list." },
  ]),
];

/* ---------------- 8. Event collection ---------------- */
const eventsSection = [
  pageBreak(),
  h1("8. Event Collection and Querying"),
  p("This whole section applies to Cortex XSIAM only. The pack's event collector is disabled for the xsoar marketplace at the source level (section 2.1), so on an XSOAR tenant there is no collector, no dataset and nothing to query.", { bold: true }),
  h2("8.1 The dataset"),
  rich([
    { text: "On XSIAM, with Fetch events enabled, KOI events land in the dataset " },
    { text: "koi_koi_raw", font: "Consolas", size: 20, bold: true },
    { text: ", with " },
    { text: "_vendor = \"koi\"", font: "Consolas", size: 20 },
    { text: " and " },
    { text: "_product = \"koi\"", font: "Consolas", size: 20 },
    { text: ". This was confirmed on the live tenant: over a 30-day window (20 June – 20 July 2026) the dataset held 20,156 events across 80 distinct hostnames. The pack never declares the dataset name anywhere in its content — it follows from the vendor/product pair the collector sends." },
  ]),
  h2("8.2 One dataset, two incompatible schemas"),
  rich([
    { text: "The field " },
    { text: "source_log_type", font: "Consolas", size: 20 },
    { text: " is the discriminator. Audit rows and Alert rows share nothing: every OCSF field is null on Audit rows, and every Audit field is null on Alert rows. Treat them as two datasets that happen to share a name." },
  ]),
  table([1800, 1700, 5860], [
    ["source_log_type", "Count (30 days)", "Schema"],
    ["Audit", "19,842", "Flat, KOI-native: type, action, category, object_name, object_type, hostname, item_version."],
    ["Alerts", "314", "OCSF: class_uid 2007 (\"Application Security Posture Finding\"), type_uid 200701, is_alert true, severity_id, confidence_id, risk_level_id, status_id."],
  ], { mono: [0] }),
  p("Observed Audit type values and counts over that window: extensions 16,579 · devices 2,971 · remediation 244 · policies 32 · approval_requests 8 · guardrails 6 · notifications 2. Observed category values: system 16,825 · user 3,017."),
  p("Counts are from the reference tenant over 20 June – 20 July 2026 and are illustrative of shape, not of your volume. Source: VERIFIED_FACTS.md §3.", { italics: true, color: GRAY }),
  callout("Two traps that make queries return nothing", [
    [{ text: "1. On alert rows, ", bold: true }, { text: "resources", font: "Consolas", size: 20 }, { text: ", " }, { text: "observables", font: "Consolas", size: 20 }, { text: " and " }, { text: "metadata", font: "Consolas", size: 20 }, { text: " are JSON strings, not objects. A query that treats them as structured fields silently returns nothing — no error, just no rows. You must extract from the string." }],
    [{ text: "2. ", bold: true }, { text: "alert_type", font: "Consolas", size: 20 }, { text: " is never populated. A filter of alert_type != null over the full 30-day window returned zero rows. Any query, correlation rule or playbook keyed on alert_type matches nothing here." }],
    [{ text: "Source: VERIFIED_FACTS.md §3.1 (live).", italics: true, color: GRAY }],
  ], { fill: RED_BG, accent: RED }),

  h2("8.3 The Alerts stream is duplicated — every alert count must dedupe"),
  callout("Counting Alert rows overcounts by hundreds of times — read this before writing any alert query", [
    [{ text: "This is the single most important thing to know before you query alerts. " }, { text: "The integration re-sends every still-open alert on every fetch cycle", bold: true }, { text: ", so " }, { text: "koi_koi_raw", font: "Consolas", size: 20 }, { text: " holds one row PER ALERT PER FETCH, not one row per alert. With " }, { text: "eventFetchInterval = 1", font: "Consolas", size: 20 }, { text: " minute, a single open alert becomes hundreds of identical rows over a day (357 rows sharing one " }, { text: "_time", font: "Consolas", size: 20 }, { text: " and one message, with 357 distinct " }, { text: "_insert_time", font: "Consolas", size: 20 }, { text: " values, were observed inside one notification)." }],
    [{ text: "Over the last 24 hours on the reference tenant (21 July 2026), the Alerts stream held " }, { text: "734 rows for just 3 distinct alerts — 244.7× inflation", bold: true }, { text: ". " }, { text: "Audit is NOT affected", bold: true }, { text: ": each audit record is point-in-time and carries a unique KOI " }, { text: "id", font: "Consolas", size: 20 }, { text: " (257 rows / 257 distinct over the same 24 h). This is an Alerts-only problem." }],
    [{ text: "Source: VERIFIED_FACTS.md §7e (live, 21 July 2026).", italics: true, color: GRAY }],
  ], { fill: RED_BG, accent: RED }),
  table([1500, 1500, 1300, 2400, 2660], [
    ["Stream", "Window", "Rows", "Distinct alerts", "Inflation"],
    ["Alerts", "last 24 h", "734", "3", "244.7×"],
    ["Alerts", "last 90 d", "1,048", "317", "3.3×"],
    ["Audit", "last 24 h", "257", "257 (by KOI id)", "1.0 — none"],
    ["Audit", "last 90 d", "20,148", "20,148", "1.0 — none"],
  ], { small: [4] }),
  p("Figures are from the reference tenant on 21 July 2026 and are illustrative of shape, not of your volume. Source: VERIFIED_FACTS.md §7e (live).", { italics: true, color: GRAY }),
  rich([
    { text: "The only correct dedupe key is " },
    { text: "metadata.notification_event_id", font: "Consolas", size: 20 },
    { text: ". Over the 90-day window it has 317 distinct values across 1,048 alert rows — a verified 1:1 identity for a single alert occurrence. The other candidate identifiers are wrong at both extremes, so do not reach for them:" },
  ]),
  table([3800, 1800, 3760], [
    ["Field", "Distinct / 1,048 rows", "What it identifies"],
    ["_id", "1,048", "the row — counts every duplicate"],
    ["metadata.notification_event_id", "317", "the alert occurrence — use this"],
    ["observables[event.id] (koi_event_id)", "20", "the scan batch — far too coarse"],
    ["finding_info.uid (finding_uid)", "3", "the finding / policy definition — far too coarse"],
  ], { mono: [0], small: [1], monoSize: 16 }),
  p("Any query, widget, correlation rule or playbook that counts alerts must dedupe on this key. Because the pack ships no parsing rule, there is no promoted column — extract it inline from the raw metadata field. This is the corrected count:", { para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code('| filter source_log_type = "Alerts"'),
  code('| alter koi_notification_id = json_extract_scalar(metadata, "$.notification_event_id")'),
  code("| comp count_distinct(koi_notification_id) as alerts"),
  rich([
    { text: "On the reference data for the last 24 hours (21 July 2026) this returns " },
    { text: "3", bold: true },
    { text: ", where the naive " },
    { text: "comp count() as alerts", font: "Consolas", size: 20 },
    { text: " returns " },
    { text: "734", bold: true },
    { text: ". A triage playbook that reacts per alert row will likewise fire hundreds of times for one real alert unless it dedupes on the same key." },
  ]),
  p("Source: VERIFIED_FACTS.md §7e (live, 21 July 2026). The XQL is constructed from the verified field name and was not itself re-executed on the tenant.", { italics: true, color: GRAY }),

  h2("8.4 No XDM — query the raw fields"),
  p("The pack ships no parsing rule and no modeling rule, so nothing maps this data to the Cortex Data Model. No XDM field is populated. Every query below targets raw field names deliberately."),
  h2("8.5 XQL starting points"),
  p("Confirm the collector is delivering, and see the split:", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code("| comp count() as events by source_log_type"),
  p("Most recent rows, whichever stream:", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code("| sort desc _time"),
  code("| limit 20"),
  p("Audit activity broken down by type and category:", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code('| filter source_log_type = "Audit"'),
  code("| comp count() as events by type, category"),
  code("| sort desc events"),
  p("Audit events for one host:", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code('| filter source_log_type = "Audit" and hostname = "<HOSTNAME>"'),
  code("| fields _time, type, action, category, object_name, object_type, item_version"),
  code("| sort desc _time"),
  p("Alerts, with the OCSF fields that are actually populated:", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code('| filter source_log_type = "Alerts"'),
  code("| fields _time, class_uid, type_uid, severity_id, confidence_id, risk_level_id, status_id"),
  code("| sort desc _time"),
  p("Alert severity distribution — count_distinct on the dedupe key, not count(), because the Alerts stream is duplicated (8.3):", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code('| filter source_log_type = "Alerts"'),
  code('| alter koi_notification_id = json_extract_scalar(metadata, "$.notification_event_id")'),
  code("| comp count_distinct(koi_notification_id) as alerts by severity_id"),
  code("| sort desc alerts"),
  p("Reading the JSON-string fields on alert rows — this is the form that works:", { bold: true, para: { keepNext: true } }),
  code("dataset = koi_koi_raw"),
  code('| filter source_log_type = "Alerts"'),
  code('| alter resources_obj = json_extract(resources, "$")'),
  code('| alter metadata_obj  = json_extract(metadata, "$")'),
  code("| fields _time, resources_obj, metadata_obj"),
  p("The field names and the JSON-string behaviour above are verified (VERIFIED_FACTS.md §3). The XQL statements themselves are constructed from those field names for this guide and were not each re-executed on the tenant; adjust the extraction path inside json_extract to the element you need.", { italics: true, color: GRAY }),
];

/* ---------------- 9. Known issues ---------------- */
const issuesSection = [
  pageBreak(),
  h1("9. Known Issues, Gaps and Behaviours to Know About"),
  p("This section has five subsections holding seven findings, of four different kinds — defects, a documentation gap, a response-shape observation and behaviours worth knowing — not seven defects. Two are defects in the pack as published: 9.1, the incomplete view dropdown, and 9.2, the broken shipped command example. One is a documentation gap rather than a fault: 9.3 — the filter shape works, the pack simply never illustrates it. One is an observation about the API's response shape that a runbook can trip over, not a fault at all: 9.4. The remaining three are behaviours worth knowing, collected in 9.5: a property of the pack's own metadata (three state-changing commands are not flagged harmful), an authentication observation, and a repeatability caveat. Nothing here is a misconfiguration on your side, and nothing outside 9.1 and 9.2 is something the pack gets wrong."),

  h2("9.1 The view dropdown is missing three valid values"),
  rich([
    { text: "The " },
    { text: "view", font: "Consolas", size: 20 },
    { text: " argument of " },
    { text: "koi-inventory-list", font: "Consolas", size: 20 },
    { text: " offers " },
    { text: String((CMDS.find(c => c.name === "koi-inventory-list").arguments.find(a => a.name === "view").predefined || []).length) },
    { text: " predefined values: " },
    { text: (CMDS.find(c => c.name === "koi-inventory-list").arguments.find(a => a.name === "view").predefined || []).join(", "), font: "Consolas", size: 20 },
    { text: ". The API accepts nine. Its own 400 response states the contract: agentic_ai, ai_models, all_items, code_packages, extensions, mcp_servers, os_packages, repositories, software." },
  ]),
  p("All twelve values were probed individually against the live API on both reference instances — the nine the API names, plus three a reader might plausibly guess. Nothing about the view argument is left untested, and no result below is inferred from another. The table below shows seven of the twelve: the three the dropdown omits, the three the API rejects, and software as a control. The five it leaves out are dropdown values the API accepts — agentic_ai, ai_models, code_packages, extensions and os_packages — and each returned HTTP 200 with a non-zero total_count on both instances, from 3 (ai_models on KOI_PAET) to 2,572 (code_packages on KOI_PLTS).", { para: { keepNext: true } }),
  /* col 0 must hold browser_extensions unbroken: 18 chars at 9pt DejaVu Sans Mono
     is ~97pt, so 2200 twips including the 200 twips of cell margin. */
  /* col 1 needs ~1150 twips or the header "dropdown" itself breaks mid-word. */
  table([2200, 1150, 1250, 4760], [
    ["view value", "In dropdown", "Live result", "What it means"],
    ["mcp_servers", "No", "HTTP 200", "The MCP-server audit case. Returned 21 items on KOI_PAET and 42 on KOI_PLTS. Works when typed by hand; the dropdown will never offer it."],
    ["repositories", "No", "HTTP 200", "Returned 15 items on KOI_PAET and 77 on KOI_PLTS. Repository inventory is unreachable from the dropdown."],
    ["all_items", "No", "HTTP 200", "Accepted, but returned total_count 0 on BOTH instances, while every other accepted value returned data. Its name promises everything and it delivered nothing. To list everything, omit view entirely — that returned 3,447 items on KOI_PAET, and 5,646 on KOI_PLTS on the later of two sweeps that day, up from 5,644 hours earlier (see the drift note below)."],
    ["software", "Yes", "HTTP 200", "Returned 406 items on KOI_PAET and 1,046 on KOI_PLTS in this probe run — the KOI_PLTS figure was 1,044 a few hours earlier the same day and is drifting upward. Shown for contrast: a dropdown value behaving normally."],
    ["browser_extensions", "No", "HTTP 400", "Not a valid value. This is the one that appears in the pack's shipped example — see 9.2."],
    ["ide_extensions", "No", "HTTP 400", "Not a valid value. Does not appear anywhere in the pack; listed here because it is a plausible guess."],
    ["packages", "No", "HTTP 400", "Not a valid value. Does not appear anywhere in the pack; listed here because it is a plausible guess."],
  ], { mono: [0], small: [1, 2, 3], monoSize: 18 }),
  p("Nothing in the pack is invalid — the list is merely incomplete. Workaround: type the value into the argument by hand instead of selecting it; the API accepts the three missing values. Sources: the predefined list above is generated from the pack source; the probe results are from VERIFIED_FACTS.md §5.1 (live).", { italics: true, color: GRAY }),
  callout("The counts above are a snapshot, not a threshold", [
    "Every number in this table is a single reading taken on the reference tenant on 20 July 2026, and KOI inventory can grow underneath you: two sweeps a few hours apart the same day returned different totals on KOI_PLTS — view=software 1,044 then 1,046, and the whole inventory 5,644 then 5,646. KOI_PAET did not move: it returned 3,447 in both sweeps. Re-probing twice inside a single run returned identical values every time on both instances, so this is real growth on one named tenant, not an unstable API.",
    "Do not use any figure here as a pass/fail threshold. What is stable, and what you should check for, is the shape of the response: HTTP 200, a total_count present and non-zero for a value the API accepts, HTTP 400 for one it does not. A count that differs from this table — on your tenant or on this one an hour later — is not a failed test.",
  ]),

  h2("9.2 The pack's own command example is broken"),
  rich([
    { text: "The file " },
    { text: "Packs/Koi/Integrations/Koi/command_examples.txt", font: "Consolas", size: 20 },
    { text: " in the pack contains " },
    { text: "view=browser_extensions", font: "Consolas", size: 20 },
    { text: ". That value is in neither the pack's own predefined list nor the API's accepted set, and the live API rejects it with HTTP 400. Anyone copying the shipped example gets an error." },
  ]),
  rich([
    { text: "Only browser_extensions is in the shipped example.", bold: true },
    { text: " " },
    { text: "ide_extensions", font: "Consolas", size: 20 },
    { text: " and " },
    { text: "packages", font: "Consolas", size: 20 },
    { text: " also return HTTP 400, but they do not appear in " },
    { text: "command_examples.txt", font: "Consolas", size: 20 },
    { text: " or anywhere else in the pack — they are listed in 9.1 only because they are values a reader might guess. Use the nine values the API named in 9.1." },
  ]),
  p("Sources: the broken value is read from the pack's own command_examples.txt; the HTTP 400 it produces is from VERIFIED_FACTS.md §5.2 (live).", { italics: true, color: GRAY }),

  h2("9.3 koi-inventory-search needs a structured filter, and the pack never shows its shape"),
  rich([
    { text: "The " },
    { text: "filter_json", font: "Consolas", size: 20 },
    { text: " argument is described in the pack as query-builder syntax, but the pack gives no example of what that syntax looks like. What is missing is an example, not a usable error message — the errors are clear. The API requires the combinator/rules form:" },
  ]),
  code('{"combinator": "and", "rules": [{"field": "risk_level", "operator": "=", "value": "high"}]}'),
  p("That exact filter is verified working: sent in a direct POST to /inventory/search on KOI_PAET — not through the command, which was never executed here — it was accepted and returned a total_count of 145. Treat the 145 as a snapshot of that tenant at that moment, not as an expected result.", { italics: true, color: GRAY }),
  p("Three different things go wrong in three different ways. They are easy to confuse, so they are separated here:", { para: { keepNext: true } }),
  table([3100, 1150, 5110], [
    ["What you do", "Result", "What you see"],
    ["Call the command with neither filter_json nor filter_raw_json_entry_id", "No API call", "The integration itself stops you: \"Either 'filter_json' or 'filter_raw_json_entry_id' must be provided.\" Nothing reaches the API. This row is read from the integration's Koi.py source, not reproduced — no koi-* command was executed through Cortex at any point (section 5)."],
    ["Supply a filter that is present but malformed, for example {}", "API 400", "The response body names the problem: filter.combinator must be one of the following values: and, or; filter.rules must be an array. This 400 is not opaque — it tells you which keys are wrong. Reproduced by direct API request on both instances."],
    ["Omit the filter key from a request made to the API directly", "API 500", "Internal Server Error, reproduced by direct API request on both instances. Reachable only by calling the API yourself; the command cannot produce this, because the check above catches it first."],
  ], { small: [1, 2] }),
  p("Sources: the two API results are from VERIFIED_FACTS.md §5.3 (live, both instances); the argument check in the first row is from the integration source code, which was read and not executed.", { italics: true, color: GRAY }),
  rich([
    { text: "The same JSON can be supplied as a War Room file entry instead, via " },
    { text: "filter_raw_json_entry_id", font: "Consolas", size: 20 },
    { text: ", which avoids quote-escaping problems in the CLI." },
  ]),

  h2("9.4 Allowlist and blocklist responses carry no total"),
  rich([
    { text: "The allowlist and blocklist endpoints return only an " },
    { text: "items", font: "Consolas", size: 20 },
    { text: " array — no " },
    { text: "total_count", font: "Consolas", size: 20 },
    { text: ", unlike the policies and inventory endpoints. Any runbook step that tells an operator to check total_count on " },
    { text: "koi-allowlist-get", font: "Consolas", size: 20 },
    { text: " or " },
    { text: "koi-blocklist-get", font: "Consolas", size: 20 },
    { text: " is pointing at a field that never exists. Count the returned items instead." },
  ]),
  p("Related: an empty items array is the correct, non-error result for an empty list — both lists were empty on KOI_PAET (KOI_PLTS held 5 allowlist and 17 blocklist entries). Do not read it as a failure. Source: VERIFIED_FACTS.md §5.4 (live).", { italics: true, color: GRAY }),

  h2("9.5 Three behaviours worth knowing"),
  bullet([{ text: `${NUMWORD(unflaggedMutators.length, true)} of the ${NUMWORD(MUTATING.length)} state-changing commands are not flagged as harmful. `, bold: true }, { text: "Only " }, { text: execCmds.join(" and "), font: "Consolas", size: 20 }, { text: " carry execution: true. " }, { text: unflaggedMutators.join(", "), font: "Consolas", size: 20 }, { text: " change tenant state with no such guard (section 6.1)." }]),
  bullet([{ text: "A bad API key fails cleanly. ", bold: true }, { text: "An invalid bearer token returns HTTP 401 with the body " }, { text: '{"message":"Unauthorized","statusCode":401}', font: "Consolas", size: 19 }, { text: ", verified with a deliberately invalid key. If you see 401, suspect the key. No 403 was ever observed from the reference environment, so this guide makes no claim about what a 403 would mean here." }]),
  bullet([{ text: "koi-get-events is a debugging tool, not a collector, and it is the one read command that is not safe to repeat. ", bold: true }, { text: "The pack's own description says it is for development and debugging only, as it may produce duplicate events, exceed API rate limits, or disrupt the fetch mechanism. Its " }, { text: "should_push_events", font: "Consolas", size: 20 }, { text: " argument writes the retrieved events into " }, { text: "koi_koi_raw", font: "Consolas", size: 20 }, { text: " when true, so a careless re-run duplicates rows in the same dataset the collector is filling. Leave it at its default of " }, { text: String(CMDS.find(c => c.name === "koi-get-events").arguments.find(a => a.name === "should_push_events").defaultValue), font: "Consolas", size: 20 }, { text: `, and treat the other ${CMDS.length - MUTATING.length - 1} non-mutating commands — not this one — as the freely repeatable set (section 6.1).` }]),
];

/* ---------------- 10. Provenance ---------------- */
const provenance = [
  h1("10. Provenance of Every Claim in This Guide"),
  p("This guide was built to a method: every factual claim about the pack is generated at build time from the pinned pack source, read from the integration's own source code, or observed live, and the sources are named section by section rather than sentence by sentence. Nothing was written from memory of a similar pack. The method does not amount to a guarantee that every individual sentence carries a tag — some connective and explanatory statements (how the Cortex platform behaves in general, why a collision has the consequence it does) rest on none of the three, and 10.1 gives the main examples of those."),
  table([2200, 7160], [
    ["Marking", "Meaning"],
    ["Pack source", `Generated at build time from ${PACK.source.path} (md5 ${PACK.source.md5}), confirmed byte-identical to ${PACK.source.repo}@master on ${PACK.source.verified_against_master}. This covers every command, argument, default, predefined value, context path, configuration parameter, version and the docker image — every table in sections 4 and 6 is produced by code from that file. The per-command API endpoint line in section 6 is the one thing there that is not: see the Integration source row below.`],
    ["Live", `Observed on tenant api-ayman.xdr.eu.paloaltonetworks.com on 20 July 2026 (instances KOI_PAET and KOI_PLTS), or against the KOI API with the same keys — never through a Cortex War Room, which the tenant would not allow. Covers the dataset name, the event schema split, the findings in sections 9.1 to 9.4 and the 401 observation in 9.5. It covers the API behind ${EXERCISED.length} of the ${PACK.counts.commands} commands only; the ${NOT_RUN.length} state-changing commands were not run at all. Live counts are snapshots that drift (see 9.1) and are never expected results.`],
    ["Integration source", `The endpoint map (section 6) is read from the integration's Koi.py, which is the pack's source code — not the YAML, and not by itself an observation. The map has 11 entries; ${EXERCISED.length} of them were then also exercised live, and the other 3 — PUT /policies/{id}, the POST and DELETE calls on /policies/allowlist, and the POST and DELETE calls on /policies/blocklist, which are the endpoints behind the ${NOT_RUN.length} state-changing commands — were never called. The same applies to the argument check in the first row of the 9.3 table.`],
    ["Not from any of those", "The main cases are listed below. That list is illustrative of the kinds of statement involved, not a complete inventory of every sentence in the guide."],
  ]),
  h2("10.1 Main statements not traceable to the pack source, the integration source or live verification"),
  p("These are the recurring kinds. They are general platform behaviour or reasoning about consequences, not observations of this pack. Other sentences of the same kind exist elsewhere in the guide; this table names the ones a reader is most likely to want to weigh.", { color: GRAY, italics: true }),
  table([2600, 6760], [
    ["Statement", "Status"],
    ["Cortex UI navigation wording in section 3 (Marketplace, search, install)", "Standard platform navigation, not part of the pack and not re-verified for this document. Flagged in place in section 3."],
    ["The XQL statements in section 8.5", "Constructed for this guide from verified field names and verified JSON-string behaviour; the statements themselves were not each executed. Flagged in place in section 8.5."],
    ["\"Cortex will require confirmation to run execution: true commands\" (section 6)", "Platform behaviour for commands flagged execution: true. The flag itself is from the pack source; the platform's handling of it is general product behaviour, not verified on the reference tenant."],
    ["\"Because Cortex keys content on those identifiers, the two packs cannot be installed side by side\" (section 1.2)", "The shared identifiers are from the pack source. That Cortex resolves a collision by overwriting is platform behaviour; no overwrite was performed on the reference tenant to watch it happen."],
    ["The playbook ordering hazard in section 7.3 and the \"last one wins\" consequence", "Deduced from the declared context paths, which are from the pack source. No playbook was built and run to observe the overwrite."],
    ["The remediation advice throughout (workarounds, what to do instead)", "Written for this guide. It follows from the verified behaviour but is not itself a verified observation."],
  ]),
  h2("10.2 The one gap in the evidence"),
  rich([
    { text: `No command was ever executed through Cortex`, bold: true },
    { text: `, because the reference tenant blocks the API paths the tooling needs (section 5). No War Room output, no human-readable table and no context mapping was observed for any of the ${PACK.counts.commands} commands; those are asserted from the pack's own files alone — the YAML for the declarations, Koi.py for the endpoints and the argument checks. Underneath that, the API behind ${EXERCISED.length} of the ${PACK.counts.commands} commands was exercised directly, and the ${NOT_RUN.length} state-changing commands were not run at all — so for those five, neither layer was observed. To close the gap, run the commands from the XSIAM UI War Room, which does not use the failing API path.` },
  ]),
  h2("10.3 Rebuilding this document"),
  p("The generator reads the pinned JSON at run time and writes the same bytes on every run. If the pack is updated upstream, regenerate the source JSON first — do not edit the tables by hand.", { para: { keepNext: true } }),
  code("export NODE_PATH=<repo>/node_modules"),
  code("node docs/build_guide.js"),
];

/* ---------------- Table of contents ----------------
   Built from HEADINGS, which every h1/h2 call has populated in document order by the
   time this runs. A TableOfContents field would be a better artefact in Word, but it
   is empty until Word updates fields, so the PDF conversion produced a blank page. */
const toc = [
  p("Table of Contents", { bold: true, size: 28, spacing: { after: 160 } }),
  /* 49 entries; the spacing below keeps the whole list on one page */
  ...HEADINGS.map(hh =>
    new Paragraph({
      spacing: hh.level === 1 ? { before: 40, after: 0 } : { after: 0 },
      indent: hh.level === 1 ? undefined : { left: 320 },
      children: [new TextRun({
        text: hh.text,
        bold: hh.level === 1,
        size: hh.level === 1 ? 22 : 19,
        color: hh.level === 1 ? SLATE : GRAY,
        font: "Calibri",
      })],
    })),
  pageBreak(),
];

/* ---------------- assemble ---------------- */
const doc = new Document({
  features: { updateFields: true },
  title: "KOI Content Pack (Marketplace v" + PACK.pack.currentVersion + ") — Customer Install & Usage Guide",
  description: "Install and usage guide for the official Marketplace KOI pack v" + PACK.pack.currentVersion + " from demisto/content.",
  creator: "KOI-MP documentation build",
  created: FIXED_DATE,
  modified: FIXED_DATE,
  lastModifiedBy: "KOI-MP documentation build",
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 260 } } } }] },
      { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 300 } } } }] },
    ],
  },
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: SLATE } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `${PACK_LABEL}  ·  integration id ${PACK.integration.id}  ·  Page `, size: 18, color: GRAY }),
            new TextRun({ size: 18, color: GRAY, children: [PageNumber.CURRENT] }),
            new TextRun({ text: " of ", size: 18, color: GRAY }),
            new TextRun({ size: 18, color: GRAY, children: [PageNumber.TOTAL_PAGES] }),
          ],
        })],
      }),
    },
    children: [
      ...cover, ...toc, ...about, ...requirements, ...install, ...configSection,
      ...verifySection, ...commandSection, ...contextSection, ...eventsSection,
      ...issuesSection, ...provenance,
    ],
  }],
});

const OUT = path.join(__dirname, `KOI_Marketplace_Pack_Customer_Guide_v${PACK.pack.currentVersion}.docx`);

/* docx stamps docProps/core.xml with the wall clock and jszip stamps every entry with it.
   Repack deterministically so two runs produce byte-identical output. */
async function deterministic(buf) {
  const JSZip = require("jszip");
  const ISO = FIXED_DATE.toISOString();
  const zin = await JSZip.loadAsync(buf);
  const zout = new JSZip();
  for (const name of Object.keys(zin.files)) {
    const f = zin.files[name];
    if (f.dir) continue;
    let content = await f.async("nodebuffer");
    if (name === "docProps/core.xml") {
      content = Buffer.from(content.toString("utf8")
        .replace(/<dcterms:created([^>]*)>[^<]*<\/dcterms:created>/, `<dcterms:created$1>${ISO}</dcterms:created>`)
        .replace(/<dcterms:modified([^>]*)>[^<]*<\/dcterms:modified>/, `<dcterms:modified$1>${ISO}</dcterms:modified>`), "utf8");
    }
    zout.file(name, content, { date: FIXED_DATE, createFolders: false, binary: true });
  }
  return zout.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" });
}

Packer.toBuffer(doc).then(deterministic).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("written", OUT, buf.length, "bytes");
  console.log(`commands=${CMDS.length} args=${PACK.counts.arguments} outputs=${PACK.counts.outputs} distinctPaths=${distinctPaths.length} dupPaths=${dupPaths.length} exec=${execCmds.join(",")} noOutputs=${noOutputCmds.join(",")}`);
});
