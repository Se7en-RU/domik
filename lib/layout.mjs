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

export function garageLayout(spec) {
  const g = spec.garage;
  const room = spec.rooms.find((room) => room.id === g.roomId);
  // The ordered six-point polygon is the canonical garage footprint.
  const [frontLeft, backLeft, notch, backNotch, backRight] = room.polygon;
  return {
    ...g,
    room,
    left: frontLeft[0],
    right: backRight[0],
    front: frontLeft[1],
    shortBack: backLeft[1],
    longBack: backNotch[1],
    notchX: notch[0],
    width: backRight[0] - frontLeft[0],
    shortLength: frontLeft[1] - backLeft[1],
    longLength: frontLeft[1] - backNotch[1],
    gateCenter: (frontLeft[0] + backRight[0]) / 2,
  };
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
