import { Matrix4, Vector3 } from "three";
import { createHash } from "node:crypto";

const IDENTITY = new Matrix4().toArray();
const point = (p, m) => new Vector3(...p).applyMatrix4(m).toArray();
const round = (n) => Math.round(n * 1e6) / 1e6;

function matrix(values, label) {
  if (!Array.isArray(values) || values.length !== 16 || !values.every(Number.isFinite)) {
    throw new Error(`${label}: expected 16 finite column-major matrix values`);
  }
  const m = new Matrix4().fromArray(values);
  if (Math.abs(m.determinant()) < 1e-8) throw new Error(`${label}: singular transform`);
  // RoomPlan transforms are rigid; accepting scale would corrupt dimensions.
  const axes = [0, 4, 8].map((i) => new Vector3(...values.slice(i, i + 3)));
  if (
    axes.some((a) => Math.abs(a.length() - 1) > 1e-3) ||
    Math.abs(axes[0].dot(axes[1])) > 1e-3 ||
    Math.abs(axes[1].dot(axes[2])) > 1e-3 ||
    Math.abs(axes[0].dot(axes[2])) > 1e-3 ||
    m.determinant() < 0 ||
    [3, 7, 11].some((i) => Math.abs(values[i]) > 1e-5) ||
    Math.abs(values[15] - 1) > 1e-5
  ) {
    throw new Error(`${label}: expected a rigid transform`);
  }
  return m;
}

function surfaceData(s) {
  // Architectural whitelist: furniture and sections never enter the evidence.
  return Object.fromEntries(
    [
      "identifier",
      "parentIdentifier",
      "story",
      "confidence",
      "dimensions",
      "transform",
      "polygonCorners",
    ].map((key) => [key, s[key] ?? null]),
  );
}

export function normalizeScan(raw) {
  if (!raw.floors?.length) throw new Error("REVIEW REQUIRED: scan has no floor reference");
  const reference = matrix(raw.referenceOriginTransform ?? IDENTITY, "referenceOriginTransform");
  const referenceInverse = reference.clone().invert();
  const sourceFloor = raw.floors[0];
  const floorMatrix = matrix(sourceFloor.transform, "floor.transform");
  const referenceFloor = referenceInverse.clone().multiply(floorMatrix);
  // A floor is a LOCAL XY plane (local Z is its normal). Build a horizontal
  // X/Z frame with gravity Y, rather than interpreting local Y as height.
  // Apply the same reference change to floor and surfaces. It cancels in
  // relative geometry and does NOT register independently captured rooms.
  const up = new Vector3(0, 1, 0).transformDirection(referenceInverse);
  const normal = new Vector3(0, 0, 1).transformDirection(referenceFloor);
  if (Math.abs(normal.dot(up)) < 0.999) throw new Error("REVIEW REQUIRED: tilted floor reference");
  const x = new Vector3(1, 0, 0).transformDirection(referenceFloor);
  x.addScaledVector(up, -x.dot(up)).normalize();
  const z = x.clone().cross(up).normalize();
  const frame = new Matrix4().makeBasis(x, up, z);
  frame.setPosition(new Vector3().setFromMatrixPosition(referenceFloor));
  const sceneToFloor = frame.clone().invert().multiply(referenceInverse);
  const warnings = [];
  const seen = new Set();

  function normalizeSurface(s, type) {
    if (!s.identifier || seen.has(s.identifier))
      throw new Error("Missing or duplicate surface identifier");
    seen.add(s.identifier);
    if (
      !Array.isArray(s.dimensions) ||
      s.dimensions.length !== 3 ||
      !s.dimensions.every(Number.isFinite) ||
      s.dimensions[0] <= 0 ||
      s.dimensions[1] <= 0
    ) {
      throw new Error(`${s.identifier}: invalid surface dimensions`);
    }
    const transform = sceneToFloor.clone().multiply(matrix(s.transform, s.identifier));
    const [width, height] = s.dimensions;
    const corners = s.polygonCorners?.length
      ? s.polygonCorners
      : [
          [-width / 2, -height / 2, 0],
          [width / 2, -height / 2, 0],
          [width / 2, height / 2, 0],
          [-width / 2, height / 2, 0],
        ];
    if (corners.some((p) => p.length !== 3 || !p.every(Number.isFinite))) {
      throw new Error(`${s.identifier}: invalid polygonCorners`);
    }
    const polygon = corners.map((p) => point(p, transform));
    const center = point([0, 0, 0], transform);
    const a = point([-width / 2, 0, 0], transform);
    const b = point([width / 2, 0, 0], transform);
    if (type !== "floor" && Math.abs(a[1] - b[1]) > 0.02) {
      warnings.push(`${s.identifier}: inclined surface, REVIEW REQUIRED`);
    }
    return {
      id: s.identifier,
      parentWallId: s.parentIdentifier ?? null,
      story: s.story ?? raw.story ?? null,
      type,
      confidence:
        typeof s.confidence === "string"
          ? s.confidence
          : (Object.keys(s.confidence ?? {})[0] ?? null),
      dimensions: [...s.dimensions],
      transform: transform.toArray(),
      width,
      length: width,
      height,
      thickness: null,
      center,
      a: [a[0], a[2]],
      b: [b[0], b[2]],
      polygon,
      bottom: Math.min(...polygon.map((p) => p[1])),
      top: Math.max(...polygon.map((p) => p[1])),
      hasPolygon: Boolean(s.polygonCorners?.length),
    };
  }

  const floors = raw.floors.map((s) => normalizeSurface(s, "floor"));
  const walls = (raw.walls ?? []).map((s) => normalizeSurface(s, "wall"));
  const windows = (raw.windows ?? []).map((s) => normalizeSurface(s, "window"));
  const doors = (raw.doors ?? []).map((s) => normalizeSurface(s, "door"));
  for (const opening of [...windows, ...doors]) {
    const parent = walls.find((w) => w.id === opening.parentWallId);
    opening.start = null;
    opening.sill = opening.bottom;
    if (!parent) {
      warnings.push(`${opening.id}: unresolved parent wall, REVIEW REQUIRED`);
      continue;
    }
    const dx = parent.b[0] - parent.a[0],
      dz = parent.b[1] - parent.a[1];
    const length = Math.hypot(dx, dz);
    opening.start =
      ((opening.center[0] - parent.a[0]) * dx + (opening.center[2] - parent.a[1]) * dz) / length -
      opening.width / 2;
  }
  // IDs provide traceability; identical geometry with new UUIDs is not
  // independent evidence. Local coordinates remove arbitrary scene origins.
  const geometry = { floors, walls, windows, doors };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(geometry).map(([key, surfaces]) => [
            key,
            surfaces
              .map((s) => ({
                dimensions: s.dimensions.map(round),
                polygon: s.polygon.map((p) => p.map(round)),
              }))
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
          ]),
        ),
      ),
    )
    .digest("hex");
  const stories = [...new Set([...floors, ...walls].map((s) => s.story))];
  if (stories.length !== 1) warnings.push("Multiple stories: automatic registration disabled");
  if (floors.length !== 1) warnings.push("Multiple floors: automatic registration disabled");
  return {
    schemaVersion: "2.0",
    units: "metres",
    sourceStory: raw.story ?? null,
    architecturalHash: createHash("sha256")
      .update(
        JSON.stringify({
          referenceOriginTransform: raw.referenceOriginTransform ?? null,
          ...Object.fromEntries(
            ["floors", "walls", "windows", "doors"].map((key) => [
              key,
              (raw[key] ?? []).map(surfaceData),
            ]),
          ),
        }),
      )
      .digest("hex"),
    fingerprint,
    referenceOriginTransform: raw.referenceOriginTransform ?? null,
    sceneToFloor: sceneToFloor.toArray(),
    coordinateConvention:
      "X/Z horizontal; Y up; origin at first floor centre; independent of house coordinates",
    ...geometry,
    warnings,
  };
}
