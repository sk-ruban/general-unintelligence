const TOOL =
  "/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";
const SKIA =
  "/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/node_modules/skia-canvas/lib/index.mjs";

const {
  Presentation,
  PresentationFile,
  column,
  row,
  grid,
  layers,
  panel,
  text,
  shape,
  chart,
  rule,
  fill,
  hug,
  fixed,
  wrap,
  grow,
  fr,
} = await import(TOOL);
const { Canvas } = await import(SKIA);

const OUT = new URL("../output/", import.meta.url);
const PREVIEWS = new URL("../previews/", import.meta.url);
const deckPath = new URL("battery-intelligence-os-hackathon-preamble.pptx", OUT);

const W = 1920;
const H = 1080;

const palette = {
  bg: "#050506",
  panel: "#090B0E",
  raised: "#101419",
  line: "rgba(255,255,255,0.12)",
  text: "#E6EDF3",
  muted: "#8B949E",
  faint: "#545C66",
  cyan: "#67E8F9",
  green: "#34D399",
  amber: "#F59E0B",
  red: "#F87171",
  blue: "#60A5FA",
  violet: "#A78BFA",
};

const fonts = {
  sans: "Aptos",
  mono: "Aptos Mono",
};

const presentation = Presentation.create({
  slideSize: { width: W, height: H },
});

function deckRoot(children, opts = {}) {
  return layers(
    { width: fill, height: fill, name: opts.name ?? "root" },
    [
      shape({
        name: "background",
        width: fill,
        height: fill,
        fill: palette.bg,
        line: { color: palette.bg, transparency: 100 },
      }),
      shape({
        name: "top-horizon",
        width: fill,
        height: fixed(220),
        fill: "rgba(103,232,249,0.05)",
        line: { color: palette.bg, transparency: 100 },
      }),
      ...children,
    ],
  );
}

function addSlide(node, background = palette.bg) {
  const slide = presentation.slides.add();
  slide.background.fill = background;
  slide.compose(node, {
    frame: { left: 0, top: 0, width: W, height: H },
    baseUnit: 8,
  });
  return slide;
}

function kicker(value, color = palette.cyan) {
  return text(value, {
    width: fill,
    height: hug,
    style: {
      fontFace: fonts.mono,
      fontSize: 20,
      bold: true,
      color,
    },
  });
}

function title(value, size = 66, width = fill) {
  return text(value, {
    width,
    height: hug,
    style: {
      fontFace: fonts.sans,
      fontSize: size,
      bold: true,
      color: palette.text,
    },
  });
}

function body(value, size = 28, width = fill, color = palette.muted) {
  return text(value, {
    width,
    height: hug,
    style: {
      fontFace: fonts.sans,
      fontSize: size,
      color,
    },
  });
}

function mono(value, size = 22, color = palette.muted, width = fill) {
  return text(value, {
    width,
    height: hug,
    style: {
      fontFace: fonts.mono,
      fontSize: size,
      color,
    },
  });
}

function source(value) {
  return text(value, {
    width: fill,
    height: hug,
    style: {
      fontFace: fonts.sans,
      fontSize: 13,
      color: palette.faint,
    },
  });
}

function smallPanel(name, child, fillColor = "rgba(255,255,255,0.035)") {
  return panel(
    {
      name,
      width: fill,
      height: hug,
      padding: { x: 26, y: 22 },
      fill: fillColor,
      line: { color: palette.line, width: 1 },
      borderRadius: 6,
    },
    child,
  );
}

function metric(label, value, accent, note) {
  return column({ width: fill, height: hug, gap: 8 }, [
    mono(label, 17, palette.muted),
    text(value, {
      width: fill,
      height: hug,
      style: {
        fontFace: fonts.mono,
        fontSize: 48,
        bold: true,
        color: accent,
      },
    }),
    body(note, 18, fill, palette.muted),
  ]);
}

function openBullet(accent, head, sub) {
  return row({ width: fill, height: hug, gap: 18, align: "start" }, [
    shape({
      width: fixed(10),
      height: fixed(52),
      fill: accent,
      line: { color: accent },
    }),
    column({ width: fill, height: hug, gap: 6 }, [
      text(head, {
        width: fill,
        height: hug,
        style: { fontFace: fonts.sans, fontSize: 30, bold: true, color: palette.text },
      }),
      body(sub, 21),
    ]),
  ]);
}

// 1. Cover
addSlide(
  deckRoot([
    grid(
      {
        name: "cover-grid",
        width: fill,
        height: fill,
        columns: [fr(1.08), fr(0.92)],
        rows: [fr(1)],
        columnGap: 72,
        padding: { x: 96, y: 84 },
      },
      [
        column({ width: fill, height: fill, gap: 34, justify: "center" }, [
          kicker("OD YCEO HACKATHON / GREEK BESS MARKET"),
          title("Battery Intelligence OS", 92),
          body(
            "A control cockpit for battery operators entering volatile, data-scarce power markets.",
            34,
            wrap(900),
            "#B9C7D1",
          ),
          rule({ width: fixed(280), stroke: palette.cyan, weight: 4 }),
          body(
            "Not another price forecast. A platform that turns fragmented market, grid, weather, fuel, and asset signals into feasible charge, discharge, or idle decisions.",
            27,
            wrap(960),
          ),
        ]),
        layers({ width: fill, height: fill }, [
          shape({
            name: "cover-stage",
            width: fill,
            height: fill,
            fill: "rgba(16,20,25,0.72)",
            line: { color: palette.line, width: 1 },
            borderRadius: 6,
          }),
          grid(
            {
              width: fill,
              height: fill,
              columns: [fr(1), fr(1), fr(1), fr(1)],
              rows: [fr(1), fr(1), fr(1), fr(1), fr(1), fr(1)],
              columnGap: 8,
              rowGap: 8,
              padding: 36,
            },
            Array.from({ length: 24 }, (_, i) => {
              const isCharge = [8, 9, 10, 11, 12].includes(i);
              const isDischarge = [18, 19, 20, 21].includes(i);
              const tone = isCharge ? palette.green : isDischarge ? palette.amber : "rgba(255,255,255,0.08)";
              return shape({
                width: fill,
                height: fill,
                fill: tone,
                line: { color: "rgba(255,255,255,0.08)", width: 1 },
                borderRadius: 3,
              });
            }),
          ),
          column({ width: fill, height: fill, padding: 64, justify: "end", gap: 14 }, [
            mono("96 MTUs / EUR-MWh / Europe-Athens", 20, palette.cyan),
            text("CHARGE  DISCHARGE  IDLE", {
              width: fill,
              height: hug,
              style: { fontFace: fonts.mono, fontSize: 36, bold: true, color: palette.text },
            }),
          ]),
        ]),
      ],
    ),
  ]),
);

// 2. Market actors
addSlide(
  deckRoot([
    column({ width: fill, height: fill, padding: { x: 88, y: 72 }, gap: 38 }, [
      column({ width: fill, height: hug, gap: 12 }, [
        kicker("1 / MARKET SETUP"),
        title("The operators are arriving before the playbook is mature", 58),
        body(
          "Greece is moving from battery projects on paper to batteries participating in HEnEx markets. METLEN-Karatzis is the headline scale project, but the market also includes PPC Renewables, HELLENiQ Renewables, Energiaki Techniki, Faria, Principia, Motor Oil/MORE, and others.",
          25,
          wrap(1560),
        ),
      ]),
      grid(
        {
          width: fill,
          height: fill,
          columns: [fr(1.15), fr(0.85)],
          rows: [fr(1)],
          columnGap: 48,
        },
        [
          chart({
            name: "bess-market-ramp-chart",
            width: fill,
            height: fill,
            chartType: "bar",
            config: {
              title: "Greek BESS scale markers",
              categories: ["First live systems", "Ready to energise", "2026 target", "METLEN-Karatzis"],
              series: [{ name: "MW", values: [16.7, 300, 1100, 330] }],
            },
          }),
          column({ width: fill, height: fill, gap: 20, justify: "center" }, [
            smallPanel("metlen", metric("METLEN-Karatzis Thessaly", "330 MW / 790 MWh", palette.cyan, "Largest standalone storage unit planned to date in Greece.")),
            smallPanel("early", metric("First operating BESS", "16.7 MW", palette.green, "Petra and Dokos entered day-ahead/intraday market test operation.")),
            smallPanel("queue", metric("Near-term queue", "~300 MW", palette.amber, "Reported as ready for energisation in April 2026.")),
          ]),
        ],
      ),
      source("Sources: METLEN press release, 9 Oct 2025; Balkan Green Energy News, 2 Apr 2026; Renewables Now, 1 Apr 2026."),
    ]),
  ]),
);

// 3. Greece grid inflection
addSlide(
  deckRoot([
    column({ width: fill, height: fill, padding: { x: 96, y: 76 }, gap: 44 }, [
      column({ width: fill, height: hug, gap: 12 }, [
        kicker("2 / GREECE INFLECTION"),
        title("The first batteries are not just assets. They are a new operating regime.", 60, wrap(1500)),
      ]),
      grid(
        {
          width: fill,
          height: fill,
          columns: [fr(1), fr(1), fr(1)],
          columnGap: 34,
        },
        [
          column({ width: fill, height: fill, gap: 22, justify: "center" }, [
            text("01", { width: fill, height: hug, style: { fontFace: fonts.mono, fontSize: 66, bold: true, color: palette.green } }),
            title("Physical entry", 42),
            body("First standalone BESS began trial charging and discharging through HEnEx in April 2026.", 25),
          ]),
          column({ width: fill, height: fill, gap: 22, justify: "center" }, [
            text("96", { width: fill, height: hug, style: { fontFace: fonts.mono, fontSize: 98, bold: true, color: palette.cyan } }),
            title("Decision intervals per day", 42),
            body("EU day-ahead markets moved to 15-minute MTUs from delivery day 1 Oct 2025.", 25),
          ]),
          column({ width: fill, height: fill, gap: 22, justify: "center" }, [
            text("0", { width: fill, height: hug, style: { fontFace: fonts.mono, fontSize: 98, bold: true, color: palette.amber } }),
            title("Years of mature local BESS telemetry", 42),
            body("Operators need decisions before they have a long operating history under full commercial rules.", 25),
          ]),
        ],
      ),
      source("Sources: HEnEx announcement, 1 Oct 2025; European Commission, 1 Oct 2025; Renewables Now, 1 Apr 2026."),
    ]),
  ]),
);

// 4. Data scarcity
addSlide(
  deckRoot([
    grid(
      {
        width: fill,
        height: fill,
        columns: [fr(0.9), fr(1.1)],
        columnGap: 64,
        padding: { x: 92, y: 76 },
      },
      [
        column({ width: fill, height: fill, gap: 22, justify: "center" }, [
          kicker("3 / DATA SCARCITY"),
          title("The core defect is not missing ambition. It is missing operating history.", 56),
          body(
            "A pure optimizer assumes clean inputs. A pure model wants history. Greek standalone batteries have neither at the asset level yet.",
            30,
          ),
        ]),
        column({ width: fill, height: fill, gap: 28, justify: "center" }, [
          openBullet(palette.red, "Scarce battery telemetry", "No long local record of SoC paths, degradation, BMS behavior, downtime, or dispatch response."),
          openBullet(palette.amber, "Fragmented external signals", "HEnEx prices and curves, IPTO/ENTSO-E system data, weather, gas, carbon, and shock context live in different formats."),
          openBullet(palette.blue, "Uncertain asset specs", "Headline MW/MWh does not equal usable AC dispatchable energy; supplier and warranty assumptions may be unknown."),
          openBullet(palette.violet, "Changing market rules", "Trial operation, imbalance exposure, 15-minute MTUs, and support obligations affect what a profitable plan really means."),
        ]),
      ],
    ),
  ]),
);

// 5. Problem statement
addSlide(
  deckRoot([
    column({ width: fill, height: fill, padding: { x: 110, y: 84 }, gap: 46, justify: "center" }, [
      kicker("4 / PROBLEM STATEMENT", palette.amber),
      text("How should a battery operator schedule tomorrow when the market is volatile, the asset is new, and the data is incomplete?", {
        width: wrap(1600),
        height: hug,
        style: { fontFace: fonts.sans, fontSize: 78, bold: true, color: palette.text },
      }),
      grid(
        { width: fill, height: hug, columns: [fr(1), fr(1), fr(1)], columnGap: 32 },
        [
          smallPanel("must-be-feasible", metric("Must be", "feasible", palette.green, "SoC, power, efficiency, reserve, and degradation constraints respected.")),
          smallPanel("must-be-explainable", metric("Must be", "explainable", palette.cyan, "The operator sees the signals, assumptions, caveats, and confidence.")),
          smallPanel("must-be-useful", metric("Must be", "actionable", palette.amber, "Charge, discharge, or idle decisions by interval, not just a dashboard of charts.")),
        ],
      ),
    ]),
  ]),
);

// 6. Product reimagination
addSlide(
  deckRoot([
    column({ width: fill, height: fill, padding: { x: 90, y: 72 }, gap: 36 }, [
      column({ width: fill, height: hug, gap: 10 }, [
        kicker("5 / REIMAGINED PRODUCT"),
        title("Beyond an optimisation model: a decision cockpit for battery operators", 58),
        body("The model is one engine in a broader platform: data provenance, signal intelligence, a battery twin, scenario planning, and business insight.", 25, wrap(1500)),
      ]),
      grid(
        { width: fill, height: fill, columns: [fr(1), fr(1), fr(1), fr(1), fr(1), fr(1)], columnGap: 18 },
        [
          smallPanel("data-fabric", column({ width: fill, gap: 18 }, [mono("01", 24, palette.cyan), title("Data Fabric", 31), body("HEnEx, IPTO, weather, TTF, EEX, carbon, asset specs.", 20)])),
          smallPanel("signal-engine", column({ width: fill, gap: 18 }, [mono("02", 24, palette.green), title("Signal Engine", 31), body("Flexibility value, fragility, curtailment fit, scarcity.", 20)])),
          smallPanel("battery-twin", column({ width: fill, gap: 18 }, [mono("03", 24, palette.blue), title("Battery Twin", 31), body("SoC, duration, efficiency, capacity stack, degradation.", 20)])),
          smallPanel("model-lab", column({ width: fill, gap: 18 }, [mono("04", 24, palette.violet), title("Model Lab", 31), body("Baselines, GBMs, ensembles, error and decision scoring.", 20)])),
          smallPanel("scheduler", column({ width: fill, gap: 18 }, [mono("05", 24, palette.amber), title("Scheduler", 31), body("96-MTU charge/discharge/idle plan under constraints.", 20)])),
          smallPanel("cockpit", column({ width: fill, gap: 18 }, [mono("06", 24, palette.red), title("Cockpit", 31), body("Operator plan, risks, provenance, scenarios, BI.", 20)])),
        ],
      ),
      source("Repo basis: Battery Intelligence OS product vision, branding guide, control room and scheduler design docs."),
    ]),
  ]),
);

// 7. Value proposition canvas
addSlide(
  deckRoot([
    column({ width: fill, height: fill, padding: { x: 88, y: 70 }, gap: 30 }, [
      column({ width: fill, height: hug, gap: 10 }, [
        kicker("6 / VALUE PROPOSITION CANVAS"),
        title("The cockpit maps directly to operator jobs, pains, and gains", 58),
      ]),
      grid(
        { width: fill, height: fill, columns: [fr(1), fr(1), fr(1)], columnGap: 34 },
        [
          column({ width: fill, height: fill, gap: 20 }, [
            mono("CUSTOMER JOBS", 22, palette.cyan),
            openBullet(palette.cyan, "Schedule tomorrow", "Produce a feasible 96-interval charge/discharge/idle plan."),
            openBullet(palette.cyan, "Explain decisions", "Show why each action was chosen and what assumption it depends on."),
            openBullet(palette.cyan, "Plan the business", "Understand regime shifts, duration choices, and market opportunity."),
          ]),
          column({ width: fill, height: fill, gap: 20 }, [
            mono("PAINS", 22, palette.red),
            openBullet(palette.red, "No asset history", "New batteries lack mature local operating data."),
            openBullet(palette.red, "Black-box risk", "A profitable-looking schedule can violate constraints or rely on fragile spreads."),
            openBullet(palette.red, "Source sprawl", "Signals are scattered across market files, APIs, PDFs, weather, and fuel data."),
          ]),
          column({ width: fill, height: fill, gap: 20 }, [
            mono("GAIN CREATORS", 22, palette.green),
            openBullet(palette.green, "Trust layer", "Confidence, data health, and feasibility checks sit beside the recommendation."),
            openBullet(palette.green, "Scenario layer", "Gas shock, solar surplus, and duration comparisons expose robustness."),
            openBullet(palette.green, "BI layer", "The same data supports scheduling, planning, reporting, and insight gathering."),
          ]),
        ],
      ),
    ]),
  ]),
);

// 8. Features to build
addSlide(
  deckRoot([
    column({ width: fill, height: fill, padding: { x: 90, y: 72 }, gap: 30 }, [
      column({ width: fill, height: hug, gap: 10 }, [
        kicker("7 / FEATURE SCOPE"),
        title("What we need to implement for the hackathon value proposition", 56),
      ]),
      grid(
        {
          width: fill,
          height: fill,
          columns: [fr(1.05), fr(1), fr(1)],
          rows: [fr(1), fr(1)],
          columnGap: 28,
          rowGap: 24,
        },
        [
          smallPanel("feature-control-room", column({ width: fill, gap: 13 }, [mono("P0", 20, palette.green), title("Control Room", 32), body("Recommended schedule, 96-MTU action tape, SoC path, expected value, degradation cost, feasibility proof.", 20)])),
          smallPanel("feature-data-health", column({ width: fill, gap: 13 }, [mono("P0", 20, palette.green), title("Data Health", 32), body("Source freshness, missingness, live/cached/demo labels, provenance near the recommendation.", 20)])),
          smallPanel("feature-twin", column({ width: fill, gap: 13 }, [mono("P0", 20, palette.green), title("Battery Twin", 32), body("Operator-configurable MW/MWh, duration, efficiency, SoC buffers, capacity stack, confidence levels.", 20)])),
          smallPanel("feature-signal", column({ width: fill, gap: 13 }, [mono("P1", 20, palette.amber), title("Signal Engine", 32), body("Spread coverage, fragility, curtailment fit, battery stress, data confidence, reason codes.", 20)])),
          smallPanel("feature-model", column({ width: fill, gap: 13 }, [mono("P1", 20, palette.amber), title("Model Lab", 32), body("Baseline vs ML model comparison scored by decision quality, not just forecast error.", 20)])),
          smallPanel("feature-scenario", column({ width: fill, gap: 13 }, [mono("P1", 20, palette.amber), title("Scenario Planner", 32), body("Base case, gas shock, solar surplus, 2h vs 4h battery comparison, business-insight exports.", 20)])),
        ],
      ),
      source("Feature scope derived from repo docs: product vision, decision-confidence strip, scenario comparison, battery twin, and scheduler design."),
    ]),
  ]),
);

// 9. Closing
addSlide(
  deckRoot([
    grid(
      {
        width: fill,
        height: fill,
        columns: [fr(1.05), fr(0.95)],
        columnGap: 70,
        padding: { x: 104, y: 82 },
      },
      [
        column({ width: fill, height: fill, gap: 34, justify: "center" }, [
          kicker("LANDING"),
          title("Kpler-style intelligence, specialized into executable battery decisions", 64),
          body(
            "The wedge is Greece. The durable product is a platform for battery operators to schedule, plan, audit, and learn under uncertainty.",
            31,
          ),
          rule({ width: fixed(220), stroke: palette.amber, weight: 4 }),
          body("The demo should make one thing obvious: data scarcity is not a blocker if the platform makes assumptions explicit, constraints real, and decisions explainable.", 26),
        ]),
        column({ width: fill, height: fill, gap: 18, justify: "center" }, [
          openBullet(palette.green, "Operate", "What should the battery do tomorrow?"),
          openBullet(palette.cyan, "Understand", "Which signals drove the recommendation?"),
          openBullet(palette.amber, "Stress-test", "Does the plan survive plausible market regimes?"),
          openBullet(palette.violet, "Plan", "What does this imply for asset strategy and business intelligence?"),
        ]),
      ],
    ),
  ]),
);

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(deckPath.pathname);

for (const [index, slide] of presentation.slides.items.entries()) {
  const canvas = new Canvas(W, H);
  const ctx = canvas.getContext("2d");
  await (await import(TOOL)).drawSlideToCtx(slide, presentation, ctx);
  const file = new URL(`slide-${String(index + 1).padStart(2, "0")}.png`, PREVIEWS);
  await canvas.toFile(file.pathname);
}

console.log(JSON.stringify({
  pptx: deckPath.pathname,
  previews: PREVIEWS.pathname,
  slideCount: presentation.slides.items.length,
}, null, 2));
