import assert from "node:assert/strict";
import * as THREE from "three";
import { electricalMount } from "../lib/electrical.mjs";
import { pointInPolygon } from "../lib/dimensions.mjs";
import { upperHeightAt } from "../lib/model.mjs";

export function electricalObstacles(spec, root) {
  root.updateMatrixWorld(true);
  return (spec.furniture?.items ?? []).map((item) => ({
    id: item.id,
    roomId: item.roomId,
    bounds: new THREE.Box3().setFromObject(root.getObjectByName(item.id)),
  }));
}
export function accessBounds(spec, item, margin = 0.05, depth = 0.65) {
  const m = electricalMount(spec, item);
  const level =
    m.room.floor === 2 ? spec.parameters.groundHeight + spec.parameters.slabThickness : 0;
  const matrix = new THREE.Matrix4().makeRotationY(m.rotation);
  matrix.setPosition(m.position.clone().add(new THREE.Vector3(0, level, 0)));
  return new THREE.Box3(
    new THREE.Vector3(-m.width / 2 - margin, -m.height / 2 - margin, 0.001),
    new THREE.Vector3(m.width / 2 + margin, m.height / 2 + margin, depth),
  ).applyMatrix4(matrix);
}
export function electricalIssues(spec, item, obstacles, placed = []) {
  const m = electricalMount(spec, item);
  const errors = [];
  if (![1, -1].includes(item.side)) errors.push("invalid wall side");
  if (![item.offset, item.centerHeight].every(Number.isFinite)) return ["non-finite position"];
  const left = item.offset - m.width / 2,
    right = item.offset + m.width / 2;
  if (left < 0.01 || right > m.length - 0.01) errors.push("outside wall ends");
  const bottom = item.centerHeight - m.height / 2,
    top = item.centerHeight + m.height / 2;
  if (bottom < 0.005) errors.push("below floor");
  for (const opening of m.wall.openings ?? []) {
    if (
      right > opening.start - 0.025 &&
      left < opening.start + opening.width + 0.025 &&
      top > opening.sill - 0.025 &&
      bottom < opening.sill + opening.height + 0.025
    )
      errors.push(`opening ${opening.id}`);
  }
  const tangent = new THREE.Vector3(Math.cos(m.rotation), 0, -Math.sin(m.rotation));
  for (const x of [-m.width / 2, m.width / 2]) {
    const p = m.position.clone().addScaledVector(tangent, x).addScaledVector(m.normal, 0.02);
    if (!pointInPolygon([p.x, p.z], m.room.polygon)) errors.push("outside room face");
    const ceiling =
      m.room.floor === 2
        ? upperHeightAt(p.x, p.z, spec.parameters, m.room.id === "F2-ROOM" ? "south" : "auto")
        : spec.parameters.groundHeight;
    if (top > ceiling - 0.03) errors.push("ceiling");
  }
  const access = accessBounds(spec, item);
  for (const obstacle of obstacles) {
    if (
      item.modules.some((type) => type.startsWith("switch")) &&
      obstacle.roomId === item.roomId &&
      access.intersectsBox(obstacle.bounds)
    )
      errors.push(`blocked by ${obstacle.id}`);
  }
  const body = accessBounds(spec, item, 0.01, 0.025);
  for (const other of placed) {
    if (other.roomId === item.roomId && body.intersectsBox(accessBounds(spec, other, 0.01, 0.025)))
      errors.push(`overlaps ${other.id}`);
  }
  return [...new Set(errors)];
}
export function checkElectrical(spec, root) {
  if (!spec.electrical) return;
  const obstacles = electricalObstacles(spec, root);
  const walls = [];
  root.traverse((o) => {
    if (o.isMesh && o.userData.kind === "wall") walls.push(o);
  });
  const ids = new Set();
  const placed = [];
  for (const item of spec.electrical.items) {
    assert(!ids.has(item.id), `Duplicate electrical ${item.id}`);
    ids.add(item.id);
    assert(item.modules.length > 0 && item.modules.length <= 5, `${item.id}: invalid frame`);
    assert(
      item.modules.every((m) =>
        [
          "power",
          "power-ip44",
          "data",
          "usb",
          "media",
          "switch",
          "switch-2",
          "switch-3",
          "switch-pass",
        ].includes(m),
      ),
      `${item.id}: invalid module`,
    );
    assert(item.sourcePages.length && item.sourcePlacement, `${item.id}: missing source`);
    assert.deepEqual(electricalIssues(spec, item, obstacles, placed), [], item.id);
    const object = root.getObjectByName(item.id);
    assert(object && object.userData.kind === "electrical", `${item.id}: missing layer object`);
    const m = electricalMount(spec, item);
    // Independent check: nine rays must hit the assigned actual wall, not a doorway or air.
    const level =
      m.room.floor === 2 ? spec.parameters.groundHeight + spec.parameters.slabThickness : 0;
    const tangent = new THREE.Vector3(Math.cos(m.rotation), 0, -Math.sin(m.rotation));
    for (const x of [-m.width / 2 + 0.002, 0, m.width / 2 - 0.002])
      for (const y of [-m.height / 2 + 0.002, 0, m.height / 2 - 0.002]) {
        const origin = m.position
          .clone()
          .add(new THREE.Vector3(0, level + y, 0))
          .addScaledVector(tangent, x)
          .addScaledVector(m.normal, 0.03);
        const hits = new THREE.Raycaster(
          origin,
          m.normal.clone().negate(),
          0,
          0.035,
        ).intersectObjects(walls);
        assert(
          hits.some(
            (h) => h.object.userData.wallId === item.wallId && Math.abs(h.distance - 0.03) < 0.001,
          ),
          `${item.id}: frame unsupported by wall`,
        );
      }
    placed.push(item);
  }
  const actual = spec.electrical.items.reduce((acc, i) => {
    for (const type of i.modules) acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(
    actual,
    spec.electrical.sourceModuleCounts,
    "Electrical inventory differs from source ledger",
  );
}
