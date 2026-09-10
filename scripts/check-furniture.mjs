import assert from "node:assert/strict";
import * as THREE from "three";
import { pointInPolygon } from "../lib/dimensions.mjs";
import { upperHeightAt } from "../lib/model.mjs";

export function checkFurniture(spec, root) {
  const ids = new Set();
  const acUnits = (spec.furniture?.items ?? []).filter((i) => i.kind === "air-conditioner");
  if (spec.furniture?.airConditioningSource)
    assert.equal(
      acUnits.length,
      spec.furniture.airConditioningSource.count,
      "Air conditioner count differs from source",
    );
  for (const unit of acUnits) {
    const object = root.getObjectByName(unit.id);
    const bounds = new THREE.Box3().setFromObject(object);
    assert(object.userData.resolvedElevation >= 0, `${unit.id}: below floor`);
    if (unit.openingId) {
      const wall = spec.walls.find((w) => w.openings?.some((o) => o.id === unit.openingId));
      const opening = wall.openings.find((o) => o.id === unit.openingId);
      const direction = new THREE.Vector2(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]).normalize();
      const along = new THREE.Vector2(
        object.position.x - wall.a[0],
        object.position.z - wall.a[1],
      ).dot(direction);
      assert(
        Math.abs(along - opening.start - opening.width / 2) < 1e-6,
        `${unit.id}: off opening center`,
      );
      assert(
        object.userData.resolvedElevation >= opening.sill + opening.height,
        `${unit.id}: obstructs opening`,
      );
    }
    for (const other of spec.furniture.items.filter(
      (i) => i.id !== unit.id && i.roomId === unit.roomId,
    )) {
      root.getObjectByName(other.id).traverse((mesh) => {
        if (mesh.isMesh)
          assert(
            !bounds.intersectsBox(new THREE.Box3().setFromObject(mesh)),
            `${unit.id}: overlaps ${other.id}`,
          );
      });
    }
  }
  for (const prefix of ["F1-FUR", "F2-FUR-GUEST"]) {
    const chair = root.getObjectByName(`${prefix}-ARMCHAIR`);
    const lamp = root.getObjectByName(`${prefix}-LAMP`);
    assert(
      !new THREE.Box3().setFromObject(chair).intersectsBox(new THREE.Box3().setFromObject(lamp)),
      `${prefix}: armchair overlaps lamp`,
    );
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(chair.quaternion);
    assert(facing.x > 0 && facing.z < 0, `${prefix}: armchair must face into room`);
  }
  const dressStorage = spec.furniture.items.filter(
    (i) => i.roomId === "F2-DRESS" && i.kind === "wardrobe",
  );
  for (let i = 0; i < dressStorage.length; i++) {
    for (let j = i + 1; j < dressStorage.length; j++) {
      const a = new THREE.Box3().setFromObject(root.getObjectByName(dressStorage[i].id));
      const b = new THREE.Box3().setFromObject(root.getObjectByName(dressStorage[j].id));
      assert(!a.intersectsBox(b), "Dressing room wardrobes overlap");
    }
  }
  const radiators = (spec.furniture?.items ?? []).filter((i) => i.kind.startsWith("radiator-"));
  if (spec.furniture?.heatingSource) {
    assert.equal(
      radiators.length,
      spec.furniture.heatingSource.count,
      "Heating equipment count differs from source",
    );
    for (const radiator of radiators) {
      const bounds = new THREE.Box3().setFromObject(root.getObjectByName(radiator.id));
      for (const other of spec.furniture.items.filter(
        (i) => !i.kind.startsWith("radiator-") && i.roomId === radiator.roomId,
      )) {
        root.getObjectByName(other.id).traverse((mesh) => {
          if (mesh.isMesh)
            assert(
              !bounds.intersectsBox(new THREE.Box3().setFromObject(mesh)),
              `${radiator.id}: overlaps ${other.id}`,
            );
        });
      }
    }
  }
  const garageRadiators = (spec.furniture?.items ?? []).filter(
    (item) => item.roomId === "F1-GARAGE" && item.kind.startsWith("radiator-"),
  );
  assert.equal(garageRadiators.length, 2, "Garage must have two panel radiators");
  assert.equal(
    garageRadiators[0].position[0],
    garageRadiators[1].position[0],
    "Garage radiators must share a wall",
  );
  assert.equal(
    garageRadiators[0].elevation,
    garageRadiators[1].elevation,
    "Garage radiators must share a level",
  );
  assert.equal(
    garageRadiators[0].size[1],
    garageRadiators[1].size[1],
    "Garage radiators must share a size",
  );
  assert.deepEqual(
    garageRadiators[0].size,
    garageRadiators[1].size,
    "Garage radiators must have identical dimensions",
  );
  assert.equal(
    garageRadiators[0].kind,
    "radiator-sectional",
    "Garage radiators must use the office sectional type",
  );
  assert.equal(
    garageRadiators[1].kind,
    garageRadiators[0].kind,
    "Garage radiators must use the same type",
  );
  assert.equal(
    garageRadiators[0].model,
    "RIFAR BASE 500/14",
    "Garage radiators must match the office model",
  );
  assert.equal(
    garageRadiators[1].model,
    garageRadiators[0].model,
    "Garage radiators must use the same model",
  );
  assert.equal(
    garageRadiators[0].rotation,
    garageRadiators[1].rotation,
    "Garage radiators must share an orientation",
  );
  const garageRoom = spec.rooms.find((room) => room.id === "F1-GARAGE");
  const leftWall = garageRoom.polygon.filter(
    (point) => point[0] === Math.min(...garageRoom.polygon.map((vertex) => vertex[0])),
  );
  const wallCenter =
    (Math.min(...leftWall.map((point) => point[1])) +
      Math.max(...leftWall.map((point) => point[1]))) /
    2;
  assert(
    Math.abs((garageRadiators[0].position[1] + garageRadiators[1].position[1]) / 2 - wallCenter) <
      0.01,
    "Garage radiators must be centered on the wall",
  );
  assert.equal(
    (spec.furniture?.items ?? []).filter((item) => item.kind === "tool-rack").length,
    1,
    "Garage tool rack is missing",
  );
  const toolRack = spec.furniture.items.find((item) => item.kind === "tool-rack");
  const nicheWallX = Math.max(
    ...spec.garage.wallProjection.vertices.map((index) => garageRoom.polygon[index][0]),
  );
  assert(
    toolRack.position[0] - toolRack.size[0] / 2 > nicheWallX,
    "Garage tool rack must stay beyond the protruding wall",
  );
  const garageBackWallZ = Math.min(...garageRoom.polygon.map((point) => point[1]));
  assert(
    Math.abs(toolRack.position[1] - toolRack.size[2] / 2 - garageBackWallZ) < 0.01,
    "Garage tool rack must sit against the wall",
  );
  const hallRoom = spec.rooms.find((room) => room.id === "F1-HALL");
  const hallFurniture = (spec.furniture?.items ?? []).filter(
    (item) =>
      item.roomId === "F1-HALL" &&
      !item.kind.startsWith("radiator-") &&
      item.kind !== "air-conditioner",
  );
  assert.equal(hallFurniture.length, 1, "Hall must contain only the entry wardrobe");
  const hallWardrobe = hallFurniture[0];
  assert.equal(hallWardrobe.id, "F1-FUR-HALL-ENTRY-WARDROBE", "Hall wardrobe is missing");
  assert.equal(hallWardrobe.kind, "wardrobe", "Hall niche must contain a wardrobe");
  assert.equal(hallWardrobe.rotation ?? 0, 0, "Hall wardrobe must align with the niche");
  const nicheXMin = hallRoom.polygon[3][0];
  const nicheXMax = hallRoom.polygon[0][0];
  const nicheZMin = hallRoom.polygon[5][1];
  const nicheZMax = hallRoom.polygon[3][1];
  assert(
    hallWardrobe.position[0] - hallWardrobe.size[0] / 2 > nicheXMin &&
      hallWardrobe.position[0] + hallWardrobe.size[0] / 2 < nicheXMax &&
      hallWardrobe.position[1] - hallWardrobe.size[2] / 2 > nicheZMin &&
      hallWardrobe.position[1] + hallWardrobe.size[2] / 2 < nicheZMax,
    "Hall wardrobe must stay inside the left entry niche",
  );
  assert(
    hallWardrobe.size[0] >= nicheXMax - nicheXMin - 0.025 &&
      hallWardrobe.size[2] >= nicheZMax - nicheZMin - 0.07,
    "Hall wardrobe must fill the niche width and depth",
  );
  const officeRoom = spec.rooms.find((room) => room.id === "F1-OFFICE");
  const officeWardrobe = spec.furniture.items.find((item) => item.id === "F1-FUR-OFFICE-WARDROBE");
  const officeDesk = spec.furniture.items.find((item) => item.id === "F1-FUR-OFFICE-DESK");
  assert(
    !spec.furniture.items.some((item) => item.id === "F1-FUR-OFFICE-CABINET"),
    "Office passage cabinet must be removed",
  );
  assert.equal(officeWardrobe.kind, "wardrobe", "Office far-wall storage must remain a wardrobe");
  const officeWallZMin = Math.min(...officeRoom.polygon.map((point) => point[1]));
  const officeWallZMax = Math.max(...officeRoom.polygon.map((point) => point[1]));
  assert(
    officeWardrobe.rotation === -90 &&
      Math.abs(officeWardrobe.position[1] - (officeWallZMin + officeWallZMax) / 2) < 0.01 &&
      officeWardrobe.size[0] >= officeWallZMax - officeWallZMin - 0.1,
    "Office far-wall wardrobe must span the wall",
  );
  assert.equal(officeDesk.kind, "window-desk", "Office desk must be integrated with the sill");
  const officeWindowWall = spec.walls.find((wall) => wall.id === "F1-W04");
  const officeWindow = officeWindowWall.openings.find((opening) => opening.id === "F1-WIN06");
  const officeWindowCenter = officeWindowWall.a[0] + officeWindow.start + officeWindow.width / 2;
  assert(
    Math.abs(officeDesk.position[0] - officeWindowCenter) < 0.01 &&
      officeDesk.size[1] >= officeWindow.sill,
    "Office desk must align with the window sill",
  );
  const officeAc = spec.furniture.items.find((item) => item.id === "F1-AC02");
  const passageWall = spec.walls.find((wall) => wall.id === "F1-W14");
  const passage = passageWall.openings.find((opening) => opening.id === "F1-D04");
  const passageCenter = passageWall.a[1] + passage.start + passage.width / 2;
  assert(
    Math.abs(officeAc.position[1] - passageCenter) < 0.01,
    "Office air conditioner must be centered over the passage",
  );
  const bathRoom = spec.rooms.find((room) => room.id === "F2-BATH");
  const bathItems = spec.furniture.items.filter((item) => item.roomId === "F2-BATH");
  assert(
    !bathItems.some((item) => item.kind.startsWith("radiator-")),
    "Second-floor bathroom radiator must be removed",
  );
  const bathTub = bathItems.find((item) => item.id === "F2-FUR-BATH-TUB");
  const bathVanity = bathItems.find((item) => item.id === "F2-FUR-BATH-VANITY");
  const bathTowelWarmer = bathItems.find((item) => item.id === "F2-FUR-BATH-TOWEL-WARMER");
  const bathToilet = bathItems.find((item) => item.id === "F2-FUR-BATH-WC");
  const bathWindowWall = spec.walls.find((wall) => wall.id === "F2-W06");
  const bathWindow = bathWindowWall.openings.find((opening) => opening.id === "F2-WIN07");
  const bathWindowWallCenter = bathWindowWall.a[0] + bathWindow.start + bathWindow.width / 2;
  const bathRoomXMin = Math.min(...bathRoom.polygon.map((point) => point[0]));
  const bathRoomXMax = Math.max(...bathRoom.polygon.map((point) => point[0]));
  const bathRoomZMax = Math.max(...bathRoom.polygon.map((point) => point[1]));
  const bathDoorWallZ = Math.min(...bathRoom.polygon.map((point) => point[1]));
  const bathTubDoorEdgeZ = bathTub.position[1] - bathTub.size[0] / 2;
  const bathFixtureCenterZ = (bathDoorWallZ + bathTubDoorEdgeZ) / 2;
  assert.equal(bathTub.rotation, 90, "Bathroom bath must run along the window wall");
  assert(
    Math.abs(bathTub.position[0] - bathTub.size[2] / 2 - bathRoomXMin) < 0.01 &&
      bathTub.position[1] + bathTub.size[0] / 2 < bathRoomZMax &&
      bathTub.position[1] + bathTub.size[0] / 2 > bathRoomZMax - 0.02,
    "Bathroom bath must sit at the window edge of the wall",
  );
  assert.equal(bathVanity.rotation, 90, "Bathroom vanity must align with the former radiator wall");
  assert(
    bathVanity.position[1] > bathFixtureCenterZ &&
      bathVanity.position[1] < bathTubDoorEdgeZ &&
      Math.abs(bathVanity.position[0] + bathVanity.size[2] / 2 - bathRoomXMax) < 0.01 &&
      bathVanity.position[1] - bathVanity.size[0] / 2 >
        bathTowelWarmer.position[1] + bathTowelWarmer.size[0] / 2 + 0.01,
    "Bathroom vanity must be right of the towel warmer, flush with the wall, and clear of the bath",
  );
  assert.equal(bathTowelWarmer.kind, "towel-warmer", "Bathroom towel warmer is missing");
  assert(
    bathTowelWarmer.rotation === 90 &&
      bathTowelWarmer.position[1] < bathVanity.position[1] &&
      Math.abs(bathTowelWarmer.position[0] + bathTowelWarmer.size[2] / 2 - bathRoomXMax) < 0.01,
    "Bathroom towel warmer must be left of the vanity on the same wall",
  );
  const bathDoorWall = spec.walls.find((wall) => wall.id === "F2-W07");
  const bathDoor = bathDoorWall.openings.find((opening) => opening.id === "F2-D01");
  const bathDoorCenter = bathDoorWall.a[0] + bathDoor.start + bathDoor.width / 2;
  assert.equal(bathToilet.rotation, 0, "Bathroom toilet must face the window");
  assert(
    bathToilet.position[0] < bathDoorCenter &&
      Math.abs(
        bathToilet.position[1] -
          bathToilet.size[2] * 0.48 -
          Math.min(...bathRoom.polygon.map((point) => point[1])),
      ) < 0.01,
    "Bathroom toilet must stay left of the entrance and close to the wall",
  );
  for (const item of spec.furniture?.items ?? []) {
    assert(!ids.has(item.id), `Duplicate furniture ${item.id}`);
    ids.add(item.id);
    const room = spec.rooms.find((r) => r.id === item.roomId);
    assert(room && !room.isVoid, `${item.id}: invalid room`);
    assert(
      item.size.every((n) => Number.isFinite(n) && n > 0),
      `${item.id}: invalid size`,
    );
    assert(
      Number.isFinite(item.elevation ?? 0) && (item.elevation ?? 0) >= 0,
      `${item.id}: invalid elevation`,
    );
    const object = root.getObjectByName(item.id);
    assert(object, `${item.id}: missing model`);
    const expectedKind =
      item.kind.startsWith("radiator-") ||
      item.kind === "air-conditioner" ||
      item.kind === "towel-warmer"
        ? "equipment"
        : "furniture";
    assert.equal(object.userData.kind, expectedKind, `${item.id}: wrong display layer`);
    object.updateWorldMatrix(true, true);
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const v = new THREE.Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(mesh.matrixWorld);
        assert(
          pointInPolygon([v.x, v.z], room.polygon),
          `${item.id}: outside room at ${v.x.toFixed(3)},${v.z.toFixed(3)}`,
        );
        if (item.ceilingClearance !== undefined) {
          const level =
            room.floor === 2 ? spec.parameters.groundHeight + spec.parameters.slabThickness : 0;
          const ceiling =
            room.floor === 2
              ? upperHeightAt(v.x, v.z, spec.parameters, room.id === "F2-ROOM" ? "south" : "auto")
              : spec.parameters.groundHeight;
          assert(
            v.y <= level + ceiling - item.ceilingClearance + 0.001,
            `${item.id}: insufficient ceiling clearance`,
          );
        }
        if (room.floor === 2)
          assert(
            v.y <=
              spec.parameters.groundHeight +
                spec.parameters.slabThickness +
                upperHeightAt(v.x, v.z, spec.parameters, room.id === "F2-ROOM" ? "south" : "auto") +
                0.001,
            `${item.id}: intersects ceiling`,
          );
      }
    });
  }
}
