// Shared derived dimensions for the builder, viewer and geometry checks.
export function stairLayout(spec) {
  const s = spec.staircase;
  const v = spec.stairVoid;
  const totalRisers = s.lowerTreads + s.upperTreads + 2;
  const upperLevel = spec.parameters.groundHeight + spec.parameters.slabThickness;
  const rise = upperLevel / totalRisers;
  return {
    ...s,
    ...v,
    totalRisers,
    upperLevel,
    rise,
    landingLevel: (s.lowerTreads + 1) * rise,
    turnX: v.x + s.landingDepth,
    entryX: v.x + v.width,
    lowerZ: v.z,
    upperZ: v.z + s.lowerWidth + s.dividerThickness,
    upperWidth: v.depth - s.lowerWidth - s.dividerThickness,
    lowerGoing: (v.width - s.landingDepth) / s.lowerTreads,
    upperGoing: (v.width - s.landingDepth) / s.upperTreads,
  };
}

// The divider ends at the underside of the upper concrete flight.
export function stairDividerTop(stair, x) {
  return (
    stair.landingLevel + ((x - stair.turnX) / stair.upperGoing) * stair.rise - stair.waistThickness
  );
}

export function garageLayout(spec) {
  const g = spec.garage;
  const room = spec.rooms.find((room) => room.id === g.roomId);
  // The polygon remains the sole footprint source. Named vertex indices allow
  // measured returns/columns without maintaining a second set of coordinates.
  const indices = g.outlineVertices ?? {
    frontLeft: 0,
    backLeft: 1,
    notch: 2,
    backNotch: 3,
    backRight: 4,
    frontRight: 5,
  };
  const vertex = (key) => room.polygon[indices[key]];
  const frontLeft = vertex("frontLeft"),
    backLeft = vertex("backLeft"),
    notch = vertex("notch"),
    backNotch = vertex("backNotch"),
    backRight = vertex("backRight"),
    frontRight = vertex("frontRight");
  const frontLength = Math.hypot(frontRight[0] - frontLeft[0], frontRight[1] - frontLeft[1]);
  const gateStart = g.gateOffsetFromLeft ?? (frontLength - g.gateWidth) / 2;
  const gateCenterPoint = frontLeft.map(
    (v, i) => v + ((frontRight[i] - v) * (gateStart + g.gateWidth / 2)) / frontLength,
  );
  return {
    ...g,
    room,
    left: frontLeft[0],
    right: backRight[0],
    front: Math.max(frontLeft[1], frontRight[1]),
    frontLeft,
    frontRight,
    backLeft,
    backRight,
    frontLength,
    gateStart,
    gateCenterPoint,
    shortBack: backLeft[1],
    longBack: backNotch[1],
    notchX: backNotch[0],
    returnStartX: notch[0],
    width: backRight[0] - frontLeft[0],
    shortLength: Math.hypot(frontLeft[0] - backLeft[0], frontLeft[1] - backLeft[1]),
    longLength: Math.hypot(frontRight[0] - backRight[0], frontRight[1] - backRight[1]),
    gateCenter: gateCenterPoint[0],
  };
}

// Offset each edge outwards and intersect neighbouring lines. Works for the
// concave garage returns and the slightly skewed scanned front, in metres.
export function offsetPolygon(polygon, amount) {
  const signedArea = polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const sign = signedArea >= 0 ? 1 : -1;
  const lines = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 1e-6) throw new Error("Degenerate garage perimeter edge");
    return {
      p: [a[0] + ((sign * dz) / length) * amount, a[1] - ((sign * dx) / length) * amount],
      d: [dx, dz],
    };
  });
  return lines.map((line, i) => {
    const previous = lines[(i + lines.length - 1) % lines.length];
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const denominator = cross(previous.d, line.d);
    if (Math.abs(denominator) < 1e-8) return line.p;
    const t =
      cross(
        line.p.map((v, j) => v - previous.p[j]),
        line.d,
      ) / denominator;
    return previous.p.map((v, j) => v + t * previous.d[j]);
  });
}

// Generated perimeter walls are shared by the geometry builder and the dimension drawing.
// Keeping this in layout.mjs prevents a displayed gate or niche from drifting away from GLB.
export function garageWalls(spec) {
  const g = garageLayout(spec);
  const t = g.wallThickness;
  const wall = (id, a, b, openings = []) => ({
    id,
    a,
    b,
    t,
    floor: 1,
    component: "garage",
    height: g.floorOffset + g.ceilingHeight,
    openings,
  });
  if (g.perimeterWalls) {
    const axes = offsetPolygon(g.room.polygon, t / 2);
    const result = g.perimeterWalls.map((edge) => {
      let a = [...axes[edge.from]],
        b = [...axes[edge.to]];
      if (edge.minZ !== undefined) {
        a[1] = Math.max(a[1], edge.minZ);
        b[1] = Math.max(b[1], edge.minZ);
      }
      if (!edge.gate) return wall(edge.id, a, b);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const center =
        ((g.gateCenterPoint[0] - a[0]) * (b[0] - a[0]) +
          (g.gateCenterPoint[1] - a[1]) * (b[1] - a[1])) /
        length;
      return wall(edge.id, a, b, [
        {
          id: "GARAGE-GATE",
          start: center - g.gateWidth / 2,
          width: g.gateWidth,
          sill: g.floorOffset,
          height: g.gateHeight,
          kind: "garage-door",
        },
      ]);
    });
    if (g.wallProjection) {
      const [rearLeft, frontLeft, frontRight] = g.wallProjection.vertices.map(
        (i) => g.room.polygon[i],
      );
      const x = (frontLeft[0] + frontRight[0]) / 2 + (g.wallProjection.shiftX ?? 0);
      result.push({
        ...wall(g.wallProjection.id, [x, rearLeft[1]], [x, frontLeft[1]]),
        t: frontRight[0] - frontLeft[0],
        source: g.outlineSource,
      });
    }
    return result;
  }
  return [
    wall("GARAGE-W01", [g.left - t / 2, g.leftSharedWallEndZ], [g.left - t / 2, g.front]),
    wall("GARAGE-W02", [g.notchX, g.longBack - t / 2], [g.right + t, g.longBack - t / 2]),
    wall("GARAGE-W03", [g.right + t / 2, g.longBack], [g.right + t / 2, g.front]),
    wall(
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
}

export function roomFloorOffset(room, spec) {
  return room.id === spec.garage.roomId ? spec.garage.floorOffset : 0;
}

export function roomHeight(room, spec) {
  return room.id === spec.garage.roomId
    ? spec.garage.ceilingHeight
    : room.floor === 1
      ? spec.parameters.groundHeight
      : spec.parameters.upperHeight;
}
