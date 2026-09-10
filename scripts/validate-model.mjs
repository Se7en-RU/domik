import fs from "node:fs";
import { checkElectrical } from "./check-electrical.mjs";
import { checkFurniture } from "./check-furniture.mjs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { buildHouse, polygonArea, upperHeightAt } from "../lib/model.mjs";
import { projectRoot } from "./paths.mjs";
import { stairLayout, garageLayout } from "../lib/layout.mjs";
import { checkLayout } from "./roomplan/check-layout.mjs";
import { validateAnchors } from "./roomplan/anchors.mjs";

export function readSpec() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "lib/house.json"), "utf8"));
}

export function validateModel(spec, root = buildHouse(spec).root) {
  if (spec.sources.some((s) => s.id === "manual-controls")) {
    const controls = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "measurements/manual/control.json"), "utf8"),
    );
    validateAnchors(spec, controls);
  }
  if (spec.envelope) checkLayout(spec);
  checkFurniture(spec, root);
  checkElectrical(spec, root);
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  assert(meshes.length > 0, "Model is empty");
  if (spec.openingHeightGroups) {
    const openings = new Map(
      spec.walls.flatMap((wall) => (wall.openings ?? []).map((opening) => [opening.id, opening])),
    );
    for (const group of spec.openingHeightGroups) {
      for (const openingId of group.openingIds) {
        const opening = openings.get(openingId);
        assert(opening, `Opening height group references missing opening ${openingId}`);
        assert.equal(opening.kind, group.kind, `${openingId}: wrong opening kind in height group`);
        assert(
          Math.abs(opening.height - group.height) < 1e-6,
          `${openingId}: height differs from ${group.id}`,
        );
      }
    }
  }
  if (spec.openingTypeGroups) {
    const openings = new Map(
      spec.walls.flatMap((wall) => (wall.openings ?? []).map((opening) => [opening.id, opening])),
    );
    for (const group of spec.openingTypeGroups) {
      for (const openingId of group.openingIds) {
        const opening = openings.get(openingId);
        assert(opening, `Opening type group references missing opening ${openingId}`);
        assert.equal(opening.kind, group.kind, `${openingId}: wrong opening kind in type group`);
        assert.equal(opening.width, group.width, `${openingId}: width differs from ${group.id}`);
        assert.equal(opening.height, group.height, `${openingId}: height differs from ${group.id}`);
      }
    }
  }
  const f1W14 = spec.walls.find((wall) => wall.id === "F1-W14");
  const f1W16 = spec.walls.find((wall) => wall.id === "F1-W16");
  const f1W17 = spec.walls.find((wall) => wall.id === "F1-W17");
  if (f1W14 && f1W16 && f1W17) {
    assert.equal(f1W14.t, f1W16.t, "F1-W14/F1-W16 thickness mismatch");
    assert.equal(f1W16.t, f1W17.t, "F1-W16/F1-W17 thickness mismatch");
    assert.equal(f1W14.b[1], f1W16.a[1], "F1-W14/F1-W16 corner height mismatch");
    assert.equal(f1W16.a[1], f1W17.a[1], "F1-W16/F1-W17 corner height mismatch");
    const halfThickness = f1W16.t / 2;
    assert(
      Math.abs(f1W16.a[0] - (f1W17.a[0] - halfThickness)) < 1e-6,
      "F1-W16 does not overlap the F1-W17 corner",
    );
    assert(
      Math.abs(f1W16.b[0] - (f1W14.b[0] + halfThickness)) < 1e-6,
      "F1-W16 does not overlap the F1-W14 corner",
    );
  }
  const f2W06 = spec.walls.find((wall) => wall.id === "F2-W06");
  const f2W13 = spec.walls.find((wall) => wall.id === "F2-W13");
  const f2W15 = spec.walls.find((wall) => wall.id === "F2-W15");
  const f2W16 = spec.walls.find((wall) => wall.id === "F2-W16");
  if (f2W06 && f2W15) {
    assert(
      Math.abs(f2W06.a[0] - (f2W15.a[0] + f2W15.t / 2)) < 1e-6,
      "F2-W06 does not start at the F2-W15 face",
    );
    assert(
      Math.abs(f2W15.b[1] - (f2W06.a[1] + f2W06.t / 2)) < 1e-6,
      "F2-W15 does not reach the far face of F2-W06",
    );
    assert(
      f2W06.a[1] - f2W06.t / 2 <= f2W15.b[1] + 1e-6 &&
        f2W06.a[1] + f2W06.t / 2 >= f2W15.b[1] - 1e-6,
      "F2-W06/F2-W15 corner does not overlap",
    );
  }
  const cornerRoom = spec.rooms.find((room) => room.id === "F2-ROOM");
  for (const point of cornerRoom.polygon.slice(2, 4)) {
    assert(
      Math.abs(point[1] - f2W15.b[1]) < 1e-6,
      "Room floor/ceiling corner differs from wall junction",
    );
  }
  if (f2W13 && f2W15 && f2W16) {
    assert(
      Math.abs(f2W13.b[1] - (f2W16.a[1] - f2W16.t / 2)) < 1e-6,
      "F2-W13 does not reach the lower face of F2-W16",
    );
    assert(
      Math.abs(f2W13.b[0] - f2W13.t / 2 - f2W16.b[0]) < 1e-6,
      "F2-W16 does not reach the F2-W13 face",
    );
  }
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
  const divider = root.getObjectByName("F1-W13-DIVIDER");
  assert(divider, "Missing solid stair divider");
  const dividerBounds = new THREE.Box3().setFromObject(divider);
  assert(
    Math.abs(dividerBounds.max.z - dividerBounds.min.z - spec.staircase.dividerThickness) < 1e-5,
    "Generated divider thickness differs from manual control",
  );
  assert(
    !root.getObjectByName("F2-STAIR-PARAPET"),
    "Uninstalled second-floor railing must be absent",
  );
  assert(dividerBounds.max.y < stair.upperLevel, "Divider must stay below the second floor");
  ray.far = Infinity;
  ray.ray.direction.set(0, -1, 0);
  for (const fraction of [0.1, 0.5, 0.9]) {
    const x = stair.turnX + fraction * (stair.entryX - stair.turnX);
    ray.ray.origin.set(x, stair.upperLevel + 1, (dividerBounds.min.z + dividerBounds.max.z) / 2);
    const hit = ray.intersectObject(divider)[0];
    const underside =
      stair.landingLevel + fraction * stair.upperTreads * stair.rise - stair.waistThickness;
    assert(
      hit && Math.abs(hit.point.y - underside) < 1e-5,
      "Divider must end flush with upper flight underside",
    );
  }
  // A thicker divider must not block the store doorway or the lower flight.
  ray.ray.origin.set(3.8, 1, 6.15);
  ray.ray.direction.set(-1, 0, 0);
  ray.far = 0.5;
  assert.equal(ray.intersectObjects(walls).length, 0, "Store doorway blocked");
  ray.far = Infinity;
  const garageReview = spec.sources.some((source) => source.id === "garage-review")
    ? JSON.parse(
        fs.readFileSync(path.join(projectRoot, "measurements/manual/garage-review.json"), "utf8"),
      )
    : null;
  const acceptedGarageValue = (field, fallback) =>
    garageReview?.decisions.findLast(
      (decision) => decision.field === field && decision.status === "APPLIED",
    )?.accepted ?? fallback;
  if (spec.sources.some((source) => source.id === "garage-review")) {
    assert(
      garageReview.decisions.some((d) => d.field === "width" && d.status === "APPLIED"),
      "Garage width review is missing",
    );
  }
  for (const [value, expected, label] of [
    [garage.width, acceptedGarageValue("width", 6.85), "width"],
    [garage.shortLength, acceptedGarageValue("shortLength", 6.82), "short length"],
    [garage.longLength, acceptedGarageValue("longLength", 7.87), "long length"],
  ])
    assert(Math.abs(value - expected) < 1e-6, `Garage ${label} differs from confirmed measurement`);
  assert.equal(garage.gateWidth, acceptedGarageValue("gateWidth", 5.2));
  assert.equal(garage.gateHeight, 2.7);
  if (garageReview?.geometry) {
    assert.deepEqual(
      garage.room.polygon,
      garageReview.geometry.polygon.map(([x, z]) => [
        Math.round((x + (spec.garage.fitTranslation?.x ?? 0)) * 1e6) / 1e6,
        Math.round((z + (spec.garage.fitTranslation?.z ?? 0)) * 1e6) / 1e6,
      ]),
      "Garage scan contour drift",
    );
    const projection = root.getObjectByName("GARAGE-W05-0");
    assert(projection, "Missing confirmed wall projection");
    if (garage.wallProjection?.joinDepth) {
      assert(root.getObjectByName("GARAGE-W05-JOIN"), "Missing wall projection join");
    }
    const bounds = new THREE.Box3().setFromObject(projection);
    assert(
      Math.abs(bounds.max.x - bounds.min.x - garageReview.geometry.projection.width) < 1e-5,
      "Wall projection width drift",
    );
    assert(
      Math.abs(bounds.max.z - bounds.min.z - garageReview.geometry.projection.depth) < 1e-5,
      "Wall projection depth drift",
    );
    if (garage.wallProjection?.rightEdgeX !== undefined) {
      assert(
        Math.abs(bounds.max.x - garage.wallProjection.rightEdgeX) < 1e-5,
        "Wall projection right edge drift",
      );
    }
    assert.equal(
      garage.gateOffsetFromLeft,
      garageReview.geometry.gate.offsetFromLeft,
      "Gate left pier drift",
    );
  }
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
    Math.abs(upperHeightAt(p.upperMainWidth ?? 8.82, 2, p) - p.rightKneeHeight) < 0.0001,
    "Right ceiling slope missing",
  );
  assert(
    Math.abs(upperHeightAt(p.upperSouthWidth ?? 5.19, 9, p, "south") - p.southRightKneeHeight) <
      0.0001,
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
      "Manual wall controls, coupled room faces, divider thickness and open store doorway",
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
