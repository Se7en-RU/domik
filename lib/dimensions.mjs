import { garageWalls, roomFloorOffset } from "./layout.mjs";
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const point = (a, u, d) => a.map((v, i) => v + u[i] * d);
const length = (a, b) => Math.hypot(...sub(b, a));

// The garage's scan polygon is retained in the specification. Its wall
// projection was aligned to the house afterwards; dimensions must follow
// the generated faces rather than the superseded scan-side projection.
export function roomInteriorPolygon(room, spec) {
  const polygon = room.polygon.map((p) => [...p]);
  if (room.id === spec.garage.roomId && spec.garage.wallProjection?.shiftX) {
    const projection = spec.garage.wallProjection;
    for (const index of projection.vertices) polygon[index][0] += projection.shiftX;
    const returnIndex = spec.garage.outlineVertices.backNotch;
    polygon[returnIndex][0] = polygon[projection.vertices.at(-1)][0];
  }
  return polygon;
}

// One selectable wall face per straight room side, regardless of how many
// structural wall segments (or thicknesses) back that side. IDs of the
// underlying structural walls and openings remain unchanged.
export function roomWallFaces(spec) {
  const walls = [...spec.walls, ...garageWalls(spec)];
  return spec.rooms
    .filter((r) => !r.isVoid)
    .flatMap((room) => {
      const polygon = roomInteriorPolygon(room, spec);
      const area = polygon.reduce((s, a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        return s + a[0] * b[1] - b[0] * a[1];
      }, 0);
      const vertices = polygon
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => {
          const prev = polygon[(i + polygon.length - 1) % polygon.length],
            next = polygon[(i + 1) % polygon.length];
          const a = sub(p, prev),
            b = sub(next, p);
          return Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-8 || dot(a, b) <= 0;
        });
      return vertices.flatMap(({ p: a, i: edge }, index) => {
        const b = vertices[(index + 1) % vertices.length].p,
          len = length(a, b);
        const u = sub(b, a).map((v) => v / len),
          normal = [-u[1] * Math.sign(area), u[0] * Math.sign(area)];
        const contributors = walls
          .filter((w) => w.floor === room.floor)
          .flatMap((w) => {
            const wl = length(w.a, w.b),
              wu = sub(w.b, w.a).map((v) => v / wl);
            if (Math.abs(dot(u, wu)) < 0.995) {
              // A wall's end can complete the same interior face at a corner.
              if (Math.abs(dot(u, wu)) > 0.005) return [];
              return [w.a, w.b].flatMap((endpoint) => {
                if (Math.abs(dot(sub(endpoint, a), normal)) > 0.006) return [];
                const center = dot(sub(endpoint, a), u),
                  start = Math.max(0, center - w.t / 2),
                  end = Math.min(len, center + w.t / 2);
                return end - start > 0.005 ? [{ wall: w, start, end, isEnd: true }] : [];
              });
            }
            const d = Math.abs(dot(sub(w.a, a), normal));
            // Room polygon is the interior face; do not match a parallel remote wall.
            if (Math.abs(d - w.t / 2) > 0.011) return [];
            const ends = [dot(sub(w.a, a), u), dot(sub(w.b, a), u)].sort((a, b) => a - b);
            const start = Math.max(0, ends[0]),
              end = Math.min(len, ends[1]);
            return end - start > 0.005 ? [{ wall: w, start, end }] : [];
          });
        // Returns of the garage projection are perpendicular ends of a thick
        // wall. Keep them as room faces even when there is no separate wall axis.
        if (!contributors.length && room.id !== spec.garage.roomId) return [];
        // An open stair/hall boundary is not a wall. Trim only genuinely
        // uncovered ends; contiguous structural pieces still produce one face.
        const faceStart = contributors.length ? Math.min(...contributors.map((c) => c.start)) : 0;
        const faceEnd = contributors.length ? Math.max(...contributors.map((c) => c.end)) : len;
        const openings = new Map();
        for (const { wall: w, isEnd } of contributors) {
          if (isEnd) continue;
          const wl = length(w.a, w.b),
            wu = sub(w.b, w.a).map((v) => v / wl);
          for (const o of w.openings ?? []) {
            const ends = [o.start, o.start + o.width]
              .map((d) => dot(sub(point(w.a, wu, d), a), u))
              .sort((a, b) => a - b);
            const start = Math.max(0, ends[0]),
              end = Math.min(len, ends[1]);
            if (end - start < 0.005) continue;
            openings.set(o.id, {
              ...o,
              start: start - faceStart,
              width: end - start,
              sill: o.sill - roomFloorOffset(room, spec),
            });
          }
        }
        const thicknesses = [
          ...new Set(contributors.filter((c) => !c.isEnd).map((c) => c.wall.t)),
        ].sort((a, b) => a - b);
        return [
          {
            id: `${room.id}:FACE:${edge}`,
            roomId: room.id,
            roomName: room.name,
            number: index + 1,
            floor: room.floor,
            a: point(a, u, faceStart),
            b: point(a, u, faceEnd),
            length: faceEnd - faceStart,
            normal,
            component: "room-face",
            t: thicknesses[0] ?? spec.garage.wallThickness,
            thicknesses,
            wallIds: [...new Set(contributors.map((c) => c.wall.id))],
            openings: [...openings.values()].sort((a, b) => a.start - b.start),
            roofZone: room.id === "F2-ROOM" ? "south" : "main",
          },
        ];
      });
    });
}

export function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}
const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Layout in SVG units derived from screen pixels. Reserve room names first;
// then place selected dimensions, long faces, and opening labels. Short
// dimensions that cannot fit remain available in the complete side list.
export function placeDimensionLabels(candidates, obstacles, unitsPerPixel) {
  const boxes = [...obstacles],
    placed = [];
  for (const c of [...candidates].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
    const vertical = Math.abs(c.b[1] - c.a[1]) > Math.abs(c.b[0] - c.a[0]);
    const textWidth = (c.text.length * 7.2 + 12) * unitsPerPixel,
      height = 19 * unitsPerPixel;
    const w = vertical ? height : textWidth,
      h = vertical ? textWidth : height;
    if (length(c.a, c.b) < textWidth + 12 * unitsPerPixel) continue;
    for (const offset of [22, 42, 62, 82]) {
      const x = (c.a[0] + c.b[0]) / 2 + c.normal[0] * offset * unitsPerPixel;
      const y = (c.a[1] + c.b[1]) / 2 + c.normal[1] * offset * unitsPerPixel;
      const box = {
        x: x - w / 2 - 3 * unitsPerPixel,
        y: y - h / 2 - 3 * unitsPerPixel,
        w: w + 6 * unitsPerPixel,
        h: h + 6 * unitsPerPixel,
      };
      const corners = [
        [box.x, box.y],
        [box.x + box.w, box.y],
        [box.x + box.w, box.y + box.h],
        [box.x, box.y + box.h],
      ];
      if (
        !corners.every((p) => pointInPolygon(p, c.polygon)) ||
        boxes.some((b) => intersects(box, b))
      )
        continue;
      boxes.push(box);
      placed.push({ ...c, x, y, vertical, box, width: textWidth, height });
      break;
    }
  }
  return placed;
}
