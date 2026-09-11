import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { unzipSync, unzlibSync } from "fflate";
import spec from "../lib/house.json" with { type: "json" };
import { buildHouse } from "../lib/model.mjs";
import { roomPacket, sourceHash, generatorHash } from "./ai/data.mjs";
import { roomScene } from "./ai/views.mjs";
import { rasterize } from "./ai/raster.mjs";
import { projectRoot } from "./paths.mjs";
const { root } = buildHouse(spec);
const room = (id) => spec.rooms.find((r) => r.id === id);

test("AI passports preserve internal garage geometry, gate height and resolved equipment", () => {
  const before = JSON.stringify(spec),
    garage = roomPacket(spec, room("F1-GARAGE"), root);
  assert.equal(garage.maximumHeight, 2.927);
  assert.equal(garage.floorElevation, -0.35);
  assert.ok(garage.faces.some((f) => Math.abs(f.length - 6.376) < 1e-6));
  const gate = garage.faces.flatMap((f) => f.openings).find((o) => o.kind === "garage-door");
  assert.ok(gate);
  assert.equal(gate.width, 4.743);
  assert.equal(gate.height, 2.7);
  assert.equal(gate.sill, 0);
  for (const r of spec.rooms.filter((r) => !r.isVoid)) {
    const packet = roomPacket(spec, r, root);
    for (const f of packet.furniture) {
      const object = root.getObjectByName(f.id);
      assert.ok(Math.abs(f.position[0] - object.position.x) < 1e-6);
      assert.ok(Math.abs(f.resolvedElevation - object.userData.resolvedElevation) < 1e-6);
    }
    for (const face of packet.faces)
      for (const o of face.openings) {
        assert.ok(o.start >= -1e-6 && o.start + o.width <= face.length + 1e-6, `${r.id}: ${o.id}`);
      }
  }
  assert.equal(JSON.stringify(spec), before);
});

test("AI room views exclude neighbouring furniture and retain real stair geometry", () => {
  const packet = roomPacket(spec, room("F1-STAIR"), root);
  const scene = roomScene(root, packet, [-1, -1]);
  const stairMaterial = root.getObjectByName("STAIR-LANDING").material;
  assert.ok(scene.children.filter((m) => m.isMesh && m.material === stairMaterial).length >= 20);
  const office = roomPacket(spec, room("F1-OFFICE"), root);
  const officeScene = roomScene(root, office, [1, 1]);
  assert.ok(officeScene.children.some((m) => m.isMesh));
  // Shared walls are clipped at this room's internal corners, not exported at whole-house length.
  const bounds = new THREE.Box3().setFromObject(officeScene);
  const xs = office.room.polygon.map((p) => p[0]),
    zs = office.room.polygon.map((p) => p[1]);
  assert.ok(bounds.min.x >= Math.min(...xs) - 0.7 && bounds.max.x <= Math.max(...xs) + 0.7);
  assert.ok(bounds.min.z >= Math.min(...zs) - 0.7 && bounds.max.z <= Math.max(...zs) + 0.7);
  for (const s of [scene, officeScene]) s.traverse((o) => o.geometry?.dispose());
});

function decodePixels(png) {
  let at = 8;
  const chunks = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at),
      type = png.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + len));
    at += len + 12;
  }
  return unzlibSync(Buffer.concat(chunks));
}
test("Raster depth resolves intersecting triangles independently of draw order", () => {
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const triangle = (positions, color) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
  };
  const red = triangle([-0.9, -0.9, 0.5, 0.9, -0.9, -0.5, 0, 0.9, 0], 0xff0000);
  const blue = triangle([-0.9, -0.9, 0, 0.9, -0.9, 0, 0, 0.9, 0], 0x0000ff);
  scene.add(red, blue);
  const first = rasterize(scene, camera, 100, 100);
  scene.remove(red, blue);
  scene.add(blue, red);
  assert.deepEqual(rasterize(scene, camera, 100, 100), first);
  const pixels = decodePixels(first),
    at = (x, y) => y * 401 + 1 + x * 4;
  assert.ok(pixels[at(30, 70)] > pixels[at(30, 70) + 2]);
  assert.ok(pixels[at(70, 70) + 2] > pixels[at(70, 70)]);
});

test("Checked-in AI kits match source and contain usable images, links and standalone archives", () => {
  const dir = path.join(projectRoot, "docs/ai"),
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
  assert.equal(
    manifest.sourceSha256,
    sourceHash(spec),
    "Run npm run export:ai after changing the model",
  );
  assert.equal(
    manifest.generatorSha256,
    generatorHash(),
    "Run npm run export:ai after changing geometry or the exporter",
  );
  assert.deepEqual(
    manifest.rooms.map((r) => r.id),
    spec.rooms.filter((r) => !r.isVoid).map((r) => r.id),
  );
  for (const entry of manifest.rooms) {
    const base = path.join(dir, entry.id),
      packet = JSON.parse(fs.readFileSync(path.join(base, "passport.json")));
    assert.deepEqual(
      packet,
      JSON.parse(JSON.stringify(roomPacket(spec, room(entry.id), root))),
      `Stale passport ${entry.id}`,
    );
    const archive = unzipSync(fs.readFileSync(path.join(base, "room-kit.zip")));
    for (const name of [
      "plan.png",
      "elevations.png",
      "view-1.png",
      "view-2.png",
      "view-3.png",
      "view-4.png",
    ]) {
      const image = fs.readFileSync(path.join(base, name));
      assert.equal(image.subarray(1, 4).toString(), "PNG");
      assert.ok(image.length > 3000);
      assert.deepEqual(Buffer.from(archive[name]), image);
    }
    for (const filename of ["index.html", "README.md"]) {
      const content = fs.readFileSync(path.join(base, filename), "utf8");
      const links = filename.endsWith("html")
        ? [...content.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1])
        : [...content.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
      for (const href of links)
        if (!/^https?:/.test(href))
          assert.ok(
            fs.existsSync(path.resolve(base, href)),
            `${entry.id}/${filename}: broken ${href}`,
          );
    }
    const archiveHtml = Buffer.from(archive["index.html"]).toString();
    for (const [, href] of archiveHtml.matchAll(/(?:href|src)="([^"#]+)"/g))
      if (!/^https?:/.test(href)) assert.ok(archive[href], `ZIP link missing: ${href}`);
  }
});
