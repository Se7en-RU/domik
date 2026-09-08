import * as THREE from "three";
import { garageLayout, stairLayout, roomFloorOffset } from "./layout.mjs";
export function polygonArea(p) {
  return Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2,
  );
}
export function upperHeightAt(x, z, p, zone = "auto") {
  const left =
    p.leftKneeHeight +
    (Math.max(0, x) * (p.technicalUpperHeight - p.leftKneeHeight)) / p.leftSlopeRun;
  const south = zone === "south" || (zone === "auto" && z >= 7.5 && x <= 5.79);
  let edge = south ? 5.19 : 8.82;
  let knee = south ? p.southRightKneeHeight : p.rightKneeHeight;
  // The southeast recess makes an additional roof slope over the south room.
  const right = knee + (Math.max(0, edge - x) * (p.technicalUpperHeight - knee)) / p.rightSlopeRun;
  return Math.min(p.upperHeight, left, right);
}
export function buildHouse(spec) {
  const p = spec.parameters;
  const garage = garageLayout(spec);
  const root = new THREE.Group();
  root.name = "House";
  root.userData = { units: "m", revision: spec.revision, assumptions: spec.assumptions };
  const floors = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  floors[1].name = "Floor_1";
  floors[2].name = "Floor_2";
  floors[2].position.y = p.groundHeight + p.slabThickness;
  root.add(floors[1], floors[2]);
  const colors = {
    wall: 0xe8edf0,
    floor: 0xaebcc5,
    window: 0x85b7cc,
    frame: 0x344d5b,
    stairs: 0x7c94a2,
    rail: 0x4c6776,
    ceiling: 0xb2c9d8,
  };
  const materials = {};
  for (const [k, color] of Object.entries(colors)) {
    materials[k] = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: k === "rail" ? 0.25 : 0,
      side: THREE.DoubleSide,
    });
  }
  materials.window.transparent = true;
  materials.window.opacity = 0.22;
  materials.window.depthWrite = false;
  const roomColors = [
    0xb6c9d3, 0xa8c1ce, 0xc3cbd0, 0xb9d2d7, 0xaac4c9, 0xb9c9d3, 0xbfc8cc, 0x91aebb,
  ];
  const mesh = (geo, mat, name, floor, kind, extra = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.userData = { id: name, floor, kind, ...extra };
    m.castShadow = true;
    m.receiveShadow = true;
    floors[floor].add(m);
    return m;
  };
  const box = (x, y, z, w, h, d, mat, name, floor, kind, extra = {}) => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat, name, floor, kind, extra);
    m.position.set(x, y, z);
    return m;
  };
  const solid = (corners, low, high, mat, name, floor, kind, extra = {}) => {
    const v = [];
    for (const level of [low, high])
      for (const [x, z] of corners) v.push(x, typeof level === "function" ? level(x, z) : level, z);
    const n = corners.length,
      indices = [];
    const verts = corners.map((a) => new THREE.Vector2(...a));
    const tris = THREE.ShapeUtils.triangulateShape(verts, []);
    for (const t of tris) {
      indices.push(...t.slice().reverse());
      indices.push(...t.map((x) => x + n));
    }
    for (let i = 0; i < n; i++) {
      let j = (i + 1) % n;
      indices.push(i, j, j + n, i, j + n, i + n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(indices);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    return mesh(flat, mat, name, floor, kind, extra);
  };
  // Continuous structural slabs including wall footprints; upstairs has a true through-opening.
  const outline1 = [
    [-0.6, -0.6],
    [9.42, -0.6],
    [9.42, 8.02],
    [5.85, 8.02],
    [5.85, 9.74],
    [3.6, 9.74],
    [3.6, 10.66],
    [-0.6, 10.66],
  ];
  const outline2 = [
    [-0.6, -0.6],
    [9.42, -0.6],
    [9.42, 7.99],
    [5.79, 7.99],
    [5.79, 10.66],
    [-0.6, 10.66],
  ];
  function slab(poly, floor) {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    if (floor === 2) {
      const v = spec.stairVoid;
      const hole = new THREE.Path(
        [
          [v.x, -v.z],
          [v.x + v.width, -v.z],
          [v.x + v.width, -v.z - v.depth],
          [v.x, -v.z - v.depth],
        ].map((a) => new THREE.Vector2(...a)),
      );
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: p.slabThickness, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -p.slabThickness, 0);
    mesh(g, materials.floor, `F${floor}-SLAB`, floor, "slab");
  }
  slab(outline1, 1);
  slab(outline2, 2);
  const g = garage,
    t = g.wallThickness;
  const garageSlab = [
    [g.left - t, g.front + t],
    [g.left - t, g.shortBack],
    [g.notchX, g.shortBack],
    [g.notchX, g.longBack - t],
    [g.right + t, g.longBack - t],
    [g.right + t, g.front + t],
  ];
  solid(
    garageSlab,
    g.floorOffset - g.slabThickness,
    g.floorOffset,
    materials.floor,
    "GARAGE-SLAB",
    1,
    "slab",
    { component: "garage" },
  );
  // Continue below the existing house slab, avoiding coincident faces at its edge.
  const plinth = (poly, name) =>
    g.floorOffset < -p.slabThickness &&
    solid(poly, g.floorOffset, -p.slabThickness, materials.wall, name, 1, "wall", {
      component: "garage",
    });
  plinth(
    [
      [g.left, g.shortBack - 0.6],
      [g.notchX, g.shortBack - 0.6],
      [g.notchX, g.shortBack],
      [g.left, g.shortBack],
    ],
    "GARAGE-HOUSE-PLINTH",
  );
  plinth(
    [
      [g.left - 0.6, g.shortBack],
      [g.left, g.shortBack],
      [g.left, 9.74],
      [g.left - 0.6, 9.74],
    ],
    "GARAGE-LEFT-PLINTH",
  );
  plinth(
    [
      [g.notchX - 0.6, g.longBack],
      [g.notchX, g.longBack],
      [g.notchX, g.shortBack],
      [g.notchX - 0.6, g.shortBack],
    ],
    "GARAGE-NICHE-PLINTH",
  );
  spec.rooms.forEach((r, i) => {
    if (r.isVoid) return;
    const mat = new THREE.MeshStandardMaterial({
      color: roomColors[i % roomColors.length],
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    const level = roomFloorOffset(r, spec);
    solid(r.polygon, level, level + 0.012, mat, r.id, r.floor, "room", {
      roomId: r.id,
      area: polygonArea(r.polygon),
      sourcePages: r.sourcePages,
    });
  });
  // Divide each wall at openings and roof slope changes, then build sill / lintel pieces.
  const garageWall = (id, a, b, openings = []) => ({
    id,
    a,
    b,
    t,
    floor: 1,
    component: "garage",
    height: g.floorOffset + g.ceilingHeight,
    openings,
  });
  const garageWalls = [
    garageWall("GARAGE-W01", [g.left - t / 2, g.leftSharedWallEndZ], [g.left - t / 2, g.front]),
    garageWall("GARAGE-W02", [g.notchX, g.longBack - t / 2], [g.right + t, g.longBack - t / 2]),
    garageWall("GARAGE-W03", [g.right + t / 2, g.longBack], [g.right + t / 2, g.front]),
    garageWall(
      "GARAGE-W04",
      [g.left - t, g.front + t / 2],
      [g.right + t, g.front + t / 2],
      [
        {
          id: "GARAGE-GATE",
          start: (g.width + 2 * t - g.gateWidth) / 2,
          width: g.gateWidth,
          sill: g.floorOffset,
          height: g.gateHeight,
          kind: "garage-door",
        },
      ],
    ),
  ];
  for (const w of [...spec.walls, ...garageWalls]) {
    const dx = w.b[0] - w.a[0],
      dz = w.b[1] - w.a[1],
      len = Math.hypot(dx, dz),
      ux = dx / len,
      uz = dz / len,
      nx = (-uz * w.t) / 2,
      nz = (ux * w.t) / 2;
    const low = w.component === "garage" ? g.floorOffset : 0;
    const openings = w.openings || [];
    let cuts = [0, len, ...openings.flatMap((o) => [o.start, o.start + o.width])];
    if (w.floor === 2) {
      const runL =
        ((p.upperHeight - p.leftKneeHeight) * p.leftSlopeRun) /
        (p.technicalUpperHeight - p.leftKneeHeight);
      for (const x of [
        runL,
        8.82 -
          ((p.upperHeight - p.rightKneeHeight) * p.rightSlopeRun) /
            (p.technicalUpperHeight - p.rightKneeHeight),
        5.19 -
          ((p.upperHeight - p.southRightKneeHeight) * p.rightSlopeRun) /
            (p.technicalUpperHeight - p.southRightKneeHeight),
      ])
        if (Math.abs(ux) > 0.1) cuts.push((x - w.a[0]) / ux);
      if (Math.abs(uz) > 0.1) cuts.push((7.5 - w.a[1]) / uz);
    }
    cuts = [...new Set(cuts.filter((x) => x >= 0 && x <= len).map((x) => +x.toFixed(6)))].sort(
      (a, b) => a - b,
    );
    const corners = (a, b) => [
      [w.a[0] + a * ux + nx, w.a[1] + a * uz + nz],
      [w.a[0] + b * ux + nx, w.a[1] + b * uz + nz],
      [w.a[0] + b * ux - nx, w.a[1] + b * uz - nz],
      [w.a[0] + a * ux - nx, w.a[1] + a * uz - nz],
    ];
    for (let i = 0; i < cuts.length - 1; i++) {
      let a = cuts[i],
        b = cuts[i + 1];
      if (b - a < 0.001) continue;
      const o = openings.find((o) => (a + b) / 2 > o.start && (a + b) / 2 < o.start + o.width);
      const c = corners(a, b);
      const max = (x, z) =>
        Math.min(
          w.height ?? 99,
          w.floor === 1
            ? p.groundHeight
            : upperHeightAt(
                x,
                z,
                p,
                ["F2-W04", "F2-W05", "F2-W14", "F2-W15"].includes(w.id) ? "south" : "main",
              ),
        );
      if (!o) {
        solid(c, low, max, materials.wall, `${w.id}-${i}`, w.floor, "wall", { wallId: w.id });
      } else {
        if (o.sill > low)
          solid(c, low, o.sill, materials.wall, `${w.id}-${i}-sill`, w.floor, "wall", {
            wallId: w.id,
          });
        const lintel = o.sill + o.height;
        if (c.every(([x, z]) => max(x, z) > lintel + 0.005))
          solid(c, lintel, max, materials.wall, `${w.id}-${i}-lintel`, w.floor, "wall", {
            wallId: w.id,
          });
      }
    }
    for (const o of openings) {
      if (o.kind !== "window") continue;
      const c = o.start + o.width / 2,
        x = w.a[0] + c * ux,
        z = w.a[1] + c * uz;
      const horizontal = Math.abs(ux) > 0.5;
      const gb = box(
        x,
        o.sill + o.height / 2,
        z,
        horizontal ? o.width : 0.025,
        o.height,
        horizontal ? 0.025 : o.width,
        materials.window,
        o.id,
        w.floor,
        "window",
        { openingId: o.id },
      );
      const f = 0.045;
      for (const off of [-o.width / 2 + f / 2, o.width / 2 - f / 2, 0])
        box(
          x + off * ux,
          o.sill + o.height / 2,
          z + off * uz,
          horizontal ? f : 0.1,
          o.height,
          horizontal ? 0.1 : f,
          materials.frame,
          o.id + "-mullion-" + off,
          w.floor,
          "window",
        );
      for (const y of [o.sill + f / 2, o.sill + o.height - f / 2])
        box(
          x,
          y,
          z,
          horizontal ? o.width : 0.1,
          f,
          horizontal ? 0.1 : o.width,
          materials.frame,
          o.id + "-frame-" + y,
          w.floor,
          "window",
        );
    }
  }
  // Ceilings are triangulated by narrow x bands so room edges and slope breaks are preserved.
  function clip(poly, axis, value, keepGreater) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        ina = keepGreater ? a[axis] >= value : a[axis] <= value,
        inb = keepGreater ? b[axis] >= value : b[axis] <= value;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }
  for (const r of spec.rooms) {
    if (r.id === "F1-STAIR" || r.id === "F1-STORE") continue;
    const xs = r.polygon.map((a) => a[0]);
    let breaks = [Math.min(...xs), Math.max(...xs)];
    if (r.floor === 2) {
      const edge = r.id === "F2-ROOM" ? 5.19 : 8.82;
      const knee = r.id === "F2-ROOM" ? p.southRightKneeHeight : p.rightKneeHeight;
      breaks.push(
        ((p.upperHeight - p.leftKneeHeight) * p.leftSlopeRun) /
          (p.technicalUpperHeight - p.leftKneeHeight),
        edge - ((p.upperHeight - knee) * p.rightSlopeRun) / (p.technicalUpperHeight - knee),
      );
    }
    breaks = [...new Set(breaks.filter((x) => x >= Math.min(...xs) && x <= Math.max(...xs)))].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i < breaks.length - 1; i++) {
      let poly = clip(clip(r.polygon, 0, breaks[i], true), 0, breaks[i + 1], false);
      if (poly.length < 3 || polygonArea(poly) < 0.001) continue;
      const h = (x, z) =>
        r.id === g.roomId
          ? g.floorOffset + g.ceilingHeight
          : r.floor === 1
            ? p.groundHeight
            : upperHeightAt(x, z, p, r.id === "F2-ROOM" ? "south" : "main");
      solid(
        poly,
        h,
        (x, z) => h(x, z) + 0.055,
        materials.ceiling,
        `${r.id}-CEILING-${i}`,
        r.floor,
        "ceiling",
        { roomId: r.id },
      );
    }
  }
  // Photo-corrected concrete stair: 10 treads, flat half-turn landing, 9 treads.
  // The landing and the upper floor each add one rise; the total is 21 rises.
  const stair = stairLayout(spec);
  const stairName = (n) => `STAIR-${String(n).padStart(2, "0")}`;
  const tread = (poly, low, top, index, flight) =>
    solid(poly, low, top, materials.stairs, stairName(index), 1, "stairs", {
      riserIndex: index,
      treadElevation: top,
      flight,
    });
  for (let i = 1; i <= stair.lowerTreads; i++) {
    const hi = stair.entryX - (i - 1) * stair.lowerGoing,
      lo = hi - stair.lowerGoing;
    tread(
      [
        [lo, stair.lowerZ],
        [hi, stair.lowerZ],
        [hi, stair.lowerZ + stair.lowerWidth],
        [lo, stair.lowerZ + stair.lowerWidth],
      ],
      (x) =>
        Math.max(0, ((stair.entryX - x) / stair.lowerGoing) * stair.rise - stair.waistThickness),
      i * stair.rise,
      i,
      "lower",
    );
  }
  solid(
    [
      [stair.x, stair.z],
      [stair.turnX, stair.z],
      [stair.turnX, stair.z + stair.depth],
      [stair.x, stair.z + stair.depth],
    ],
    stair.landingLevel - stair.landingThickness,
    stair.landingLevel,
    materials.stairs,
    "STAIR-LANDING",
    1,
    "stairs",
    {
      riserIndex: stair.lowerTreads + 1,
      treadElevation: stair.landingLevel,
      flight: "landing",
    },
  );
  for (let i = 1; i <= stair.upperTreads; i++) {
    const lo = stair.turnX + (i - 1) * stair.upperGoing,
      hi = lo + stair.upperGoing;
    const index = stair.lowerTreads + 1 + i;
    tread(
      [
        [lo, stair.upperZ],
        [hi, stair.upperZ],
        [hi, stair.upperZ + stair.upperWidth],
        [lo, stair.upperZ + stair.upperWidth],
      ],
      (x) =>
        stair.landingLevel +
        ((x - stair.turnX) / stair.upperGoing) * stair.rise -
        stair.waistThickness,
      index * stair.rise,
      index,
      "upper",
    );
  }
  // A solid plastered divider follows the upper concrete flight. No invented metal rails.
  const dividerZ = stair.z + stair.lowerWidth;
  solid(
    [
      [stair.turnX, dividerZ],
      [stair.entryX, dividerZ],
      [stair.entryX, dividerZ + stair.dividerThickness],
      [stair.turnX, dividerZ + stair.dividerThickness],
    ],
    0,
    (x) =>
      stair.landingLevel +
      ((x - stair.turnX) / (stair.entryX - stair.turnX)) * (stair.upperLevel - stair.landingLevel) +
      stair.parapetHeight,
    materials.wall,
    "F1-W13-DIVIDER",
    1,
    "stair-wall",
    { wallId: "F1-W13" },
  );
  // The landing edge faces the lower flight; the upper flight exit stays open.
  box(
    stair.entryX + 0.025,
    stair.parapetHeight / 2,
    stair.lowerZ + stair.lowerWidth / 2,
    0.05,
    stair.parapetHeight,
    stair.lowerWidth,
    materials.wall,
    "F2-STAIR-PARAPET",
    2,
    "stair-wall",
  );
  root.updateMatrixWorld(true);
  return { root, floors, materials };
}
