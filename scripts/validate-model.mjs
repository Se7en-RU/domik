import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { buildHouse, polygonArea, upperHeightAt } from "../lib/model.mjs";
import { projectRoot } from "./paths.mjs";

export function readSpec() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "lib/house.json"), "utf8"));
}

export function validateModel(spec, root = buildHouse(spec).root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  assert(meshes.length > 0, "Model is empty");
  assert.equal(
    new Set(spec.rooms.map((room) => room.id)).size,
    spec.rooms.length,
    "Duplicate room IDs",
  );
  for (const mesh of meshes) {
    assert(
      Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite),
      `${mesh.name}: invalid coordinates`,
    );
    mesh.geometry.computeBoundingBox();
    assert(!mesh.geometry.boundingBox.isEmpty(), `${mesh.name}: empty geometry`);
  }
  root.updateMatrixWorld(true);
  const slab = root.getObjectByName("F2-SLAB");
  assert(slab, "Missing upper slab");
  const ray = new THREE.Raycaster(new THREE.Vector3(1, 20, 5.1), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(slab).length, 0, "Stairwell covered by upper slab");
  ray.ray.origin.set(6, 20, 2);
  assert(ray.intersectObject(slab).length > 0, "Slab missing under rooms");
  const mainWall = meshes.filter((mesh) => mesh.userData.wallId === "F1-W09");
  assert(mainWall.length > 0, "Missing main wall");
  ray.ray.origin.set(4.3, 1.5, 3.7);
  ray.ray.direction.set(0, 0, 1);
  assert.equal(ray.intersectObjects(mainWall).length, 0, "Main doorway blocked");
  const stairs = meshes.filter((mesh) => /^STAIR-\d+$/.test(mesh.name));
  assert.equal(
    stairs.length,
    spec.parameters.stairRisers,
    "Stair count mismatch: update the builder when changing riser count",
  );
  const last = root.getObjectByName("STAIR-16");
  assert(last, "Missing final stair");
  assert(
    Math.abs(
      last.position.y + 0.06 - (spec.parameters.groundHeight + spec.parameters.slabThickness),
    ) < 0.0001,
    "Final stair does not meet upper floor",
  );
  const p = spec.parameters;
  assert(
    Math.abs(upperHeightAt(4, 2, p) - p.upperHeight) < 0.0001,
    "High ceiling differs from upperHeight",
  );
  assert(
    Math.abs(upperHeightAt(0, 2, p) - p.leftKneeHeight) < 0.0001,
    "Left ceiling slope missing",
  );
  assert(
    Math.abs(upperHeightAt(8.82, 2, p) - p.rightKneeHeight) < 0.0001,
    "Right ceiling slope missing",
  );
  assert(
    Math.abs(upperHeightAt(5.19, 9, p, "south") - p.southRightKneeHeight) < 0.0001,
    "South-room slope missing",
  );
  return {
    meshCount: meshes.length,
    stairTreads: stairs.length,
    tests: [
      "Finite nonempty meshes",
      "Unique room IDs",
      "Open stairwell",
      "Slab under rooms",
      "Open main doorway",
      "Stair count and top level",
      "High ceiling and three low points",
    ],
    rooms: spec.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      modelArea: polygonArea(room.polygon),
      sourceArea: room.sourceArea,
      delta: polygonArea(room.polygon) - room.sourceArea,
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = validateModel(readSpec());
  console.log(
    `Model checks passed: ${report.meshCount} meshes, ${report.stairTreads} stair treads.`,
  );
}
