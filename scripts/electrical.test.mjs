import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { buildHouse } from "../lib/model.mjs";
import { electricalMount } from "../lib/electrical.mjs";
import {
  checkElectrical,
  electricalIssues,
  electricalObstacles,
  accessBounds,
} from "./check-electrical.mjs";
const spec = JSON.parse(fs.readFileSync(new URL("../lib/house.json", import.meta.url)));
const { root } = buildHouse(spec);
const obstacles = electricalObstacles(spec, root);

test("all source frames have wall support and switches have access", () => {
  checkElectrical(spec, root);
  for (const n of [1, 2]) assert(root.getObjectByName(`Electrical_${n}`));
});
test("a frame crossing an actual window is rejected", () => {
  const frame = {
    ...spec.electrical.items[0],
    wallId: "F1-W01",
    side: 1,
    offset: 1.3,
    centerHeight: 0.3,
  };
  assert(electricalIssues(spec, frame, obstacles).some((s) => s.includes("F1-WIN01")));
});
test("access check catches furniture in front, without touching the frame", () => {
  const frame = spec.electrical.items.find((i) => i.id === "EL-F1-SW-BOILER");
  const access = accessBounds(spec, frame);
  const center = access.getCenter(new THREE.Vector3());
  const blocker = {
    id: "new-cabinet",
    roomId: frame.roomId,
    bounds: new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(0.05, 0.05, 0.05)),
  };
  assert(
    electricalIssues(spec, frame, [...obstacles, blocker]).some((s) => s.includes("new-cabinet")),
  );
});
test("wall thickness and location changes keep the frame on the face", () => {
  const copy = structuredClone(spec);
  const frame = copy.electrical.items.find((i) => i.id === "EL-F1-BOILER-01");
  const before = electricalMount(copy, frame);
  const wall = copy.walls.find((w) => w.id === frame.wallId);
  wall.t += 0.1;
  wall.a[1] += 0.2;
  wall.b[1] += 0.2;
  const after = electricalMount(copy, frame);
  assert(Math.abs(after.position.z - before.position.z - 0.15) < 1e-9);
});
test("coincident frames and missing source mechanisms are rejected", () => {
  const frame = spec.electrical.items.find((i) => i.id === "EL-F1-BOILER-01");
  assert(
    electricalIssues(spec, { ...frame, id: "duplicate" }, obstacles, [frame]).some((s) =>
      s.includes("overlaps"),
    ),
  );
  const copy = structuredClone(spec);
  copy.electrical.items.pop();
  assert.throws(() => checkElectrical(copy, root), /inventory differs/);
});

test("outlets behind furniture are deliberately retained", () => {
  const frame = spec.electrical.items.find((i) => i.id === "EL-F2-DRESS-01");
  const access = accessBounds(spec, frame);
  assert(obstacles.some((o) => o.roomId === frame.roomId && access.intersectsBox(o.bounds)));
  assert.deepEqual(electricalIssues(spec, frame, obstacles), []);
});
test("temperature controllers are excluded from the selected source frames", () => {
  const expected = {
    "EL-F1-SW-OFFICE": ["switch-3"],
    "EL-F2-SW-CHILD": ["switch-2"],
    "EL-F2-SW-ROOM": ["switch-2"],
  };
  for (const [id, modules] of Object.entries(expected))
    assert.deepEqual(spec.electrical.items.find((i) => i.id === id).modules, modules);
});
