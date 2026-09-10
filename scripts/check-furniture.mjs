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
