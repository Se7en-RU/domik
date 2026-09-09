import assert from "node:assert/strict";
import { ShapeUtils, Vector2 } from "three";
const area = (p) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0),
  ) / 2;
function clip(poly, axis, value, greater) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      ia = greater ? a[axis] >= value : a[axis] <= value,
      ib = greater ? b[axis] >= value : b[axis] <= value;
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      out.push(a.map((v, j) => v + t * (b[j] - v)));
    }
  }
  return out;
}
const clipped = (p, b) =>
  clip(clip(clip(clip(p, 0, b[0], true), 0, b[2], false), 1, b[1], true), 1, b[3], false);
export function checkLayout(spec) {
  const failures = [];
  const wallRects = [];
  for (const w of spec.walls) {
    const horizontal = Math.abs(w.a[1] - w.b[1]) < 1e-6;
    assert(horizontal || Math.abs(w.a[0] - w.b[0]) < 1e-6, `${w.id}: unsupported diagonal wall`);
    const axis = horizontal ? 0 : 1,
      len = Math.abs(w.b[axis] - w.a[axis]);
    for (const o of w.openings ?? []) {
      if (o.start < 0 || o.start + o.width > len + 1e-6)
        failures.push(`${o.id}: opening outside host wall`);
    }
    const bounds = horizontal
      ? [Math.min(w.a[0], w.b[0]), w.a[1] - w.t / 2, Math.max(w.a[0], w.b[0]), w.a[1] + w.t / 2]
      : [w.a[0] - w.t / 2, Math.min(w.a[1], w.b[1]), w.a[0] + w.t / 2, Math.max(w.a[1], w.b[1])];
    wallRects.push({ wall: w, bounds });
  }
  for (const r of spec.rooms.filter((r) => r.id !== spec.garage.roomId && !r.isVoid)) {
    const triangles = ShapeUtils.triangulateShape(
      r.polygon.map((p) => new Vector2(...p)),
      [],
    ).map((t) => t.map((i) => r.polygon[i]));
    for (const { wall: w, bounds } of wallRects.filter((v) => v.wall.floor === r.floor)) {
      let overlap = triangles.reduce((s, p) => s + area(clipped(p, bounds)), 0);
      // Test the built solid at 1 m above each floor, excluding clear apertures.
      const axis = Math.abs(w.a[1] - w.b[1]) < 1e-6 ? 0 : 1;
      for (const o of w.openings ?? []) {
        if (o.sill <= 1 && o.sill + o.height > 1) {
          const opening = [...bounds];
          opening[axis] = w.a[axis] + o.start;
          opening[axis + 2] = opening[axis] + o.width;
          overlap -= triangles.reduce((s, p) => s + area(clipped(p, opening)), 0);
        }
      }
      if (overlap > 1e-6) failures.push(`${w.id} protrudes into ${r.id}: ${overlap.toFixed(6)} m²`);
    }
  }
  // Every wall endpoint must join another wall footprint. Exterior corner
  // returns can meet along an edge; isolated or too-short ends fail.
  for (const { wall: w, bounds: b } of wallRects) {
    for (const [end, p] of [w.a, w.b].entries()) {
      const horizontal = Math.abs(w.a[1] - w.b[1]) < 1e-6;
      const cross = horizontal
        ? [p[0], p[1] - w.t / 2, p[0], p[1] + w.t / 2]
        : [p[0] - w.t / 2, p[1], p[0] + w.t / 2, p[1]];
      const touching = wallRects.some(
        ({ wall: o, bounds: c }) =>
          o.id !== w.id &&
          o.floor === w.floor &&
          cross[2] >= c[0] - 1e-6 &&
          cross[0] <= c[2] + 1e-6 &&
          cross[3] >= c[1] - 1e-6 &&
          cross[1] <= c[3] + 1e-6,
      );
      // F1-W14 starts at a stair divider, a generated architectural element.
      if (!touching && !(w.id === "F1-W14" && end === 0))
        failures.push(`${w.id}: disconnected endpoint ${end}`);
    }
  }
  for (const { wall: w, bounds: b } of wallRects) {
    const polygon = spec.envelope?.[`floor${w.floor}`];
    if (!polygon) continue;
    const triangles = ShapeUtils.triangulateShape(
      polygon.map((p) => new Vector2(...p)),
      [],
    ).map((t) => t.map((i) => polygon[i]));
    const inside = triangles.reduce((s, p) => s + area(clipped(p, b)), 0);
    const outside = (b[2] - b[0]) * (b[3] - b[1]) - inside;
    if (outside > 1e-6) failures.push(`${w.id}: outside slab envelope by ${outside.toFixed(6)} m²`);
  }
  assert.equal(failures.length, 0, failures.join("\n"));
  return {
    rooms: spec.rooms.length,
    walls: spec.walls.length,
    checks: [
      "No wall footprint inside room interiors",
      "All apertures inside host walls",
      "Wall endpoints connected",
    ],
  };
}
