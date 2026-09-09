import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Matrix4, Vector3 } from "three";
import { normalizeScan } from "./roomplan/normalize.mjs";
import { registerScan, robustConsensus } from "./roomplan/register.mjs";
import { applyAnchors, validateAnchors } from "./roomplan/anchors.mjs";
import { validateModel } from "./validate-model.mjs";
import { projectRoot } from "./paths.mjs";

const read = (file) => JSON.parse(fs.readFileSync(path.join(projectRoot, file), "utf8"));
const close = (a, b) => assert(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const transform = (rotation, position) =>
  rotation
    .clone()
    .setPosition(new Vector3(...position))
    .toArray();

function fixture() {
  const floor = new Matrix4().makeRotationX(-Math.PI / 2);
  return {
    story: 0,
    referenceOriginTransform: new Matrix4().toArray(),
    floors: [
      {
        identifier: "floor",
        transform: floor.toArray(),
        dimensions: [4, 3, 0],
        polygonCorners: [
          [-2, -1.5, 0],
          [2, -1.5, 0],
          [2, 1.5, 0],
          [-2, 1.5, 0],
        ],
      },
    ],
    walls: [
      {
        identifier: "wall",
        transform: transform(new Matrix4(), [0, 1.5, -1.5]),
        dimensions: [4, 3, 0],
      },
    ],
    doors: [
      {
        identifier: "door",
        parentIdentifier: "wall",
        transform: transform(new Matrix4(), [0.5, 1, -1.5]),
        dimensions: [1, 2, 0],
      },
    ],
    windows: [
      {
        identifier: "window",
        parentIdentifier: "wall",
        transform: transform(new Matrix4(), [-1, 1.5, -1.5]),
        dimensions: [0.8, 1, 0],
      },
    ],
  };
}

test("Floor local XY becomes horizontal X/Z; heights, sill and parent offsets remain valid", () => {
  const scan = normalizeScan(fixture());
  close(
    Math.max(...scan.floors[0].polygon.map((p) => p[2])) -
      Math.min(...scan.floors[0].polygon.map((p) => p[2])),
    3,
  );
  for (const p of scan.floors[0].polygon) close(p[1], 0);
  close(scan.walls[0].bottom, 0);
  close(scan.walls[0].top, 3);
  close(scan.doors[0].start, 2);
  close(scan.doors[0].sill, 0);
  close(scan.windows[0].sill, 1);
  assert.equal(scan.walls[0].thickness, null);
});

test("Translation + nonzero yaw + reference transform do not distort relative geometry", () => {
  const raw = fixture(),
    expected = normalizeScan(raw);
  const scene = new Matrix4().makeRotationY(0.73).setPosition(7.2, -1.3, 4.1);
  for (const key of ["floors", "walls", "windows", "doors"])
    for (const surface of raw[key]) {
      surface.transform = scene
        .clone()
        .multiply(new Matrix4().fromArray(surface.transform))
        .toArray();
    }
  raw.referenceOriginTransform = new Matrix4()
    .makeRotationY(-0.39)
    .setPosition(-2, 0.6, 8)
    .toArray();
  const actual = normalizeScan(raw);
  for (const key of ["floors", "walls", "windows", "doors"]) {
    actual[key].forEach((s, i) =>
      s.polygon.flat().forEach((v, j) => close(v, expected[key][i].polygon.flat()[j])),
    );
  }
  assert.equal(actual.fingerprint, expected.fingerprint);
});

test("Furniture and room labels cannot affect normalized evidence or fingerprint", () => {
  const raw = fixture(),
    before = normalizeScan(raw);
  raw.objects = [{ dimensions: [1e30, 1e30, 1e30], transform: [NaN] }];
  raw.sections = [{ label: "garage", center: [999, 999, 999] }];
  assert.deepEqual(normalizeScan(raw), before);
});

test("Invalid transforms and unresolved parent IDs fail closed", () => {
  const raw = fixture();
  raw.walls[0].transform[12] = NaN;
  assert.throws(() => normalizeScan(raw), /finite/);
  raw.walls[0].transform = new Matrix4().makeScale(2, 1, 1).toArray();
  assert.throws(() => normalizeScan(raw), /rigid/);
  const missing = fixture();
  missing.doors[0].parentIdentifier = "absent";
  const scan = normalizeScan(missing);
  assert.equal(scan.doors[0].start, null);
  assert(scan.warnings.some((w) => w.includes("unresolved parent")));
  assert.throws(() => normalizeScan({ ...fixture(), floors: [] }), /no floor/);
});

test("Every floor polygon is retained; multiple floors cannot be silently assigned", () => {
  const raw = fixture();
  raw.floors.push({ ...structuredClone(raw.floors[0]), identifier: "floor2" });
  const scan = normalizeScan(raw);
  assert.equal(scan.floors.length, 2);
  assert(scan.warnings.some((w) => w.includes("Multiple floors")));
  assert.equal(registerScan(scan, read("lib/house.json")).status, "REVIEW REQUIRED");
});

test("Consensus rejects a clear outlier and duplicate files do not inflate evidence", () => {
  const samples = [4.82, 4.83, 4.81, 5.17, 4.84].map((value, i) => ({
    value,
    scan: `scan${i}`,
    independenceKey: `scan${i}`,
  }));
  const result = robustConsensus([...samples, ...Array(20).fill(samples[3])]);
  close(result.value, 4.825);
  assert.equal(result.observations, 5);
  assert.equal(result.independentInliers, 4);
  assert.deepEqual(
    result.outliers.map((o) => o.value),
    [5.17],
  );
});

test("Manual controls preserve stairwell, all IDs, shared faces and exportable geometry", () => {
  const spec = read("lib/house.json"),
    controls = read("measurements/manual/control.json");
  const legacy = structuredClone(spec);
  for (const [id, roomIds] of [
    ["F1-W09", ["F1-LIVING", "F1-KITCHEN"]],
    ["F2-W07", ["F2-CHILD", "F2-BED"]],
  ]) {
    const w = legacy.walls.find((w) => w.id === id),
      north = w.a[1] - w.t / 2;
    w.a[1] = w.b[1] = 4.38;
    w.t = 0.38;
    for (const room of legacy.rooms.filter((r) => roomIds.includes(r.id))) {
      room.polygon = room.polygon.map(([x, z]) => [x, Math.abs(z - north) < 1e-6 ? 4.19 : z]);
    }
  }
  legacy.staircase.dividerThickness = 0.1;
  const store = legacy.rooms.find((r) => r.id === "F1-STORE");
  const oldStoreNorth = Math.min(...store.polygon.map((p) => p[1]));
  store.polygon = store.polygon.map(([x, z]) => [
    x,
    Math.abs(z - oldStoreNorth) < 1e-6 ? legacy.stairVoid.z + legacy.staircase.lowerWidth : z,
  ]);
  const result = applyAnchors(legacy, controls);
  assert.equal(result.proposals.filter((p) => p.decision === "SAFE TO APPLY").length, 3);
  assert.deepEqual(result.spec.stairVoid, legacy.stairVoid);
  assert.deepEqual(result.spec.parameters, legacy.parameters);
  assert.deepEqual(result.spec.garage, legacy.garage);
  assert.deepEqual(
    result.spec.walls.map((w) => [w.id, w.openings]),
    legacy.walls.map((w) => [w.id, w.openings]),
  );
  validateAnchors(result.spec, controls);
  validateModel(result.spec);
  assert.equal(
    applyAnchors(result.spec, controls).proposals.filter((p) => p.decision === "SAFE TO APPLY")
      .length,
    0,
  );
  const broken = structuredClone(result.spec);
  broken.walls.find((w) => w.id === "F2-W07").t = 0.38;
  assert.throws(() => validateAnchors(broken, controls));
});

test(
  "Shipped scans are architectural evidence, not filename-based assignments",
  { skip: !fs.existsSync(path.join(projectRoot, "measurements/raw/коридор.json")) },
  () => {
    const spec = read("lib/house.json");
    const scan = normalizeScan(read("measurements/raw/коридор.json"));
    const match = registerScan(scan, spec);
    assert.equal(match.candidateId, "F1-OFFICE");
    assert.equal(match.status, "MATCHED");
    const child = normalizeScan(read("measurements/raw/детская.json"));
    const childMatch = registerScan(child, spec);
    assert.equal(child.sourceStory, 0);
    assert.equal(childMatch.floor, 2);
    assert.equal(childMatch.candidateId, "F2-CHILD");
  },
);

test("Coupled layout rejects protrusions, gaps and openings outside a wall", () => {
  const spec = read("lib/house.json");
  validateModel(spec);
  const protrusion = structuredClone(spec);
  const partition = protrusion.walls.find((w) => w.id === "F2-W08");
  partition.a[0] -= 0.02;
  partition.b[0] -= 0.02;
  assert.throws(() => validateModel(protrusion), /protrudes into/);
  const gap = structuredClone(spec);
  gap.walls.find((w) => w.id === "F1-W12").a[0] += 0.02;
  assert.throws(() => validateModel(gap), /disconnected endpoint/);
  const opening = structuredClone(spec);
  opening.walls.find((w) => w.id === "F1-W10").openings[0].start = 20;
  assert.throws(() => validateModel(opening), /outside host wall/);
});
