#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeScan } from "./roomplan/normalize.mjs";
import {
  inspectScan,
  summarizeEvidence,
  renderMarkdown,
  renderOverlay,
} from "./roomplan/audit.mjs";
import { renderWholeHouse } from "./roomplan/whole-house.mjs";
import { applyAnchors, validateAnchors } from "./roomplan/anchors.mjs";
import { validateModel } from "./validate-model.mjs";
import { projectRoot } from "./paths.mjs";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--apply"))
  throw new Error("Usage: npm run measurements:audit [-- --apply]");
const applying = args.includes("--apply");
const specPath = path.join(projectRoot, "lib/house.json");
const originalText = fs.readFileSync(specPath, "utf8");
const spec = JSON.parse(originalText);
const controls = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "measurements/manual/control.json"), "utf8"),
);
const { spec: candidate, proposals } = applyAnchors(spec, controls);
const rawDir = path.join(projectRoot, "measurements/raw");
const outputDir = path.join(projectRoot, "measurements/reports");
const normalizedDir = path.join(projectRoot, "work/roomplan/normalized");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(normalizedDir, { recursive: true });

function json(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
function scanFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? scanFiles(path.join(dir, entry.name))
        : entry.isFile() && entry.name.toLowerCase().endsWith(".json")
          ? [path.join(dir, entry.name)]
          : [],
    );
}
const scans = scanFiles(rawDir)
  .sort()
  .map((filePath) => {
    const file = path.relative(rawDir, filePath);
    try {
      const scan = normalizeScan(JSON.parse(fs.readFileSync(filePath, "utf8")));
      const normalizedPath = path.join(normalizedDir, file);
      fs.mkdirSync(path.dirname(normalizedPath), { recursive: true });
      json(normalizedPath, scan);
      return {
        file,
        architecturalHash: scan.architecturalHash,
        fingerprint: scan.fingerprint,
        sourceStory: scan.sourceStory,
        warnings: scan.warnings,
        counts: {
          walls: scan.walls.length,
          floors: scan.floors.length,
          doors: scan.doors.length,
          windows: scan.windows.length,
        },
        ...inspectScan(scan, spec),
      };
    } catch (error) {
      return {
        file,
        error: error.message,
        registration: { status: "REVIEW REQUIRED", hypotheses: [] },
        comparisons: [],
      };
    }
  });
const report = {
  schemaVersion: "1.0",
  revision: spec.revision,
  units: "metres",
  sourceHash: createHash("sha256").update(originalText).digest("hex"),
  policy: {
    autoApply: "Only mapped manual anchors with coupled edits and passing global validation",
    smallDelta: 0.01,
    reviewDelta: 0.03,
    strongCandidateDelta: 0.05,
    scanScale: 1,
    furnitureUsed: false,
    confidenceIsMetrologicalAccuracy: false,
  },
  proposals,
  scans,
  comparisons: summarizeEvidence(scans, spec),
};
const appliedPath = path.join(outputDir, "applied.json");
if (fs.existsSync(appliedPath)) report.applied = JSON.parse(fs.readFileSync(appliedPath, "utf8"));
const garageReviewPath = path.join(projectRoot, "measurements/manual/garage-review.json");
if (fs.existsSync(garageReviewPath)) {
  report.ownerReviews = JSON.parse(fs.readFileSync(garageReviewPath, "utf8")).decisions;
}
const fitPath = path.join(projectRoot, "measurements/manual/scan-fit.json");
if (spec.sources.some((s) => s.id === "scan-fit-2026-09-09") && fs.existsSync(fitPath))
  report.coupledFit = JSON.parse(fs.readFileSync(fitPath, "utf8"));
// The concrete diff always exists BEFORE any write to the canonical model.
json(path.join(outputDir, "audit.json"), report);
fs.writeFileSync(path.join(outputDir, "REVIEW.md"), renderMarkdown(report));
fs.writeFileSync(path.join(outputDir, "WHOLE-HOUSE.md"), renderWholeHouse(report, spec));
fs.writeFileSync(path.join(outputDir, "overlay.html"), renderOverlay(report, spec));

if (applying && proposals.some((p) => p.decision === "SAFE TO APPLY")) {
  candidate.revision = "2026-09-08-roomplan-controls";
  candidate.sources = [
    ...candidate.sources.filter((s) => !["manual-controls", "roomplan-audit"].includes(s.id)),
    {
      id: "manual-controls",
      file: "measurements/manual/control.json",
      priority: 0,
      note: "Три ручных контрольных замера из плана владельца, принятого 08.09.2026.",
    },
    {
      id: "roomplan-audit",
      file: "measurements/reports/REVIEW.md",
      priority: 3,
      note: "Архитектурное сопоставление RoomPlan JSON. Неоднозначные расхождения не изменяют модель; мебель исключена.",
    },
  ];
  candidate.assumptions.find((a) => a.id === "walls").text =
    "Ручные контроли: F1-W09 — 0,415 м, F2-W07 — 0,405 м. Южные грани Z=4,57 м сохранены для привязки лестницы; северные грани и полигоны прилегающих комнат согласованы. Толщина распространена вдоль существующих единых осей как допущение. Наружные стены 0,60 м и остальные перегородки сохранены; RoomPlan сам по себе не подтверждает их толщину.";
  candidate.assumptions.find((a) => a.id === "stairs").text +=
    " Перегородка между маршами — 0,13 м по ручному контролю и торцу в скане; верхний марш шириной 0,91 м, пол кладовой начинается за перегородкой на Z=5,76 м. Положение проёма и 21 подъём сохранены.";
  candidate.assumptions.push({
    id: "roomplan-review",
    title: "Сопоставление RoomPlan",
    text: "Сканы нормализованы в X/Z с Y вверх и сопоставлены по архитектуре. Все story=0 — локальные индексы. Расхождения одиночных измерений, высот и гаража оставлены REVIEW REQUIRED. Полный отчёт measurements/reports/REVIEW.md. Высоты 3,22 и 2,97 м, наружный контур и скосы сохранены.",
  });
  validateAnchors(candidate, controls);
  const geometry = validateModel(candidate);
  // Refuse to overwrite an edit made while the audit was being computed.
  if (fs.readFileSync(specPath, "utf8") !== originalText)
    throw new Error("Model changed during audit; rerun before applying");
  const newText = JSON.stringify(candidate, null, 2) + "\n";
  json(path.join(outputDir, "applied.json"), {
    revisionBefore: spec.revision,
    revisionAfter: candidate.revision,
    beforeHash: report.sourceHash,
    afterHash: createHash("sha256").update(JSON.stringify(candidate)).digest("hex"),
    afterHashEncoding: "SHA-256 of JSON.stringify(parsed specification), independent of whitespace",
    proposals: proposals.filter((p) => p.decision === "SAFE TO APPLY"),
    geometry,
  });
  // Preserve the pre-application report across subsequent read-only audits.
  json(path.join(outputDir, "before-apply.json"), report);
  fs.writeFileSync(specPath, newText);
  console.log(
    `Applied ${proposals.filter((p) => p.decision === "SAFE TO APPLY").length} manual controls; global geometry passed.`,
  );
} else {
  console.log(
    `Audited ${scans.length} scans; ${proposals.filter((p) => p.decision === "SAFE TO APPLY").length} SAFE TO APPLY. Model unchanged.`,
  );
}
console.log("Report: measurements/reports/REVIEW.md; overlay: measurements/reports/overlay.html");
