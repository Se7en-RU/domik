import { garageWalls } from "../../lib/layout.mjs";
import {
  distance,
  median,
  registerScan,
  roomCandidates,
  robustConsensus,
  segment,
  segmentDistance,
  transformPoint,
} from "./register.mjs";

const round = (n) => Math.round(n * 1000) / 1000;
const midpoint = (w) => w.a.map((v, i) => (v + w.b[i]) / 2);
const parallel = (a, b) =>
  Math.abs(
    ((a.b[0] - a.a[0]) * (b.b[0] - b.a[0]) + (a.b[1] - a.a[1]) * (b.b[1] - b.a[1])) /
      (a.length * b.length),
  ) > 0.995;

export function inspectScan(scan, spec) {
  const registration = registerScan(scan, spec);
  const candidate = roomCandidates(spec).find((c) => c.id === registration.candidateId);
  if (!candidate) return { registration, walls: [], openings: [], comparisons: [] };
  const modelWalls = [...spec.walls, ...garageWalls(spec)]
    .filter((w) => w.floor === candidate.floor)
    .map((w) => segment(w.a, w.b, w));
  const wallLinks = new Map();
  const comparisons = [];
  const walls = scan.walls.map((w) => {
    const world = segment(transformPoint(w.a, registration), transformPoint(w.b, registration));
    const edgeRanks = candidate.edges
      .filter((e) => parallel(world, e))
      .map((edge) => ({
        edge,
        error: median([world.a, midpoint(world), world.b].map((p) => segmentDistance(p, edge))),
      }))
      .sort((a, b) => a.error - b.error);
    const nearest = edgeRanks[0];
    const modelRanks = modelWalls
      .filter((m) => parallel(world, m))
      .map((wall) => ({
        wall,
        error: Math.abs(segmentDistance(midpoint(world), wall) - wall.t / 2),
      }))
      .sort((a, b) => a.error - b.error);
    const model = modelRanks[0];
    const mapped =
      model && model.error < 0.45 && (!modelRanks[1] || modelRanks[1].error - model.error > 0.04);
    if (mapped) wallLinks.set(w.id, model.wall);
    const fullSpan =
      nearest &&
      nearest.error < 0.25 &&
      Math.min(
        distance(world.a, nearest.edge.a) + distance(world.b, nearest.edge.b),
        distance(world.a, nearest.edge.b) + distance(world.b, nearest.edge.a),
      ) < 0.5;
    if (fullSpan) {
      const delta = w.length - nearest.edge.length;
      comparisons.push({
        target: mapped ? model.wall.id : candidate.id,
        roomIds: candidate.roomIds,
        field: `room-face-span:${nearest.edge.edge}`,
        model: round(nearest.edge.length),
        measured: round(w.length),
        delta: round(delta),
        observations: 1,
        scanSurface: w.id,
        decision:
          registration.status === "MATCHED" && Math.abs(delta) < 0.01
            ? "IGNORE"
            : "REVIEW REQUIRED",
        reason:
          registration.status !== "MATCHED"
            ? "Неоднозначная привязка комнаты/ориентации."
            : Math.abs(delta) < 0.01
              ? "Менее 1 см."
              : "Одна съёмка этой грани; длина по внутренней поверхности, не по оси всей стены. Требуется согласовать соседние помещения.",
      });
    }
    return {
      id: w.id,
      a: world.a.map(round),
      b: world.b.map(round),
      length: round(w.length),
      height: round(w.height),
      bottom: round(w.bottom),
      top: round(w.top),
      confidence: w.confidence,
      modelWallId: mapped ? model.wall.id : null,
      status: mapped && registration.status === "MATCHED" ? "MATCHED" : "REVIEW REQUIRED",
      role: fullSpan ? "room-face-span" : "partial surface / reveal / unresolved",
      thickness: null,
    };
  });
  const openings = [...scan.windows, ...scan.doors].map((o) => {
    const parent = wallLinks.get(o.parentWallId);
    const center = transformPoint([o.center[0], o.center[2]], registration);
    const ranks = (parent?.openings ?? [])
      .map((m) => {
        const p = parent.a.map(
          (v, i) => v + ((parent.b[i] - v) * (m.start + m.width / 2)) / parent.length,
        );
        return { opening: m, error: distance(p, center) + Math.abs(m.width - o.width) * 0.2 };
      })
      .sort((a, b) => a.error - b.error);
    const match =
      ranks[0]?.error < 0.65 && (!ranks[1] || ranks[1].error - ranks[0].error > 0.15)
        ? ranks[0].opening
        : null;
    const kindMatches = match?.kind === o.type;
    const status =
      match && kindMatches && registration.status === "MATCHED" ? "MATCHED" : "REVIEW REQUIRED";
    let start = null;
    if (parent)
      start =
        ((center[0] - parent.a[0]) * (parent.b[0] - parent.a[0]) +
          (center[1] - parent.a[1]) * (parent.b[1] - parent.a[1])) /
          parent.length -
        o.width / 2;
    if (match)
      for (const field of ["width", "height", "sill", "start"]) {
        const value = field === "start" ? start : o[field];
        const delta = value - match[field];
        comparisons.push({
          roomIds: candidate.roomIds,
          target: match.id,
          wallId: parent.id,
          field,
          model: round(match[field]),
          measured: round(value),
          delta: round(delta),
          observations: 1,
          scanSurface: o.id,
          decision: status === "MATCHED" && Math.abs(delta) < 0.01 ? "IGNORE" : "REVIEW REQUIRED",
          reason: !kindMatches
            ? "Классификация проёма отличается; не создавать и не заменять проём автоматически."
            : status !== "MATCHED"
              ? "Неоднозначная регистрация."
              : Math.abs(delta) < 0.01
                ? "Менее 1 см."
                : "Одиночный замер; проверить чистый проём, раму и вертикальную отметку. start зависит от регистрации.",
        });
      }
    return {
      id: o.id,
      type: o.type,
      parentScanWallId: o.parentWallId,
      modelWallId: parent?.id ?? null,
      modelOpeningId: match?.id ?? null,
      status,
      center: center.map(round),
      width: round(o.width),
      height: round(o.height),
      sill: round(o.sill),
      start: start === null ? null : round(start),
    };
  });
  return { registration, walls, openings, comparisons };
}

export function summarizeEvidence(scans, spec) {
  const groups = new Map();
  for (const scan of scans.filter((s) => !s.error)) {
    for (const row of scan.comparisons) {
      const key = `${row.roomIds.join("+")}/${row.target}/${row.field}`;
      if (!groups.has(key)) groups.set(key, { ...row, samples: [] });
      groups.get(key).samples.push({
        value: row.measured,
        scan: scan.file,
        independenceKey: scan.fingerprint,
        registration: scan.registration.status,
        compatible: row.decision === "IGNORE" || !row.reason.startsWith("Классификация"),
      });
    }
  }
  const comparisons = [...groups.values()].map(({ samples, ...row }) => {
    // Unresolved registrations remain visible but cannot confirm another scan.
    const usable = samples.filter((s) => s.registration === "MATCHED" && s.compatible);
    const consensus = robustConsensus(usable);
    const delta = consensus.value === null ? row.delta : round(consensus.value - row.model);
    return {
      ...row,
      measured: consensus.value === null ? row.measured : round(consensus.value),
      delta,
      observations: usable.length ? consensus.independentInliers : 0,
      consensus,
      samples,
      decision: usable.length && Math.abs(delta) < 0.01 ? "IGNORE" : "REVIEW REQUIRED",
      reason:
        usable.length && Math.abs(delta) < 0.01
          ? "Менее 1 см."
          : usable.length
            ? "Измерение грани/проёма требует связанного геометрического решения; повтор одного файла не увеличивает вес."
            : "Привязка не подтверждена.",
    };
  });
  for (const floor of [1, 2]) {
    const samples = scans
      .filter(
        (s) =>
          s.registration?.status === "MATCHED" &&
          s.registration.floor === floor &&
          !s.registration.roomIds.some((id) => /STAIR|GARAGE/.test(id)),
      )
      .map((s) => ({
        value: median(s.walls.filter((w) => w.height > 2.7 && w.height < 3.5).map((w) => w.height)),
        scan: s.file,
        independenceKey: s.fingerprint,
      }))
      .filter((s) => s.value !== null);
    const consensus = robustConsensus(samples);
    if (consensus.value !== null)
      comparisons.push({
        target: floor === 1 ? "parameters.groundHeight" : "parameters.upperHeight",
        roomIds: [],
        field: "height",
        model: floor === 1 ? spec.parameters.groundHeight : spec.parameters.upperHeight,
        measured: round(consensus.value),
        delta: round(
          consensus.value -
            (floor === 1 ? spec.parameters.groundHeight : spec.parameters.upperHeight),
        ),
        observations: consensus.independentInliers,
        consensus,
        samples,
        decision:
          Math.abs(
            consensus.value -
              (floor === 1 ? spec.parameters.groundHeight : spec.parameters.upperHeight),
          ) < 0.01
            ? "IGNORE"
            : "REVIEW REQUIRED",
        reason:
          floor === 1
            ? "Разные комнаты дают близкие высоты; нет независимой высотной привязки этажей. Изменение затронет все подъёмы лестницы."
            : "Сохраняется принятая владельцем высота 3.045 м. confidence описывает классификацию, не сантиметровую точность; скосы отдельно не измерены.",
      });
  }
  return comparisons;
}

const escape = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export function renderOverlay(report, spec) {
  return (
    `<!doctype html><html lang="ru"><meta charset="utf-8"><title>RoomPlan — сопоставление</title>
  <style>body{font:15px system-ui;margin:24px;background:#f5f4f0;color:#192c36}h1{font-size:26px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:20px}section{background:white;padding:20px;border:1px solid #ddd;border-radius:10px}svg{width:100%;height:450px}p{line-height:1.5}.review{color:#97570b}text{font:0.16px system-ui}</style>
  <h1>Сопоставление сканов и модели</h1><p>Серый — модель; синий — стены скана; оранжевый — окна; красный — двери. Привязка REVIEW REQUIRED — гипотеза, не принятая геометрия. Размеры в метрах. Масштаб сканов не изменялся.</p><main>` +
    report.scans
      .map((s) => {
        if (s.error || !s.registration.candidateId)
          return `<section><h2>${escape(s.file)}</h2><p>${escape(s.error ?? "Нет привязки")}</p></section>`;
        const r = s.registration;
        const candidates = roomCandidates(spec);
        const candidate = candidates.find((c) => c.id === r.candidateId);
        const pts = [...s.walls.flatMap((w) => [w.a, w.b]), ...candidate.polygon];
        const min = [0, 1].map((i) => Math.min(...pts.map((p) => p[i])) - 0.6);
        const size = [0, 1].map((i) => Math.max(...pts.map((p) => p[i])) - min[i] + 0.6);
        const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${p.join(",")}`).join(" ");
        return `<section><h2>${escape(s.file)}</h2><p class="${r.status === "MATCHED" ? "" : "review"}">${escape(r.candidateId)} · ${r.status}<br>Ошибка подбора: ${r.score.toFixed(3)} м; покрытие контура: ${(100 * r.coverage).toFixed(0)}%</p>
      <svg viewBox="${[...min, ...size].join(" ")}" role="img" aria-label="Наложение ${escape(s.file)}">
      ${spec.rooms
        .filter((room) => candidate.roomIds.includes(room.id))
        .map(
          (room) =>
            `<path d="${path(room.polygon)}Z" fill="#eef0ee" stroke="#8b9398" stroke-width=".04"/>`,
        )
        .join("")}
      ${s.walls.map((w, i) => `<path d="${path([w.a, w.b])}" fill="none" stroke="#087da5" stroke-width=".025"/><text x="${(w.a[0] + w.b[0]) / 2 + 0.04}" y="${(w.a[1] + w.b[1]) / 2 - 0.04}">${i}: ${w.length}</text>`).join("")}
      ${s.openings.map((o) => `<circle cx="${o.center[0]}" cy="${o.center[1]}" r=".07" fill="${o.type === "window" ? "#ef9800" : "#cb3760"}"><title>${escape(o.modelOpeningId ?? "Не сопоставлен")} ${o.width} × ${o.height}</title></circle>`).join("")}
      </svg></section>`;
      })
      .join("") +
    "</main></html>"
  );
}

export function renderMarkdown(report) {
  const safe = report.proposals.filter((r) => r.decision === "SAFE TO APPLY");
  return (
    `# Проверка RoomPlan и ручных замеров\n\nМодель: ${report.revision}. Отчёт воспроизводится командой \`npm run measurements:audit\`.\n\n` +
    `Обработано файлов: ${report.scans.length}. Геометрическая регистрация прошла пороги подбора: ${report.scans.filter((s) => s.registration?.status === "MATCHED").length}. SAFE TO APPLY сейчас: ${safe.length}. Остальные изменения не применяются.\n\n` +
    (report.applied
      ? `Применены ручные контроли в ревизии ${report.applied.revisionAfter}:\n\n` +
        report.applied.proposals
          .map((p) => `- **${p.target}**: ${p.model} → ${p.measured} м.`)
          .join("\n") +
        "\n\nИсходный diff сохранён в [before-apply.json](before-apply.json).\n\n"
      : "") +
    (report.ownerReviews?.length
      ? "## Решения владельца при review\n\n" +
        report.ownerReviews
          .map(
            (r) =>
              `- **${r.target} / ${r.field}**: ${r.previous.toFixed(2)} → ${r.accepted.toFixed(2)} м · ${r.status}. ${r.scope}`,
          )
          .join("\n") +
        "\n\n"
      : "") +
    `## Ручные контрольные точки\n\n| Стена | Было, м | Замер, м | Δ, м | Решение |\n|---|---:|---:|---:|---|\n` +
    report.proposals
      .map((r) => `| ${r.target} | ${r.model} | ${r.measured} | ${r.delta} | ${r.decision} |`)
      .join("\n") +
    "\n\n" +
    report.proposals.map((r) => `- **${r.target}**: ${r.reason}`).join("\n") +
    `\n\n## Регистрация всех сканов\n\nНазвания файлов не участвуют в подборе. story=0 во всех текущих файлах — локальный индекс, а не номер этажа дома. Одинаковая геометрия не считается независимым повтором. Ошибка подбора — метрика согласования с моделью, не оценка точности прибора.\n\n| Файл | Гипотеза | Статус | Ошибка, м |\n|---|---|---|---:|\n` +
    report.scans
      .map(
        (s) =>
          `| ${s.file} | ${s.registration?.candidateId ?? s.error} | ${s.registration?.status ?? "REVIEW REQUIRED"} | ${s.registration?.score?.toFixed(3) ?? "—"} |`,
      )
      .join("\n") +
    `\n\n## Расхождения\n\nГрани комнаты измерены по внутренней поверхности. Их длина не равна длине оси стены, проходящей через несколько комнат. Неизвестная толщина в сканах всегда null.\n\n| Комната / объект | Параметр | Модель, м | Замер, м | Δ, м | Независимых подтверждений | Решение |\n|---|---|---:|---:|---:|---:|---|\n` +
    report.comparisons
      .map(
        (r) =>
          `| ${r.roomIds.join("+")} / ${r.target} | ${r.field} | ${r.model} | ${r.measured} | ${r.delta} | ${r.observations} | ${r.decision} |`,
      )
      .join("\n") +
    `\n\n## Ограничения и следующий обмер\n\n- Высоты сканов согласованы для принятых комнат: первый этаж 3,03 м, высокая часть второго 3,045 м, гараж 2,927 м. Толщина перекрытия 0,22 м и отметка пола гаража −0,35 м остаются допущениями; высота ворот 2,70 м сохранена, потому что отдельная поверхность ворот в скане отсутствует.\n- Контур гаража, выступ и ширина ворот приняты по скану в owner review (см. manual/garage-review.json). Грань GARAGE-W05 выровнена по F1-W08; актуальное совместное перемещение гаража и дома записано в manual/scan-fit.json.\n- Стыки F1-W14/F1-W16/F1-W17 и F2-W12/F2-W14/F2-W15/F2-W16 сведены в непрерывные участки; решение записано в manual/wall-continuity-review.json.\n- Для неоднозначных прямоугольных помещений нужны привязки дверей: одинаковый контур допускает несколько ориентаций.\n- Не восстанавливаются новые окна/двери по одной классификации RoomPlan; рама и чистый проём могут иметь разные размеры.\n- referenceOriginTransform применяется одинаково к полу и поверхностям, затем строится локальная система X/Z с Y вверх. Он не задаёт общую привязку разных сканов.\n- Скосы и наружный контур уточнены по совместному подбору (WHOLE-HOUSE.md); число лестничных подъёмов сохранено. Толщина поперечных стен распространена вдоль существующих единых осей как допущение.\n\nПодробные наблюдения, UUID, альтернативы регистрации, выбросы и причины решений — в [audit.json](audit.json); наглядное наложение — [overlay.html](overlay.html). Исходные JSON сохранены без изменений; мебель не используется.\n\nДокументация формата: [Apple — polygonCorners](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners), [Apple — Surface](https://developer.apple.com/documentation/roomplan/capturedroom/surface), [Apple — Confidence](https://developer.apple.com/documentation/roomplan/capturedroom/confidence).\n`
  );
}
