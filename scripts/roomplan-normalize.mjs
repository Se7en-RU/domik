#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeScan } from "./roomplan/normalize.mjs";

export { normalizeScan } from "./roomplan/normalize.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const input = process.argv[2];
  if (!input)
    throw new Error("Usage: node scripts/roomplan-normalize.mjs <scan.json> [output.json]");
  const output = process.argv[3] ?? "measurements/normalized-scan.json";
  const scan = normalizeScan(JSON.parse(fs.readFileSync(input, "utf8")));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(scan, null, 2) + "\n");
  console.log(`Written ${output}: ${scan.walls.length} walls, ${scan.floors.length} floors`);
}
