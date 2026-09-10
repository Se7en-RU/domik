import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { buildHouse } from "../lib/model.mjs";
import { readSpec, validateModel } from "./validate-model.mjs";
import { projectRoot, distDir } from "./paths.mjs";

// GLTFExporter uses the browser FileReader API to read Blob data.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.({ target: this });
    });
  }
};

export async function exportModel() {
  const spec = readSpec();
  const { root } = buildHouse(spec);
  const report = validateModel(spec, root);
  const glb = Buffer.from(
    await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false }),
  );
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.byteLength);
  const metadata = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  assert.equal(metadata.asset.version, "2.0");
  for (const floor of ["Floor_1", "Floor_2"]) {
    assert(
      metadata.nodes.some((node) => node.name === floor),
      `GLB missing ${floor}`,
    );
  }
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(path.join(distDir, "house-model.glb"), glb);
  await fs.writeFile(path.join(distDir, "house-model.obj"), new OBJExporter().parse(root));
  await fs.writeFile(path.join(distDir, "house-model.json"), `${JSON.stringify(spec, null, 2)}\n`);
  await fs.copyFile(
    path.join(projectRoot, "lib/model.mjs"),
    path.join(distDir, "model-builder.mjs"),
  );
  await fs.copyFile(path.join(projectRoot, "lib/layout.mjs"), path.join(distDir, "layout.mjs"));
  await fs.copyFile(
    path.join(projectRoot, "lib/furniture.mjs"),
    path.join(distDir, "furniture.mjs"),
  );
  await fs.mkdir(path.join(projectRoot, "work"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "work/geometry-check.json"),
    `${JSON.stringify({ ...report, glbBytes: glb.byteLength }, null, 2)}\n`,
  );
  console.log(
    `Model validated and exported: ${report.meshCount} meshes, ${report.stairTreads} stairs, GLB ${glb.byteLength} bytes.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await exportModel();
}
