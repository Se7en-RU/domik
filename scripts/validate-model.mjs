import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { buildHouse, polygonArea, upperHeightAt } from "../lib/model.mjs";
import { projectRoot } from "./paths.mjs";
import { stairLayout, garageLayout } from "../lib/layout.mjs";

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
  const stairs = meshes.filter(
    (mesh) => mesh.userData.flight === "lower" || mesh.userData.flight === "upper",
  );
  const stair = stairLayout(spec),
    garage = garageLayout(spec);
  const lower = stairs.filter((mesh) => mesh.userData.flight === "lower");
  const upper = stairs.filter((mesh) => mesh.userData.flight === "upper");
  assert.equal(
    lower.length,
    spec.staircase.lowerTreads,
    "Lower tread count differs from owner's count",
  );
  assert.equal(
    upper.length,
    spec.staircase.upperTreads,
    "Upper tread count differs from owner's count",
  );
  const landing = root.getObjectByName("STAIR-LANDING");
  assert(landing, "Missing flat turning landing");
  const topOf = (mesh) => new THREE.Box3().setFromObject(mesh).max.y;
  const centerOf = (mesh) => new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
  const surfaces = [...stairs, landing].sort(
    (a, b) => a.userData.riserIndex - b.userData.riserIndex,
  );
  surfaces.forEach((mesh, index) => {
    assert.equal(mesh.userData.riserIndex, index + 1, "Skipped rise in stair sequence");
    assert(
      Math.abs(topOf(mesh) - (index + 1) * stair.rise) < 1e-5,
      `${mesh.name}: wrong tread elevation`,
    );
  });
  assert(
    Math.abs(stair.upperLevel - topOf(upper.at(-1)) - stair.rise) < 1e-5,
    "Final rise does not meet upper floor",
  );
  assert(
    centerOf(lower[0]).x > centerOf(lower.at(-1)).x,
    "Lower flight must climb toward the window",
  );
  assert(
    centerOf(upper[0]).x < centerOf(upper.at(-1)).x,
    "Upper flight must climb back toward the hall",
  );
  ray.ray.direction.set(0, -1, 0);
  for (const z of [stair.lowerZ + stair.lowerWidth / 2, stair.upperZ + stair.upperWidth / 2]) {
    ray.ray.origin.set(stair.x + stair.landingDepth / 2, 20, z);
    const hit = ray.intersectObject(landing)[0];
    assert(
      hit && Math.abs(hit.point.y - stair.landingLevel) < 1e-5,
      "Turning landing must be flat across both flights",
    );
  }
  const walls = meshes.filter((mesh) => ["wall", "stair-wall"].includes(mesh.userData.kind));
  ray.ray.origin.set(
    stair.entryX - 0.03,
    stair.upperLevel + 0.5,
    stair.upperZ + stair.upperWidth / 2,
  );
  ray.ray.direction.set(1, 0, 0);
  ray.far = 0.25;
  assert.equal(ray.intersectObjects(walls).length, 0, "Upper stair exit blocked");
  ray.far = Infinity;
  for (const [value, expected, label] of [
    [garage.width, 6.85, "width"],
    [garage.shortLength, 6.82, "short length"],
    [garage.longLength, 7.87, "long length"],
  ])
    assert(Math.abs(value - expected) < 1e-6, `Garage ${label} differs from confirmed measurement`);
  assert.equal(garage.gateWidth, 5.2);
  assert.equal(garage.gateHeight, 2.7);
  const gateWall = meshes.filter((mesh) => mesh.userData.wallId === "GARAGE-W04");
  assert(gateWall.length > 0, "Garage gate wall is missing");
  ray.ray.direction.set(0, 0, -1);
  ray.far = 2;
  for (const x of [
    garage.gateCenter - garage.gateWidth / 2 + 0.03,
    garage.gateCenter,
    garage.gateCenter + garage.gateWidth / 2 - 0.03,
  ])
    for (const y of [garage.floorOffset + 0.1, garage.floorOffset + garage.gateHeight - 0.03]) {
      ray.ray.origin.set(x, y, garage.front + 1);
      assert.equal(
        ray.intersectObjects(gateWall).length,
        0,
        "Garage gate opening blocked or undersized",
      );
    }
  ray.ray.origin.set(
    garage.gateCenter,
    garage.floorOffset + garage.gateHeight + 0.05,
    garage.front + 1,
  );
  assert(ray.intersectObjects(gateWall).length > 0, "Garage gate lintel missing");
  ray.ray.origin.set(
    garage.gateCenter + garage.gateWidth / 2 + 0.05,
    garage.floorOffset + 1,
    garage.front + 1,
  );
  assert(ray.intersectObjects(gateWall).length > 0, "Garage gate jamb missing");
  ray.ray.origin.set(7.31, 0.8, 6.9);
  ray.ray.direction.set(0, 0, 1);
  assert.equal(ray.intersectObjects(walls).length, 0, "Boiler-to-garage passage blocked");
  ray.far = Infinity;
  ray.ray.direction.set(0, -1, 0);
  const garageFloor = root.getObjectByName(garage.roomId);
  for (const [x, z] of [
    [garage.gateCenter, 11],
    [garage.notchX + 0.5, garage.longBack + 0.5],
  ]) {
    ray.ray.origin.set(x, 20, z);
    const hit = ray.intersectObject(garageFloor)[0];
    assert(
      hit && Math.abs(hit.point.y - garage.floorOffset - 0.012) < 1e-5,
      "Garage floor or niche missing / at wrong level",
    );
  }
  ray.ray.origin.set(11, 20, 12);
  assert.equal(ray.intersectObject(slab).length, 0, "House upper slab extended over the garage");
  const garageCeiling = root.getObjectByName(`${garage.roomId}-CEILING-0`);
  assert(garageCeiling, "Garage ceiling missing");
  assert(
    Math.abs(
      new THREE.Box3().setFromObject(garageCeiling).min.y -
        garage.floorOffset -
        garage.ceilingHeight,
    ) < 1e-5,
    "Garage ceiling height incorrect",
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
    stairRisers: stair.totalRisers,
    garageArea: polygonArea(garage.room.polygon),
    tests: [
      "Finite nonempty meshes",
      "Unique room IDs",
      "Open stairwell",
      "Slab under rooms",
      "Open main doorway",
      "Confirmed stair tread counts, flat landing, reversed flights and equal rises",
      "Open upper stair exit",
      "Confirmed garage dimensions and gate aperture",
      "Connected boiler passage and recessed garage floor",
      "Garage ceiling height and no upper storey over garage",
      "High ceiling and three low points",
    ],
    rooms: spec.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      modelArea: polygonArea(room.polygon),
      sourceArea: room.sourceArea,
      delta: room.sourceArea == null ? null : polygonArea(room.polygon) - room.sourceArea,
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = validateModel(readSpec());
  console.log(
    `Model checks passed: ${report.meshCount} meshes, ${report.stairTreads} stair treads.`,
  );
}
