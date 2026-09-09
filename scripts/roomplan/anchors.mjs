import assert from "node:assert/strict";

const round = (n) => Math.round(n * 1e6) / 1e6;
const near = (a, b) => Math.abs(a - b) < 1e-6;

// These are coupled edits to the current house topology, not independent wall
// optimisation. All assumptions are checked before a candidate can be written.
export function applyAnchors(spec, controls) {
  const next = structuredClone(spec);
  const proposals = [];
  const wallGroups = {
    "F1-W09": ["F1-LIVING", "F1-KITCHEN"],
    "F2-W07": ["F2-CHILD", "F2-BED"],
  };
  for (const anchor of controls.anchors) {
    assert(
      Number.isFinite(anchor.value) && anchor.value > 0 && anchor.value < 1,
      "Invalid manual thickness",
    );
    if (anchor.property === "t" && wallGroups[anchor.target]) {
      const wall = next.walls.find((w) => w.id === anchor.target);
      assert(wall && near(wall.a[1], wall.b[1]), `${anchor.target}: unsupported topology`);
      const original = wall.t;
      const south = round(wall.a[1] + wall.t / 2);
      const north = round(wall.a[1] - wall.t / 2);
      assert(near(south, next.stairVoid.z), "Manual wall anchor would break the stair reference");
      const newNorth = round(south - anchor.value);
      for (const id of wallGroups[anchor.target]) {
        const room = next.rooms.find((r) => r.id === id);
        assert(
          room && near(Math.max(...room.polygon.map((p) => p[1])), north),
          `${id}: unexpected north-room boundary`,
        );
        room.polygon = room.polygon.map(([x, z]) => [x, near(z, north) ? newNorth : z]);
        room.sourceRefs = [
          ...new Set([...(room.sourceRefs ?? []), `manual-controls:${anchor.id}`]),
        ];
        room.sourceLabel = "Черновой план + ручной контроль толщины стены · 08.09.2026";
        const d = (newNorth - Math.min(...room.polygon.map((p) => p[1])))
          .toFixed(3)
          .replace(".", ",");
        room.dimensions = room.dimensions.replace(/× [\d,]+ м/, `× ${d} м`);
      }
      wall.t = anchor.value;
      wall.a[1] = wall.b[1] = round(south - anchor.value / 2);
      wall.sourceRefs = [...new Set([...(wall.sourceRefs ?? []), `manual-controls:${anchor.id}`])];
      proposals.push({
        roomIds: wallGroups[anchor.target],
        target: anchor.target,
        field: "thickness",
        model: original,
        measured: anchor.value,
        delta: round(anchor.value - original),
        observations: 1,
        decision: near(original, anchor.value) ? "IGNORE" : "SAFE TO APPLY",
        reason: `Ручной контроль; южная грань ${south} м сохраняется; связанные комнаты заканчиваются на ${newNorth} м.`,
        source: `manual-controls:${anchor.id}`,
        coupledRooms: wallGroups[anchor.target],
      });
    } else if (
      anchor.target === "F1-W13-DIVIDER" &&
      anchor.property === "staircase.dividerThickness"
    ) {
      const original = next.staircase.dividerThickness;
      const store = next.rooms.find((r) => r.id === "F1-STORE");
      assert(store, "Missing under-stair store");
      const north = round(next.stairVoid.z + next.staircase.lowerWidth + anchor.value);
      const oldNorth = Math.min(...store.polygon.map((p) => p[1]));
      assert(
        near(oldNorth, next.stairVoid.z + next.staircase.lowerWidth) ||
          near(oldNorth, next.stairVoid.z + next.staircase.lowerWidth + original),
        "Unexpected store boundary",
      );
      next.staircase.dividerThickness = anchor.value;
      assert(
        next.stairVoid.depth - next.staircase.lowerWidth - anchor.value > 0.8,
        "Upper flight too narrow",
      );
      store.polygon = store.polygon.map(([x, z]) => [x, near(z, oldNorth) ? north : z]);
      const depth = round(Math.max(...store.polygon.map((p) => p[1])) - north);
      store.dimensions = `3,50 × ${depth.toFixed(2).replace(".", ",")} м; под верхним бетонным маршем`;
      store.label[1] = round(north + depth / 2);
      store.sourceRefs = [
        ...new Set([...(store.sourceRefs ?? []), `manual-controls:${anchor.id}`]),
      ];
      store.sourceLabel = "Черновой план + ручной контроль перегородки · 08.09.2026";
      next.staircase.dividerThicknessConfirmed = true;
      next.staircase.dividerSource = `manual-controls:${anchor.id}`;
      proposals.push({
        roomIds: ["F1-STAIR", "F1-STORE"],
        target: anchor.target,
        field: "thickness",
        model: original,
        measured: anchor.value,
        delta: round(anchor.value - original),
        observations: 1,
        decision:
          near(original, anchor.value) && near(oldNorth, north) ? "IGNORE" : "SAFE TO APPLY",
        reason:
          "Ручной контроль и торец в скане лестницы. Верхний марш пересчитывается; пол кладовой исключает перегородку.",
        source: `manual-controls:${anchor.id}`,
        coupledRooms: ["F1-STORE"],
      });
    } else {
      throw new Error(`REVIEW REQUIRED: unsupported manual target ${anchor.target}`);
    }
  }
  return { spec: next, proposals };
}

export function validateAnchors(spec, controls) {
  const { spec: corrected } = applyAnchors(spec, controls);
  for (const wall of corrected.walls) {
    const current = spec.walls.find((w) => w.id === wall.id);
    assert.deepEqual(
      [current.a, current.b, current.t],
      [wall.a, wall.b, wall.t],
      `${wall.id}: manual control drift`,
    );
  }
  for (const room of corrected.rooms) {
    assert.deepEqual(
      spec.rooms.find((r) => r.id === room.id).polygon,
      room.polygon,
      `${room.id}: wall/room boundary drift`,
    );
  }
  assert.equal(
    spec.staircase.dividerThickness,
    corrected.staircase.dividerThickness,
    "Divider manual control drift",
  );
}
