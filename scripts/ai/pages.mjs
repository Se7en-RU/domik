import { esc } from "./drawings.mjs";
import { mm } from "./data.mjs";
export const instructions = `Используй комплект комнаты как основу для визуализации интерьера. Сначала прочитай паспорт и посмотри план, все 3D-виды и развёртки. Сохрани внутренний контур, высоты, скосы, размеры и положение окон, дверей, мебели и оборудования. Меняй отделку, цвета, материалы и освещение в стиле [УКАЖИ СТИЛЬ]. Не добавляй проёмы, перегородки или мебель, не переставляй предметы без моего запроса. Отсутствующие на обзорном ракурсе стены и потолок скрыты для обзора: восстанови их по паспорту и развёрткам. Не интерпретируй направления X/Z как стороны света. Условные размеры не называй подтверждёнными обмерами. Если файлы или изображения недоступны, попроси приложить комплект, а не придумывай геометрию. Перед генерацией кратко перечисли прочитанные файлы и ограничения комнаты. Генерация изображения — визуальная концепция; точность проверяется по модели.`;
const table = (headers, rows) =>
  `<div class="table"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
export function html(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;background:#f3f5f4;color:#233834;font:17px/1.6 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:40px 24px}h1{font-size:clamp(30px,5vw,48px);line-height:1.12}h2{margin-top:48px}a{color:#146859}nav,.links{display:flex;gap:16px;flex-wrap:wrap}.card,pre,figure{background:white;border:1px solid #d9e3df;border-radius:14px;padding:20px;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px}.grid figure{margin:0;padding:8px}img{display:block;max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:10px;border-bottom:1px solid #d9e3df;vertical-align:top}button,.button{display:inline-block;border:0;border-radius:8px;background:#146859;color:white;padding:12px 18px;font:inherit;text-decoration:none;cursor:pointer}small{color:#536760}code{overflow-wrap:anywhere}</style></head><body><main>${body}</main></body></html>`;
}
const mdTable = (headers, rows) =>
  `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map((v) => String(v).replaceAll("|", "/").replaceAll("\n", " ")).join(" | ")} |`).join("\n")}`;
export function roomPages(packet, viewerHref = "../../index.html") {
  const { room } = packet;
  const prompt = `Комната: ${room.name} (${room.id}). Ревизия: ${packet.sourceRevision}.\n\n${instructions}`;
  const walls = packet.faces.map((f) => [
    f.number,
    `${f.a.map(mm).join(", ")} → ${f.b.map(mm).join(", ")}`,
    mm(f.length),
    f.wallIds.join(" + "),
  ]);
  const openings = packet.faces.flatMap((f) =>
    f.openings.map((o) => [
      f.number,
      o.id,
      o.kind,
      `${mm(o.width)} × ${mm(o.height)}`,
      mm(o.start),
      mm(o.sill),
    ]),
  );
  const furniture = packet.furniture.map((f, i) => [
    `M${i + 1}`,
    f.id,
    f.kind,
    f.size.map(mm).join(" × "),
    f.position.map(mm).join(", "),
    `${f.rotation ?? 0}°`,
    mm(f.resolvedElevation),
  ]);
  const sections = [
    ["Стены", ["№", "a → b: X, Z", "Длина", "ID модели"], walls],
    [
      "Окна, двери и проходы",
      ["Стена", "ID", "Тип", "Ширина × высота", "Отступ от a", "Низ от пола"],
      openings,
    ],
    [
      "Мебель и оборудование",
      ["На плане", "ID", "Тип", "Ш × В × Г", "Центр X, Z", "Поворот", "Низ от пола"],
      furniture,
    ],
  ];
  const summary = `Этаж ${room.floor} · площадь ${packet.area.toFixed(2)} м² · максимальная высота ${mm(packet.maximumHeight)} · отметка пола ${mm(packet.floorElevation)}.`;
  const figures = ["plan", "view-1", "view-2", "view-3", "view-4", "elevations"];
  const labels = [
    "План с мебелью",
    "3D-вид 1",
    "3D-вид 2",
    "3D-вид 3",
    "3D-вид 4",
    "Развёртки стен",
  ];
  const body = `<nav><a href="../index.html">← Все комнаты</a><a href="${viewerHref}">Просмотрщик</a></nav><h1>${esc(room.name)}</h1><p>${esc(summary)}</p><small>${esc(room.id)} · ${esc(packet.sourceRevision)}</small><p class="links"><a class="button" href="room-kit.zip" download>Скачать комплект для ИИ</a><a href="passport.json">Паспорт JSON</a><a href="README.md">Описание Markdown</a><a href="prompt.txt" download>Запрос TXT</a></p><p>Дайте чату ссылку на эту страницу. Если изображения не открываются, распакуйте ZIP и приложите PNG и паспорт к сообщению.</p><h2>Готовый запрос</h2><pre id="prompt">${esc(prompt)}</pre><button id="copy">Скопировать запрос</button><p id="status" role="status"></p><h2>Геометрия комнаты</h2><figure><a href="plan.png"><img src="plan.png" alt="План комнаты с расположением мебели и номерами стен"></a></figure><div class="grid">${figures
    .slice(1, 5)
    .map(
      (f, i) =>
        `<figure><a href="${f}.png"><img src="${f}.png" alt="${labels[i + 1]}" loading="lazy"></a><figcaption>${labels[i + 1]}</figcaption></figure>`,
    )
    .join(
      "",
    )}</div><h2>Развёртки</h2><figure><a href="elevations.png"><img src="elevations.png" alt="Внутренние развёртки стен с проёмами и скосами" loading="lazy"></a></figure>${sections.map(([title, headers, rows]) => `<h2>${title}</h2>${table(headers, rows)}`).join("")}<h2>Что учитывать</h2><ul>${packet.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p>${esc(packet.furnitureNotes ?? "")}</p><details><summary>Исходные допущения модели</summary><pre>${esc(JSON.stringify(packet.assumptions, null, 2))}</pre></details><small>SHA-256 модели: <code>${packet.sourceSha256}</code></small><script>document.getElementById('copy').onclick=async()=>{const text=document.getElementById('prompt').textContent;try{await navigator.clipboard.writeText(text);document.getElementById('status').textContent='Запрос скопирован';}catch{const range=document.createRange();range.selectNodeContents(document.getElementById('prompt'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.getElementById('status').textContent='Текст выделен — скопируйте его вручную.'}};</script>`;
  const markdown = `# ${room.name} · ${room.id}\n\n${summary}\n\nРевизия: ${packet.sourceRevision}. SHA-256: ${packet.sourceSha256}.\n\n[Все комнаты](../README.md) · [Комплект ZIP](room-kit.zip) · [Паспорт JSON](passport.json) · [Запрос](prompt.txt)\n\n${figures.map((f, i) => `![${labels[i]}](${f}.png)`).join("\n\n")}\n\n${sections.map(([title, headers, rows]) => `## ${title}\n\n${mdTable(headers, rows)}`).join("\n\n")}\n\n## Ограничения\n\n${packet.notes.map((n) => `- ${n}`).join("\n")}\n\n${packet.furnitureNotes ?? ""}\n\nПолные допущения и источники — в passport.json.\n\n## Запрос для ИИ\n\n${prompt}\n`;
  return { html: html(room.name, body), markdown, prompt };
}
