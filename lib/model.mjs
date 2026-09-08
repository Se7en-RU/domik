import * as THREE from "three";
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
  const topAt = (floor, x, z) => (floor === 1 ? p.groundHeight : upperHeightAt(x, z, p));
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
  spec.rooms.forEach((r, i) => {
    if (r.isVoid) return;
    const mat = new THREE.MeshStandardMaterial({
      color: roomColors[i % roomColors.length],
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    solid(r.polygon, 0, 0.012, mat, r.id, r.floor, "room", {
      roomId: r.id,
      area: polygonArea(r.polygon),
      sourcePages: r.sourcePages,
    });
  });
  // Divide each wall at openings and roof slope changes, then build sill / lintel pieces.
  for (const w of spec.walls) {
    const dx = w.b[0] - w.a[0],
      dz = w.b[1] - w.a[1],
      len = Math.hypot(dx, dz),
      ux = dx / len,
      uz = dz / len,
      nx = (-uz * w.t) / 2,
      nz = (ux * w.t) / 2;
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
        solid(c, 0, max, materials.wall, `${w.id}-${i}`, w.floor, "wall", { wallId: w.id });
      } else {
        if (o.sill > 0)
          solid(c, 0, o.sill, materials.wall, `${w.id}-${i}-sill`, w.floor, "wall", {
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
        r.floor === 1
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
  // Six winders around the left turn, two bottom steps and eight upper treads.
  const rise = (p.groundHeight + p.slabThickness) / p.stairRisers;
  const treadCount = 8;
  const cx = 1.15,
    cz = 5.63,
    rx = 1.15,
    rz = 1.06;
  box(0.575, rise / 2, 6.56, 1.15, rise, 0.22, materials.stairs, "STAIR-01", 1, "stairs");
  box(0.575, 2 * rise - 0.06, 6.34, 1.15, 0.12, 0.22, materials.stairs, "STAIR-02", 1, "stairs");
  const point = (ang) => {
    let x = Math.cos(ang),
      z = Math.sin(ang),
      t = Math.min(Math.abs(rx / (x || 1e-9)), Math.abs(rz / (z || 1e-9)));
    return [cx + t * x, cz + t * z];
  };
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 6,
      b = a + Math.PI / 6;
    let poly = [[cx, cz], point(a)];
    for (const angle of [Math.PI - Math.atan(rz / rx), Math.PI + Math.atan(rz / rx)])
      if (angle > a && angle < b) poly.push(point(angle));
    poly.push(point(b));
    solid(
      poly,
      (i + 3) * rise - 0.12,
      (i + 3) * rise,
      materials.stairs,
      `STAIR-${String(i + 3).padStart(2, "0")}`,
      1,
      "stairs",
    );
  }
  for (let i = 0; i < treadCount; i++) {
    const y = (9 + i) * rise;
    box(
      1.15 + (i + 0.5) * 0.3,
      y - 0.06,
      5.1,
      0.3,
      0.12,
      1.06,
      materials.stairs,
      `STAIR-${String(9 + i).padStart(2, "0")}`,
      1,
      "stairs",
    );
    if (i > 0)
      box(
        1.15 + i * 0.3,
        y - rise / 2,
        5.1,
        0.045,
        rise,
        1.06,
        materials.stairs,
        `STAIR-RISER-${i}`,
        1,
        "stairs",
      );
  }
  // Two slim stringers under the upper flight.
  const beam = (a, b, r, name, floor, kind) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      d = bv.clone().sub(av);
    const m = mesh(
      new THREE.CylinderGeometry(r, r, d.length(), 8),
      materials.rail,
      name,
      floor,
      kind,
    );
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  for (const z of [4.65, 5.53])
    beam(
      [1.15, 8.5 * rise - 0.12, z],
      [3.55, 15.5 * rise - 0.12, z],
      0.045,
      "STAIR-STRINGER-" + z,
      1,
      "stairs",
    );
  for (let i = 0; i < 9; i++) {
    let x = 1.15 + i * 0.3,
      y = (8 + i) * rise;
    beam([x, y, 5.64], [x, y + 0.92, 5.64], 0.017, "STAIR-POST-" + i, 1, "rail");
  }
  beam(
    [1.15, 8 * rise + 0.92, 5.64],
    [3.55, 16 * rise + 0.92, 5.64],
    0.026,
    "STAIR-HANDRAIL",
    1,
    "rail",
  );
  // Landing protection leaves the final upper tread exit free.
  for (let i = 0; i < 5; i++) {
    let z = 5.65 + i * 0.245;
    beam([3.56, 0, z], [3.56, 1, z], 0.017, "F2-RAILPOST-" + i, 2, "rail");
  }
  beam([3.56, 1, 5.65], [3.56, 1, 6.63], 0.027, "F2-RAIL", 2, "rail");
  root.updateMatrixWorld(true);
  return { root, floors, materials };
}
