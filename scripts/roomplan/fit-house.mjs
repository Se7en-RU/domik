import fs from "node:fs";
import { normalizeScan } from "./normalize.mjs";
import { inspectScan } from "./audit.mjs";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const base = read("measurements/reports/scan-fit-before.json"),
  spec = structuredClone(base);
fs.mkdirSync("work/scan-fit", { recursive: true });
const round = (v) => Math.round(v / 0.005) * 0.005;
const clean = (v) => Math.round(v * 1e6) / 1e6;
// Least squares of shared dimensions. Each equation is an architectural
// measurement; no scale or reflection is applied to a scan.
const names = ["W", "A", "B", "C", "H", "P", "S", "D", "U", "V", "L", "Q", "T"];
const equations = [];
function measure(coeff, value, source, weight = 1) {
  equations.push({ coeff, value, source, weight });
}
measure({ W: 1 }, 8.706, "кухня-гостиная.json:B4133602");
measure({ A: 1 }, 3.237, "детская.json:11EEA21C");
measure({ B: 1 }, 3.501, "детская.json:43A652BB");
measure({ C: 1, A: -1 }, 1.98 + 0.1, "гардероб.json:CD0ACAE3");
measure({ W: 1, C: -1 }, 3.301 + 0.12, "спальня.json:north envelope excluding reveals");
measure({ W: 1, H: -1 }, 3.695 + 0.1, "спальня.json:8DEBB3BF");
measure({ H: 1, B: -1 }, 1.362 + 0.1, "коридор-2этаж.json:6FB1D619");
measure({ H: 1 }, 4.941, "коридор-2этаж.json:4C0813B4");
measure({ H: 1 }, 4.908, "комната-2этаж.json:FBAFA5A6");
measure({ P: 1, H: -1 }, 1.663 + 0.1, "туалет-2этаж.json:9623E6B5");
measure({ W: 1, P: -1 }, 1.891 + 0.1, "ванна.json:146414CF");
measure({ S: 1 }, 5.102, "комната-2этаж.json:6E46D8C7");
measure({ S: 1, H: -1 }, 0.194, "комната-2этаж.json:49F87314");
measure({ D: 1 }, 2.963, "гардероб.json:67F0A06F");
measure({ D: 1 }, 3.093 - 0.1, "детская.json:E1C30FC0");
measure({ D: 1 }, 3.04 - 0.1, "спальня.json:7DF43A36");
measure({ D: 1 }, 6.67 - 3.571 - 0.1, "коридор-2этаж.json:1C4CED2E");
measure({ U: 1 }, 3.442, "коридор.json:3A2C9A73");
measure({ V: 1 }, 3.073, "коридор.json:322CE7A0");
measure({ U: 1, V: -1 }, 0.369, "коридор.json:6F0DBFAF");
measure({ Q: 1, L: -1 }, 1.749, "туалет-1этаж.json:39F5DA52");
measure({ W: 1, Q: -1 }, 1.635 + 0.1, "бойлер.json:BD6887FB");
measure({ W: 1, L: -1 }, 3.515, "бойлер.json:75F5865E");
measure({ Q: 1, L: -1 }, 1.88 - 0.1, "бойлер.json:AD7AF597");
measure({ T: 1 }, 1.597, "туалет-1этаж.json:92DA86A4");
measure({ T: 1 }, 1.635 - 0.1, "бойлер.json:35FC74A5", 0.5);
measure({ T: 1 }, 2.723 - 1.088 - 0.1, "бойлер.json:5D8CC208", 0.5);
const n = names.length,
  m = Array.from({ length: n }, () => Array(n + 1).fill(0));
for (const e of equations)
  for (let i = 0; i < n; i++) {
    const a = e.coeff[names[i]] ?? 0;
    for (let j = 0; j < n; j++) m[i][j] += e.weight * a * (e.coeff[names[j]] ?? 0);
    m[i][n] += e.weight * a * e.value;
  }
for (let i = 0; i < n; i++) {
  let k = i;
  for (let j = i + 1; j < n; j++) if (Math.abs(m[j][i]) > Math.abs(m[k][i])) k = j;
  [m[i], m[k]] = [m[k], m[i]];
  const d = m[i][i];
  if (Math.abs(d) < 1e-9) throw Error("Underdetermined fit");
  for (let j = i; j <= n; j++) m[i][j] /= d;
  for (let k = 0; k < n; k++)
    if (k !== i) {
      const a = m[k][i];
      for (let j = i; j <= n; j++) m[k][j] -= a * m[i][j];
    }
}
const p = Object.fromEntries(names.map((name, i) => [name, clean(round(m[i][n]))]));
const { W, A, B, C, H, P, S, D, U, V, L, Q, T } = p;
const walls = new Map(spec.walls.map((w) => [w.id, w]));
function wall(id, a, b, t) {
  const w = walls.get(id);
  w.a = a.map(clean);
  w.b = b.map(clean);
  if (t !== undefined) w.t = clean(t);
  w.sourceRefs = [...(w.sourceRefs ?? []), "scan-fit-2026-09-09"];
}
function room(id, polygon) {
  const r = spec.rooms.find((r) => r.id === id);
  r.polygon = polygon.map((p) => p.map(clean));
  const xs = polygon.map((p) => p[0]),
    zs = polygon.map((p) => p[1]);
  const cross = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return a[0] * b[1] - b[0] * a[1];
  });
  const sum = cross.reduce((a, b) => a + b, 0);
  r.label = [0, 1].map((axis) =>
    clean(
      polygon.reduce(
        (s, a, i) => s + (a[axis] + polygon[(i + 1) % polygon.length][axis]) * cross[i],
        0,
      ) /
        (3 * sum),
    ),
  );
  r.dimensions = `${clean(Math.max(...xs) - Math.min(...xs))
    .toFixed(3)
    .replace(".", ",")} × ${clean(Math.max(...zs) - Math.min(...zs))
    .toFixed(3)
    .replace(".", ",")} м${polygon.length > 4 ? "; с уступом" : ""}`;
  r.sourceRefs = [...(r.sourceRefs ?? []), "scan-fit-2026-09-09"];
  r.sourceLabel = "Согласование RoomPlan · 09.09.2026; округление 5 мм";
}
const Z = spec.stairVoid.z,
  stairDepth = 2.1,
  roomTop = Z + stairDepth + 0.1;
const upperRear = Z + 2.81,
  corner = roomTop + 0.875,
  southEnd = roomTop + 3.305;
const officeTop = 6.94,
  officeStep = officeTop + 1.06,
  officeEnd = officeTop + 3.095;
const boilerRear = Z + 2.725,
  entryRear = boilerRear + 1.78;
// First floor: coupled polygons and wall axes; thickness anchors unchanged.
room("F1-LIVING", [
  [0, 0],
  [U + 0.05, 0],
  [U + 0.05, Z - 0.415],
  [0, Z - 0.415],
]);
room("F1-KITCHEN", [
  [U + 0.05, 0],
  [W, 0],
  [W, Z - 0.415],
  [U + 0.05, Z - 0.415],
]);
room("F1-BATH", [
  [L, Z],
  [Q, Z],
  [Q, Z + T],
  [L, Z + T],
]);
room("F1-BOILER", [
  [Q + 0.1, Z],
  [W, Z],
  [W, boilerRear],
  [L, boilerRear],
  [L, Z + T + 0.1],
  [Q + 0.1, Z + T + 0.1],
]);
room("F1-OFFICE", [
  [0, officeTop],
  [U, officeTop],
  [U, officeStep],
  [V, officeStep],
  [V, officeEnd],
  [0, officeEnd],
]);
room("F1-HALL", [
  [U + 0.1, Z],
  [L - 0.1, Z],
  [L - 0.1, entryRear],
  [V + 0.1, entryRear],
  [V + 0.1, officeStep + 0.1],
  [U + 0.1, officeStep + 0.1],
]);
room("F1-STORE", [
  [0, Z + 1.06 + 0.13],
  [U, Z + 1.06 + 0.13],
  [U, officeTop - 0.25],
  [0, officeTop - 0.25],
]);
room("F1-STAIR", [
  [0, Z],
  [U + 0.05, Z],
  [U + 0.05, Z + 1.06],
  [0, Z + 1.06],
]);
wall("F1-W01", [-0.6, -0.3], [W + 0.6, -0.3]);
wall("F1-W02", [-0.3, 0], [-0.3, officeEnd]);
wall("F1-W03", [W + 0.3, 0], [W + 0.3, boilerRear]);
wall("F1-W04", [-0.6, officeEnd + 0.3], [V + 0.6, officeEnd + 0.3]);
wall("F1-W05", [V + 0.3, entryRear + 0.6], [V + 0.3, officeEnd]);
wall("F1-W06", [V, entryRear + 0.3], [L + 0.5, entryRear + 0.3]);
wall("F1-W07", [L + 0.2, boilerRear + 0.6], [L + 0.2, entryRear]);
wall("F1-W08", [L - 0.1, boilerRear + 0.3], [W + 0.6, boilerRear + 0.3]);
wall("F1-W09", [0, Z - 0.415 / 2], [W, Z - 0.415 / 2]);
wall("F1-W10", [L - 0.05, Z], [L - 0.05, boilerRear]);
wall("F1-W11", [Q + 0.05, Z], [Q + 0.05, Z + T + 0.1]);
wall("F1-W12", [L, Z + T + 0.05], [Q, Z + T + 0.05]);
wall("F1-W14", [U + 0.05, Z + 1.06 + 0.05], [U + 0.05, officeStep + 0.05]);
wall("F1-W15", [0, officeTop - 0.125], [U, officeTop - 0.125]);
wall("F1-W16", [V, officeStep + 0.05], [U + 0.1, officeStep + 0.05]);
wall("F1-W17", [V + 0.05, officeStep + 0.05], [V + 0.05, entryRear]);
// Second floor, with one shared coordinate per physical face.
room("F2-CHILD", [
  [0, 0],
  [A, 0],
  [A, D + 0.1],
  [B, D + 0.1],
  [B, Z - 0.405],
  [0, Z - 0.405],
]);
room("F2-DRESS", [
  [A + 0.1, 0],
  [C, 0],
  [C, D],
  [A + 0.1, D],
]);
room("F2-BED", [
  [C + 0.12, 0],
  [W, 0],
  [W, Z - 0.405],
  [H + 0.1, Z - 0.405],
  [H + 0.1, D + 0.1],
  [C + 0.12, D + 0.1],
]);
room("F2-HALL", [
  [B + 0.1, D + 0.1],
  [H, D + 0.1],
  [H, Z + stairDepth],
  [B + 0.1, Z + stairDepth],
]);
room("F2-SHOWER", [
  [H + 0.1, Z],
  [P, Z],
  [P, upperRear],
  [H + 0.1, upperRear],
]);
room("F2-BATH", [
  [P + 0.1, Z],
  [W, Z],
  [W, upperRear],
  [P + 0.1, upperRear],
]);
room("F2-ROOM", [
  [0, roomTop],
  [H, roomTop],
  [H, corner],
  [S, corner],
  [S, southEnd],
  [0, southEnd],
]);
spec.stairVoid.width = clean(B + 0.05);
room("F2-STAIR", [
  [0, Z],
  [spec.stairVoid.width, Z],
  [spec.stairVoid.width, Z + stairDepth],
  [0, Z + stairDepth],
]);
wall("F2-W01", [-0.6, -0.3], [W + 0.6, -0.3]);
wall("F2-W02", [-0.3, 0], [-0.3, southEnd]);
wall("F2-W03", [W + 0.3, 0], [W + 0.3, upperRear]);
wall("F2-W04", [-0.6, southEnd + 0.3], [S + 0.6, southEnd + 0.3]);
wall("F2-W05", [S + 0.3, corner], [S + 0.3, southEnd]);
wall(
  "F2-W06",
  [H + 0.1, (upperRear + corner) / 2],
  [W + 0.6, (upperRear + corner) / 2],
  corner - upperRear,
);
wall("F2-W07", [0, Z - 0.405 / 2], [W, Z - 0.405 / 2]);
wall("F2-W08", [A + 0.05, 0], [A + 0.05, D + 0.1]);
wall("F2-W09", [C + 0.06, 0], [C + 0.06, D + 0.1]);
wall("F2-W10", [A, D + 0.05], [C + 0.12, D + 0.05]);
wall("F2-W11", [B + 0.05, D + 0.1], [B + 0.05, Z]);
wall("F2-W12", [H + 0.05, D + 0.1], [H + 0.05, roomTop - 0.05]);
wall("F2-W13", [P + 0.05, Z], [P + 0.05, upperRear]);
wall("F2-W14", [0, roomTop - 0.05], [H + 0.1, roomTop - 0.05]);
wall("F2-W15", [H + 0.05, roomTop - 0.05], [H + 0.05, corner]);
wall("F2-W16", [H + 0.1, upperRear + 0.05], [P, upperRear + 0.05]);
// Fit envelope and slopes from the same coordinates as rooms, not old constants.
spec.envelope = {
  floor1: [
    [-0.6, -0.6],
    [W + 0.6, -0.6],
    [W + 0.6, boilerRear + 0.6],
    [L + 0.5, boilerRear + 0.6],
    [L + 0.5, entryRear + 0.6],
    [V + 0.6, entryRear + 0.6],
    [V + 0.6, officeEnd + 0.6],
    [-0.6, officeEnd + 0.6],
  ],
  floor2: [
    [-0.6, -0.6],
    [W + 0.6, -0.6],
    [W + 0.6, corner],
    [S + 0.6, corner],
    [S + 0.6, southEnd + 0.6],
    [-0.6, southEnd + 0.6],
  ],
};
spec.parameters.upperMainWidth = W;
spec.parameters.upperSouthWidth = S;
spec.parameters.upperSouthStart = corner;
// Preserve the garage's measured shape, translate it with its shared house wall.
const dx = clean(L + 0.5 - 5.85),
  dz = clean(boilerRear + 0.6 - 8.02);
const garageRoom = spec.rooms.find((r) => r.id === "F1-GARAGE");
garageRoom.polygon = garageRoom.polygon.map(([x, z]) => [clean(x + dx), clean(z + dz)]);
garageRoom.label = garageRoom.label.map((v, i) => clean(v + (i ? dz : dx)));
spec.garage.fitTranslation = { x: dx, z: dz, source: "scan-fit-2026-09-09" };
spec.garage.leftSharedWallEndZ = clean(entryRear);
spec.garage.perimeterWalls[0].minZ = clean(entryRear);
spec.garage.wallProjection.attachmentZ = clean(boilerRear + 0.6);
spec.garage.wallProjection.rightEdgeX = clean(W + 0.6);
spec.garage.wallProjection.shiftX = clean(W + 0.6 - garageRoom.polygon[4][0]);
// Keep unmapped doors at their old relative location within the host wall.
for (const w of spec.walls) {
  const old = base.walls.find((v) => v.id === w.id);
  for (const o of w.openings ?? []) {
    const horizontal = Math.abs(w.b[0] - w.a[0]) > Math.abs(w.b[1] - w.a[1]);
    const axis = horizontal ? 0 : 1;
    const originalCenter = old.a[axis] + o.start + o.width / 2;
    const oldLen = old.b[axis] - old.a[axis];
    const newLen = w.b[axis] - w.a[axis];
    o.start = clean(round(((originalCenter - old.a[axis]) * newLen) / oldLen - o.width / 2));
  }
}
// Host-relative scan observations: use each explicitly identified room's best
// rigid fit, even when symmetry leaves the orientation ambiguous. Dimensions
// of symmetric rooms are usable; their opening positions need extra review.
const openingEvidence = [];
for (const file of fs.readdirSync("measurements/raw").filter((f) => f.endsWith(".json"))) {
  const scan = normalizeScan(read("measurements/raw/" + file));
  const result = inspectScan(scan, spec);
  for (const o of result.openings) {
    if (!o.modelOpeningId) continue;
    openingEvidence.push({ file, ...o, registration: result.registration.status });
  }
}
const excluded = new Set(["F2-WIN04"]);
for (const [id, group] of Map.groupBy(openingEvidence, (o) => o.modelOpeningId)) {
  if (excluded.has(id)) continue;
  const evidence = group
    .filter(
      (o) => o.registration === "MATCHED" || ["F2-WIN02", "F1-WIN05", "F1-EXT02"].includes(id),
    )
    .filter((o) => !o.file.includes("гараж"));
  if (!evidence.length) continue;
  const o = spec.walls.flatMap((w) => w.openings ?? []).find((o) => o.id === id);
  if (!o) continue;
  const median = (key) => {
    const a = evidence.map((o) => o[key]).sort((a, b) => a - b);
    return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2;
  };
  for (const field of ["width", "start", "height", "sill"]) o[field] = clean(round(median(field)));
  o.sourceRefs = [
    ...(o.sourceRefs ?? []),
    "scan-fit-2026-09-09:" + evidence.map((o) => o.id).join(","),
  ];
}
// The owner previously confirmed these equal-height and equal-type groups.
for (const g of spec.openingHeightGroups ?? [])
  for (const id of g.openingIds) {
    const o = spec.walls.flatMap((w) => w.openings ?? []).find((o) => o.id === id);
    o.height = g.height;
  }
const paired = spec.openingTypeGroups.find((g) => g.openingIds.includes("F1-WIN01"));
paired.width = 2.44;
paired.height = 2.615;
paired.source = "scan-fit-2026-09-09:paired glazed openings, common type";
for (const g of spec.openingTypeGroups ?? [])
  for (const id of g.openingIds) {
    const o = spec.walls.flatMap((w) => w.openings ?? []).find((o) => o.id === id);
    o.width = g.width;
    o.height = g.height;
  }
for (const w of spec.walls)
  for (const o of w.openings ?? []) {
    for (const field of ["width", "height", "sill", "start"]) o[field] = clean(round(o[field]));
  }
// Main passage follows the hall, so thick cross-walls cannot block it.
Object.assign(walls.get("F1-W09").openings[0], {
  start: clean(U + 0.1),
  width: clean(L - 0.1 - U - 0.1),
});
Object.assign(walls.get("F2-W07").openings[0], {
  start: clean(B + 0.1),
  width: clean(H - B - 0.1),
});
// Low vertical wall tops are measured in separate room scans. Preserve
// the prior roof pitch; the position of slope/flat transitions is derived.
Object.assign(spec.parameters, {
  leftKneeHeight: 1.925,
  rightKneeHeight: 1.96,
  southRightKneeHeight: 1.94,
  leftSlopeRun: 2.16,
  rightSlopeRun: 2.08,
  southRightSlopeRun: 2.03,
});
spec.revision = "2026-09-09-roomplan-coupled-fit";
spec.sources.push({
  id: "scan-fit-2026-09-09",
  file: "measurements/manual/scan-fit.json",
  priority: 0,
  note: "Владелец разрешил подгонку под сканы, округление до 5 мм; общие стены согласованы совместно.",
});
spec.assumptions = spec.assumptions.filter((a) => !["roomplan-review", "scan-fit"].includes(a.id));
spec.assumptions.push({
  id: "scan-fit",
  title: "Согласование сканов 09.09.2026",
  text: "Размеры помещений согласованы общей системой координат с округлением измеряемых размеров до 5 мм. Оси стен толщиной 405/415 мм могут попадать на 2,5 мм. Толщина F2-W06 выведена из совместной привязки ванной и комнаты и остаётся расчётным допущением. Сканы расходятся на несколько сантиметров; неподтверждённые двери и высотная привязка лестничного окна сохранены. Гараж перенесён целиком вместе с общей стеной без изменения измеренной формы.",
});
for (const a of spec.assumptions) {
  if (a.id === "walls")
    a.text =
      "Ручные толщины 415/405/130 мм сохранены. Стены и полигоны комнат согласованы по RoomPlan; стык F2-W15/F2-W06 замкнут. Неподтверждённые толщины сохранены, кроме F2-W06: " +
      clean(corner - upperRear) +
      " м по совместной привязке поверхностей, требует контрольного обмера.";
}
for (const a of spec.assumptions) {
  if (a.id === "slope")
    a.text =
      "Низкие точки по RoomPlan: слева 1,925 м (детская 1,908 и комната 1,942), справа 1,960 м (спальня 1,928 и ванная 1,996), в нижней комнате справа 1,940 м (скан 1,942). Смешанные коридор/лестница исключены из высотного усреднения. Уклон сохранён близким прежнему; длины скатов пересчитаны. Линии перехода к высокой части остаются расчётными, скан не задаёт плоскости скатов.";
  if (a.id === "garage-connection")
    a.text =
      "Гараж перенесён целиком вместе со стеной бойлерной: " +
      dx +
      " м по X и " +
      dz +
      " м по Z. Сканы задают его относительную форму, абсолютная привязка условная. Выступ выровнен по наружной грани дома X=" +
      clean(W + 0.6) +
      " м. Пол −0,35 м, толщина стен 0,30 м и плиты 0,18 м остаются допущениями.";
}
spec.rooms.find((r) => r.id === "F1-STAIR").dimensions += "; 10 + площадка + 9 проступей";
spec.rooms.find((r) => r.id === "F1-STORE").dimensions += "; под лестницей";
// Coordinates remain editable canonical data; this script writes a candidate.
write("work/scan-fit/candidate.json", spec);
write("work/scan-fit/evidence.json", {
  schemaVersion: "1.0",
  date: "2026-09-09",
  authorization:
    "Подгонка остальных размеров под RoomPlan; округление до 0,5 см; приоритет непрерывности стен.",
  parameters: p,
  equations: equations.map((e) => ({
    ...e,
    fitted: clean(Object.entries(e.coeff).reduce((s, [k, c]) => s + p[k] * c, 0)),
    residual: clean(Object.entries(e.coeff).reduce((s, [k, c]) => s + p[k] * c, 0) - e.value),
  })),
  lowWallHeights: {
    left: {
      accepted: 1.925,
      observations: [
        { file: "детская.json", value: 1.908 },
        { file: "комната-2этаж.json", value: 1.942 },
      ],
    },
    right: {
      accepted: 1.96,
      observations: [
        { file: "спальня.json", value: 1.928 },
        { file: "ванна.json", value: 1.996 },
      ],
    },
    southRight: { accepted: 1.94, observations: [{ file: "комната-2этаж.json", value: 1.942 }] },
  },
  derived: {
    upperRear: clean(upperRear),
    roomTop: clean(roomTop),
    corner: clean(corner),
    F2W06Thickness: clean(corner - upperRear),
    garageTranslation: { dx, dz },
  },
  openingEvidence,
});
console.log(p);
console.log("Candidate saved; not yet applied.");
