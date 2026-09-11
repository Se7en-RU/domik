import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { zipSync, strToU8 } from "fflate";
import { buildHouse } from "../lib/model.mjs";
import { projectRoot, distDir } from "./paths.mjs";
import { roomPacket, sourceHash, generatorHash } from "./ai/data.mjs";
import { planSvg, elevationsSvg, esc } from "./ai/drawings.mjs";
import { viewSvg } from "./ai/views.mjs";
import { roomPages, html } from "./ai/pages.mjs";

export async function exportAi(output = path.join(distDir, "ai")) {
  const spec = JSON.parse(await fs.readFile(path.join(projectRoot, "lib/house.json"), "utf8"));
  const { root } = buildHouse(spec);
  const rooms = spec.rooms.filter((r) => !r.isVoid);
  await fs.mkdir(output, { recursive: true });
  const manifest = {
    schemaVersion: "1.0",
    sourceRevision: spec.revision,
    sourceSha256: sourceHash(spec),
    generatorSha256: generatorHash(),
    rooms: [],
  };
  try {
    for (const room of rooms) {
      const packet = roomPacket(spec, room, root),
        pages = roomPages(
          packet,
          output.startsWith(path.join(projectRoot, "docs"))
            ? "https://se7en-ru.github.io/domik/"
            : "../../index.html",
        );
      const directory = path.join(output, room.id);
      await fs.mkdir(directory, { recursive: true });
      const files = {
        "passport.json": strToU8(JSON.stringify(packet, null, 2) + "\n"),
        "README.md": strToU8(pages.markdown),
        "prompt.txt": strToU8(pages.prompt),
        "index.html": strToU8(pages.html),
      };
      const drawings = { plan: planSvg(packet), elevations: elevationsSvg(packet) };
      for (let i = 0; i < 4; i++) drawings[`view-${i + 1}`] = viewSvg(root, packet, i);
      for (const [name, svg] of Object.entries(drawings)) {
        // Keep editable vector drawings; PNGs are immediately usable in image chats.
        if (!name.startsWith("view-")) files[`${name}.svg`] = strToU8(svg);
        files[`${name}.png`] = new Resvg(svg, {
          font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
        })
          .render()
          .asPng();
      }
      const archiveFiles = {
        ...files,
        "index.html": strToU8(
          pages.html
            .replace(/<nav>.*?<\/nav>/s, "")
            .replace(/<a class="button" href="room-kit.zip".*?<\/a>/s, ""),
        ),
        "README.md": strToU8(
          pages.markdown
            .replace("[Все комнаты](../README.md) · ", "")
            .replace("[Комплект ZIP](room-kit.zip) · ", ""),
        ),
      };
      const archive = zipSync(
        Object.fromEntries(
          Object.entries(archiveFiles).map(([name, data]) => [
            name,
            [data, { mtime: new Date("2026-01-01T00:00:00Z") }],
          ]),
        ),
        { level: 6 },
      );
      for (const [name, data] of Object.entries(files))
        await fs.writeFile(path.join(directory, name), data);
      await fs.writeFile(path.join(directory, "room-kit.zip"), archive);
      manifest.rooms.push({
        id: room.id,
        name: room.name,
        floor: room.floor,
        page: `${room.id}/index.html`,
        passport: `${room.id}/passport.json`,
        archive: `${room.id}/room-kit.zip`,
      });
      console.log(`AI room: ${room.id}`);
    }
    const title = "Комнаты для ChatGPT и Gemini";
    await fs.writeFile(
      path.join(output, "index.html"),
      html(
        title,
        `<nav><a href="${output.startsWith(path.join(projectRoot, "docs")) ? "https://se7en-ru.github.io/domik/" : "../index.html"}">← Просмотрщик дома</a></nav><h1>${title}</h1><p>Выберите комнату и передайте ссылку чату. На каждой странице — план, четыре 3D-вида, развёртки, размеры и готовый запрос. Если чат не видит изображения по ссылке, скачайте комплект и приложите PNG и паспорт.</p><p>Размеры и расстановка взяты из модели; отделка условная. Генерация картинки не гарантирует соблюдения размеров.</p><div class="grid">${manifest.rooms.map((r) => `<a class="card" href="${r.page}"><img src="${r.id}/view-1.png" alt="${esc(r.name)}" loading="lazy"><h2>${esc(r.name)}</h2><small>Этаж ${r.floor} · ${r.id}</small></a>`).join("")}</div><p>Ревизия ${esc(spec.revision)} · <a href="manifest.json">Индекс JSON</a></p>`,
      ),
    );
    await fs.writeFile(
      path.join(output, "README.md"),
      `# ${title}\n\nВыберите комнату. Дайте ИИ ссылку на её README или приложите PNG, passport.json и prompt.txt из ZIP. Если чат не прочитал файлы, не просите его угадывать планировку.\n\n| Комната | Этаж | Комплект |\n| --- | --- | --- |\n${manifest.rooms.map((r) => `| [${r.name} · ${r.id}](${r.id}/README.md) | ${r.floor} | [ZIP](${r.archive}) |`).join("\n")}\n\nРевизия: ${spec.revision}. Контрольная сумма исходной модели: ${sourceHash(spec)}.\n\nМатериалы созданы автоматически из lib/house.json общим генератором геометрии. Потолки и ближние стены скрыты только в обзорных 3D-видах. Развёртки и паспорт сохраняют высоты; допущения перечислены в паспорте. Исходный GLB после сборки — в dist/house-model.glb; на Pages — рядом с просмотрщиком.\n`,
    );
    await fs.writeFile(
      path.join(output, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  } finally {
    const geometries = new Set(),
      materials = new Set();
    root.traverse((o) => {
      if (o.isMesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }
  console.log(`AI kits: ${rooms.length} rooms → ${path.relative(projectRoot, output)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await exportAi(process.argv.includes("--docs") ? path.join(projectRoot, "docs/ai") : undefined);
}
