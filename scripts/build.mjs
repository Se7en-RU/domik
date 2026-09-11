import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { projectRoot, distDir } from "./paths.mjs";
import { exportModel } from "./export.mjs";
import { exportAi } from "./export-ai.mjs";

// The production HTML embeds the entire viewer, including its reference plans.
// This keeps /domik/ on Pages and offline file:// viewing independent of base URLs.
const result = await build({
  absWorkingDir: projectRoot,
  entryPoints: ["scripts/entry.tsx"],
  outfile: "dist/viewer.js",
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "inline-plans",
      setup(bundler) {
        bundler.onLoad({ filter: /app[\\/]page\.tsx$/ }, async (args) => {
          let contents = await fs.readFile(args.path, "utf8");
          for (const floor of ["floor-1", "floor-2"]) {
            const image = await fs.readFile(path.join(projectRoot, "public/plans", `${floor}.jpg`));
            contents = contents.replaceAll(
              `/plans/${floor}.jpg`,
              `data:image/jpeg;base64,${image.toString("base64")}`,
            );
          }
          return { contents, loader: "tsx", resolveDir: path.dirname(args.path) };
        });
      },
    },
  ],
});

const js = result.outputFiles
  .find((file) => file.path.endsWith(".js"))
  .text.replaceAll("</script", "<\\/script");
const css = result.outputFiles.find((file) => file.path.endsWith(".css")).text;
const icon = await fs.readFile(path.join(projectRoot, "public/favicon.svg"));
const html = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:image/svg+xml;base64,${icon.toString("base64")}"><title>Дом · 3D-модель</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
assert(html.includes('<div id="root"></div>'));
assert(!html.includes("/plans/floor-"), "Reference plans must be embedded");
assert(!/<script[^>]+src=/.test(html), "Scripts must be embedded");
assert(!/<link[^>]+href="\//.test(html), "Root-relative assets break project Pages");

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(path.join(distDir, "index.html"), html);
await fs.writeFile(path.join(distDir, "house-viewer.html"), html);
await fs.writeFile(path.join(distDir, ".nojekyll"), "");
await exportModel();
await exportAi();
console.log(
  `Built dist/: standalone viewer (${Buffer.byteLength(html)} bytes), GLB, OBJ and editable JSON.`,
);
