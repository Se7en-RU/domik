import { mm } from "./data.mjs";
export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const text = (x, y, t, size = 20, anchor = "start") =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${esc(t)}</text>`;
export function svgPage(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/><g font-family="DejaVu Sans,Arial,sans-serif" fill="#213341">${body}</g></svg>`;
}
export function planSvg(packet) {
  const { room, faces, furniture } = packet;
  const xs = room.polygon.map((p) => p[0]),
    zs = room.polygon.map((p) => p[1]);
  const minX = Math.min(...xs),
    minZ = Math.min(...zs),
    w = Math.max(...xs) - minX,
    h = Math.max(...zs) - minZ;
  const scale = Math.min(790 / w, 690 / h),
    px = (x) => 140 + (x - minX) * scale,
    py = (z) => 140 + (z - minZ) * scale;
  let body =
    text(40, 45, `${room.name} · ${room.id}`, 28) +
    text(40, 80, "Внутренний план · мебель и оборудование · X →, Z ↓", 18);
  body += `<polygon points="${room.polygon.map(([x, z]) => `${px(x)},${py(z)}`).join(" ")}" fill="#e3edf0" stroke="#94a3b8" stroke-dasharray="5 5"/>`;
  let furnitureLabels = "";
  furniture.forEach((f, i) => {
    const [x, z] = f.position,
      [fw, , fd] = f.size;
    body += `<g transform="translate(${px(x)} ${py(z)}) rotate(${f.rotation ?? 0})"><rect x="${(-fw * scale) / 2}" y="${(-fd * scale) / 2}" width="${fw * scale}" height="${fd * scale}" fill="#d7bb97" fill-opacity=".65" stroke="#846647"/><path d="M ${(-fw * scale) / 2} ${(-fd * scale) / 2} h ${fw * scale}" stroke="#503c2b" stroke-width="3"/></g>`;
    furnitureLabels += text(px(x), py(z) + 5, `M${i + 1}`, 14, "middle");
  });
  body += furnitureLabels;
  for (const f of faces) {
    const ax = px(f.a[0]),
      ay = py(f.a[1]),
      bx = px(f.b[0]),
      by = py(f.b[1]);
    body += `<path d="M ${ax} ${ay} L ${bx} ${by}" stroke="#334155" stroke-width="7"/>`;
    for (const o of f.openings) {
      const at = (d) => [ax + ((bx - ax) * d) / f.length, ay + ((by - ay) * d) / f.length];
      const a = at(o.start),
        b = at(o.start + o.width);
      body += `<path d="M ${a.join(" ")} L ${b.join(" ")}" stroke="${o.kind === "window" ? "#0284c7" : "#f8fafc"}" stroke-width="9"/>`;
    }
    const cx = (ax + bx) / 2 - f.normal[0] * 42,
      cy = (ay + by) / 2 - f.normal[1] * 42;
    // Only the number is drawn at short edges; dimensions remain in the table.
    const label = f.length * scale > 140 ? `${f.number} · ${mm(f.length)}` : `${f.number}`;
    const rotation = Math.abs(bx - ax) < Math.abs(by - ay) ? -90 : 0;
    body += `<g transform="translate(${cx} ${cy}) rotate(${rotation})">${text(0, 5, label, 17, "middle")}</g>`;
  }
  body += text(
    40,
    940,
    "Числа у стен → развёртки. M → список мебели. Синее — окна, разрыв — дверь/проход.",
    17,
  );
  body += text(
    40,
    974,
    `Площадь ${packet.area.toFixed(2)} м² · размеры и координаты — в паспорте`,
    18,
  );
  return svgPage(1100, 1010, body);
}
export function elevationsSvg(packet) {
  const rowHeight = 380,
    width = 1300;
  let body = text(35, 40, `${packet.room.name} · развёртки стен`, 26);
  packet.faces.forEach((f, i) => {
    const top = 75 + i * rowHeight,
      base = top + 265,
      scale = Math.min(1120 / f.length, 225 / packet.maximumHeight);
    const x = 65;
    body += text(35, top, `Стена ${f.number} · ${mm(f.length)} · ${f.wallIds.join(" + ")}`, 20);
    const poly = [[0, 0], ...f.profile, [f.length, 0]]
      .map(([s, h]) => `${x + s * scale},${base - h * scale}`)
      .join(" ");
    body += `<polygon points="${poly}" fill="#dde6ea" stroke="#516575" stroke-width="2"/>`;
    for (const o of f.openings) {
      body += `<rect x="${x + o.start * scale}" y="${base - (o.sill + o.height) * scale}" width="${o.width * scale}" height="${o.height * scale}" fill="${o.kind === "window" ? "#b0ddf1" : "#f8fafc"}" stroke="#467185"/>`;
      body += text(
        x + (o.start + o.width / 2) * scale,
        base - o.sill * scale - 8,
        o.id,
        12,
        "middle",
      );
    }
    const heights = f.profile.map((p) => p[1]);
    body += text(
      35,
      base + 35,
      `a → b · высота ${mm(Math.min(...heights))}–${mm(Math.max(...heights))} · толщина ${f.thicknesses.map(mm).join(" / ")}`,
      18,
    );
  });
  body += text(
    35,
    75 + packet.faces.length * rowHeight,
    "Отсчёт a → b по координатам паспорта. Скосы предварительные; профиль показан по внутренней грани.",
    17,
  );
  return svgPage(width, 120 + packet.faces.length * rowHeight, body);
}
