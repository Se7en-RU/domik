import { garageWalls } from "../../lib/layout.mjs";

export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const median = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null;
};
export const rotate = ([x, z], angle) => [
  x * Math.cos(angle) - z * Math.sin(angle),
  x * Math.sin(angle) + z * Math.cos(angle),
];
export const transformPoint = (p, fit) =>
  rotate(p, fit.angle).map((v, i) => v + fit.translation[i]);
export const segment = (a, b, data = {}) => ({ ...data, a, b, length: distance(a, b) });
const direction = (s) => Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
const midpoint = (s) => s.a.map((v, i) => (v + s.b[i]) / 2);
const angleDifference = (a, b) =>
  Math.acos(Math.min(1, Math.abs(Math.cos(direction(a) - direction(b)))));

export function segmentDistance(p, s) {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - s.a[0]) * (s.b[0] - s.a[0]) + (p[1] - s.a[1]) * (s.b[1] - s.a[1])) / s.length ** 2,
    ),
  );
  return distance(
    p,
    s.a.map((v, i) => v + (s.b[i] - v) * t),
  );
}

function sample(s) {
  return [0.05, 0.25, 0.5, 0.75, 0.95].map((t) => s.a.map((v, i) => v + (s.b[i] - v) * t));
}

export function roomCandidates(spec) {
  const candidates = spec.rooms
    .filter((r) => !["F1-LIVING", "F1-KITCHEN", "F1-STAIR", "F1-STORE", "F2-STAIR"].includes(r.id))
    .map((r) => ({ id: r.id, roomIds: [r.id], floor: r.floor, polygon: r.polygon }));
  const v = spec.stairVoid;
  const hall = spec.rooms.find((r) => r.id === "F2-HALL");
  const living = spec.rooms.find((r) => r.id === "F1-LIVING");
  const kitchen = spec.rooms.find((r) => r.id === "F1-KITCHEN");
  candidates.push(
    {
      id: "F1-LIVING+F1-KITCHEN",
      roomIds: [living.id, kitchen.id],
      floor: 1,
      polygon: [living.polygon[0], kitchen.polygon[1], kitchen.polygon[2], living.polygon[3]],
    },
    {
      id: "F1-STAIR+F1-STORE",
      roomIds: ["F1-STAIR", "F1-STORE"],
      floor: 1,
      polygon: [
        [v.x, v.z],
        [v.x + v.width, v.z],
        [v.x + v.width, v.z + v.depth],
        [v.x, v.z + v.depth],
      ],
    },
    {
      id: "F2-HALL+F2-STAIR",
      roomIds: [hall.id, "F2-STAIR"],
      floor: 2,
      polygon: [
        [hall.polygon[0][0], hall.polygon[0][1]],
        [hall.polygon[1][0], hall.polygon[1][1]],
        [hall.polygon[2][0], v.z + v.depth],
        [v.x, v.z + v.depth],
        [v.x, v.z],
        [hall.polygon[0][0], v.z],
      ],
    },
  );
  const walls = [...spec.walls, ...garageWalls(spec)];
  return candidates.map((r) => {
    const edges = r.polygon.map((p, i) =>
      segment(p, r.polygon[(i + 1) % r.polygon.length], { edge: i }),
    );
    const openings = walls
      .filter((w) => w.floor === r.floor)
      .flatMap((w) =>
        (w.openings ?? []).map((o) => {
          const length = distance(w.a, w.b);
          const p = w.a.map((v, i) => v + ((w.b[i] - v) * (o.start + o.width / 2)) / length);
          return { ...o, wallId: w.id, center: p, axis: segment(w.a, w.b) };
        }),
      )
      .filter((o) => edges.some((e) => segmentDistance(o.center, e) < 0.65));
    return { ...r, edges, openings };
  });
}

function scoreFit(scan, candidate, fit) {
  const observed = scan.walls.map((w) =>
    segment(transformPoint(w.a, fit), transformPoint(w.b, fit), { id: w.id }),
  );
  function directed(from, to) {
    let total = 0,
      weight = 0,
      close = 0;
    for (const s of from) {
      const targets = to.filter((t) => angleDifference(s, t) < 0.1);
      for (const p of sample(s)) {
        const d = Math.min(0.7, ...targets.map((t) => segmentDistance(p, t)));
        const w = s.length / 5;
        total += d * w;
        weight += w;
        if (d < 0.1) close += w;
      }
    }
    return { error: total / weight, coverage: close / weight };
  }
  const forward = directed(observed, candidate.edges);
  const backward = directed(candidate.edges, observed);
  const openingErrors = [...scan.windows, ...scan.doors].map((o) => {
    const p = transformPoint([o.center[0], o.center[2]], fit);
    // Classification mismatch is a penalty, not a forced match: glazed doors
    // are often exported as doors while house.json calls them windows.
    return Math.min(
      0.6,
      ...candidate.openings.map(
        (m) =>
          distance(p, m.center) * 0.6 +
          Math.abs(o.width - m.width) * 0.15 +
          (o.type === m.kind ? 0 : 0.05),
      ),
    );
  });
  const openingError = openingErrors.length ? median(openingErrors) : 0;
  return {
    score: forward.error * 0.45 + backward.error * 0.55 + openingError * 0.25,
    surfaceError: forward.error,
    boundaryError: backward.error,
    coverage: backward.coverage,
  };
}

export function registerScan(scan, spec) {
  const candidates = roomCandidates(spec);
  const hypotheses = [];
  if (!scan.walls.length || scan.warnings.length)
    return {
      status: "REVIEW REQUIRED",
      reason: "Invalid or multiple coordinate references",
      hypotheses: [],
    };
  for (const candidate of candidates) {
    const fits = [];
    // Rigid 2D registration only: rotation and translation, never scaling or
    // reflection. Seed with architectural edge centres and endpoints.
    const seeds = new Set();
    for (const observed of scan.walls.filter((w) => w.length > 0.65)) {
      for (const target of candidate.edges.filter((e) => e.length > 0.65)) {
        for (const reverse of [0, Math.PI]) {
          const angle = direction(target) - direction(observed) + reverse;
          for (const [p, q] of [
            [midpoint(observed), midpoint(target)],
            [observed.a, reverse ? target.b : target.a],
            [observed.b, reverse ? target.a : target.b],
          ]) {
            const rp = rotate(p, angle);
            const fit = { angle, translation: q.map((v, i) => v - rp[i]) };
            const key = [Math.cos(angle), Math.sin(angle), ...fit.translation]
              .map((n) => n.toFixed(2))
              .join(",");
            if (seeds.has(key)) continue;
            seeds.add(key);
            fits.push({ ...fit, ...scoreFit(scan, candidate, fit) });
          }
        }
      }
    }
    fits.sort((a, b) => a.score - b.score);
    // Refine the best independent orientations. Symmetric rooms may have
    // equal fits; keep the alternative so ambiguity is visible.
    const selected = [];
    for (const seed of fits) {
      if (
        selected.some(
          (f) =>
            Math.cos(f.angle - seed.angle) > 0.99 &&
            distance(f.translation, seed.translation) < 0.3,
        )
      )
        continue;
      let best = seed;
      for (const step of [0.025, 0.005]) {
        for (let pass = 0; pass < 4; pass++) {
          let next = best;
          for (const dx of [-step, 0, step])
            for (const dz of [-step, 0, step]) {
              const fit = {
                angle: best.angle,
                translation: [best.translation[0] + dx, best.translation[1] + dz],
              };
              const scored = { ...fit, ...scoreFit(scan, candidate, fit) };
              if (scored.score < next.score) next = scored;
            }
          if (next === best) break;
          best = next;
        }
      }
      selected.push(best);
      if (selected.length === 2) break;
    }
    hypotheses.push(
      ...selected.map((fit) => ({
        ...fit,
        candidateId: candidate.id,
        roomIds: candidate.roomIds,
        floor: candidate.floor,
      })),
    );
  }
  hypotheses.sort((a, b) => a.score - b.score);
  const best = hypotheses[0],
    second = hypotheses[1];
  if (!best)
    return { status: "REVIEW REQUIRED", reason: "No architectural registration", hypotheses: [] };
  const margin = second ? second.score - best.score : Infinity;
  const status =
    best.score < 0.12 && best.coverage >= 0.8 && margin > 0.012 ? "MATCHED" : "REVIEW REQUIRED";
  return { status, ...best, margin, hypotheses: hypotheses.slice(0, 4) };
}

export function robustConsensus(observations) {
  const groups = new Map();
  for (const o of observations.filter((o) => Number.isFinite(o.value))) {
    const group = o.independenceKey ?? o.scan;
    if (!group) throw new Error("Observation requires an independence key");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(o.value);
  }
  const samples = [...groups].map(([key, values]) => ({ key, value: median(values) }));
  const center = median(samples.map((s) => s.value));
  if (center === null) return { value: null, observations: 0, inliers: [], outliers: [] };
  const mad = median(samples.map((s) => Math.abs(s.value - center)));
  const cutoff = Math.max(0.03, 3 * 1.4826 * mad);
  const inliers = samples.filter((s) => Math.abs(s.value - center) <= cutoff);
  const outliers = samples.filter((s) => Math.abs(s.value - center) > cutoff);
  return {
    value: median(inliers.map((s) => s.value)),
    observations: samples.length,
    independentInliers: inliers.length,
    spread: Math.max(...inliers.map((s) => s.value)) - Math.min(...inliers.map((s) => s.value)),
    inliers,
    outliers,
  };
}
