#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? 'measurements/normalized-scan.json';

if (!inputPath) {
  console.error(
    'Usage: node scripts/roomplan-normalize.mjs <CapturedRoom.json> [output.json]',
  );
  process.exit(1);
}

const roomPlan = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const EPSILON = 1e-6;

function vec3(x, y, z) {
  return { x, y, z };
}

function sub(a, b) {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function add(a, b) {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(v, s) {
  return vec3(v.x * s, v.y * s, v.z * s);
}

/**
 * RoomPlan exports simd matrices in column-major order.
 *
 * [ 0  4  8 12 ]
 * [ 1  5  9 13 ]
 * [ 2  6 10 14 ]
 * [ 3  7 11 15 ]
 */
function matrixFromArray(m) {
  return {
    x: vec3(m[0], m[1], m[2]),
    y: vec3(m[4], m[5], m[6]),
    z: vec3(m[8], m[9], m[10]),
    translation: vec3(m[12], m[13], m[14]),
  };
}

function transformPoint(matrix, point) {
  return add(
    matrix.translation,
    add(
      add(
        scale(matrix.x, point.x),
        scale(matrix.y, point.y),
      ),
      scale(matrix.z, point.z),
    ),
  );
}

/**
 * Inverse for a rigid transform:
 * R^-1 = R^T
 * t^-1 = -R^T * t
 */
function inverseRigid(matrix) {
  const inverseX = vec3(matrix.x.x, matrix.y.x, matrix.z.x);
  const inverseY = vec3(matrix.x.y, matrix.y.y, matrix.z.y);
  const inverseZ = vec3(matrix.x.z, matrix.y.z, matrix.z.z);

  const t = matrix.translation;

  return {
    x: inverseX,
    y: inverseY,
    z: inverseZ,
    translation: vec3(
      -dot(inverseX, t),
      -dot(inverseY, t),
      -dot(inverseZ, t),
    ),
  };
}

function multiplyTransforms(a, b) {
  const transformAxis = (axis) =>
    add(
      add(
        scale(a.x, axis.x),
        scale(a.y, axis.y),
      ),
      scale(a.z, axis.z),
    );

  return {
    x: transformAxis(b.x),
    y: transformAxis(b.y),
    z: transformAxis(b.z),
    translation: add(
      transformPoint(a, b.translation),
      vec3(0, 0, 0),
    ),
  };
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalizeAngle(angle) {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function deg(rad) {
  return rad * 180 / Math.PI;
}

function polygonBounds(corners) {
  if (!corners.length) {
    return {
      minX: 0,
      maxX: 0,
      minZ: 0,
      maxZ: 0,
      width: 0,
      depth: 0,
    };
  }

  const xs = corners.map((p) => p.x);
  const zs = corners.map((p) => p.z);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

if (!roomPlan.floors?.length) {
  throw new Error('RoomPlan scan does not contain floors.');
}

const floor = roomPlan.floors[0];

const floorTransform = matrixFromArray(floor.transform);
const floorInverse = inverseRigid(floorTransform);

function worldToFloor(transformArray) {
  const world = matrixFromArray(transformArray);

  return multiplyTransforms(floorInverse, world);
}

function normalizeWall(wall) {
  const transform = worldToFloor(wall.transform);

  const length = wall.dimensions[0];
  const height = wall.dimensions[1];

  const center = transform.translation;

  const direction = vec3(
    transform.x.x,
    0,
    transform.x.z,
  );

  const directionLength = Math.hypot(direction.x, direction.z);

  if (directionLength > EPSILON) {
    direction.x /= directionLength;
    direction.z /= directionLength;
  }

  const angle = Math.atan2(direction.z, direction.x);

  const half = length / 2;

  const start = add(center, scale(direction, -half));
  const end = add(center, scale(direction, half));

  return {
    id: wall.identifier,
    story: wall.story,
    category: wall.category,
    length,
    height,
    thickness: null,

    center: {
      x: center.x,
      y: center.y,
      z: center.z,
    },

    direction: {
      x: direction.x,
      z: direction.z,
    },

    angle: {
      radians: normalizeAngle(angle),
      degrees: deg(normalizeAngle(angle)),
    },

    endpoints: {
      a: {
        x: start.x,
        z: start.z,
      },
      b: {
        x: end.x,
        z: end.z,
      },
    },

    confidence: wall.confidence ?? null,
  };
}

const walls = roomPlan.walls.map(normalizeWall);

const wallById = new Map(
  walls.map((wall) => [wall.id, wall]),
);

function normalizeOpening(opening, type) {
  const transform = worldToFloor(opening.transform);
  const center = transform.translation;

  const parent = opening.parentIdentifier
    ? wallById.get(opening.parentIdentifier)
    : null;

  let offsetFromWallStart = null;

  if (parent) {
    const wallDirection = vec3(
      parent.direction.x,
      0,
      parent.direction.z,
    );

    const wallStart = vec3(
      parent.endpoints.a.x,
      0,
      parent.endpoints.a.z,
    );

    const openingCenter = vec3(
      center.x,
      0,
      center.z,
    );

    offsetFromWallStart =
      dot(
        sub(openingCenter, wallStart),
        wallDirection,
      );
  }

  return {
    id: opening.identifier,
    type,
    story: opening.story,

    parentWallId: opening.parentIdentifier ?? null,

    width: opening.dimensions[0],
    height: opening.dimensions[1],

    center: {
      x: center.x,
      y: center.y,
      z: center.z,
    },

    start:
      offsetFromWallStart == null
        ? null
        : offsetFromWallStart - opening.dimensions[0] / 2,

    confidence: opening.confidence ?? null,
  };
}

const windows = (roomPlan.windows ?? [])
  .map((item) => normalizeOpening(item, 'window'));

const doors = (roomPlan.doors ?? [])
  .map((item) => normalizeOpening(item, 'door'));

const floorCorners = (floor.polygonCorners ?? [])
  .map((p) => transformPoint(
    matrixFromArray(floor.transform),
    vec3(p[0], p[1], p[2]),
  ))
  .map((p) => {
    const local = transformPoint(floorInverse, p);

    return {
      x: local.x,
      y: local.y,
      z: local.z,
    };
  });

const bounds = polygonBounds(floorCorners);

const result = {
  schemaVersion: '1.0',

  source: {
    type: 'apple-roomplan',
    version: roomPlan.version ?? null,
    story: roomPlan.story ?? 0,
  },

  room: {
    label: roomPlan.sections?.[0]?.label ?? null,

    bounds: {
      width: bounds.width,
      depth: bounds.depth,
    },

    polygon: floorCorners,
  },

  walls,
  windows,
  doors,

  notes: [
    'Coordinates are normalized to the scanned floor coordinate system.',
    'RoomPlan object identifiers are preserved.',
    'No values from domik/house.json are applied at this stage.',
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(result, null, 2)}\n`,
);

console.log(`Written: ${outputPath}`);
console.log(
  `Walls: ${walls.length}, windows: ${windows.length}, doors: ${doors.length}`,
);
console.log(
  `Floor bounds: ${bounds.width.toFixed(3)} × ${bounds.depth.toFixed(3)} m`,
);