import * as THREE from "three";
import { garageWalls, roomFloorOffset } from "./layout.mjs";

export const MODULE_PITCH = 0.071;
export function electricalMount(spec, item) {
  const wall = [...spec.walls, ...garageWalls(spec)].find((w) => w.id === item.wallId);
  if (!wall) throw new Error(`${item.id}: unknown wall ${item.wallId}`);
  const room = spec.rooms.find((r) => r.id === item.roomId);
  if (!room || room.floor !== wall.floor) throw new Error(`${item.id}: invalid room`);
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const ux = (wall.b[0] - wall.a[0]) / length;
  const uz = (wall.b[1] - wall.a[1]) / length;
  const normal = new THREE.Vector3(-uz * item.side, 0, ux * item.side);
  const vertical = item.orientation === "vertical";
  const long = item.modules.length * MODULE_PITCH + 0.015;
  return {
    wall,
    room,
    normal,
    length,
    width: vertical ? 0.086 : long,
    height: vertical ? long : 0.086,
    position: new THREE.Vector3(
      wall.a[0] + item.offset * ux + (normal.x * wall.t) / 2,
      roomFloorOffset(room, spec) + item.centerHeight,
      wall.a[1] + item.offset * uz + (normal.z * wall.t) / 2,
    ),
    rotation: Math.atan2(normal.x, normal.z),
  };
}

export function buildElectrical(spec, floors) {
  const materials = {
    frame: new THREE.MeshStandardMaterial({ color: 0xf7f3e9, roughness: 0.45 }),
    face: new THREE.MeshStandardMaterial({ color: 0xc9d9dc, roughness: 0.5 }),
    key: new THREE.MeshStandardMaterial({ color: 0x5c7280, roughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x182c36, roughness: 0.7 }),
  };
  for (const floor of [1, 2]) {
    const layer = new THREE.Group();
    layer.name = `Electrical_${floor}`;
    layer.userData = { kind: "electrical-layer", floor };
    floors[floor].add(layer);
    for (const item of spec.electrical?.items ?? []) {
      const mount = electricalMount(spec, item);
      if (mount.room.floor !== floor) continue;
      const group = new THREE.Group();
      group.name = item.id;
      group.position.copy(mount.position);
      group.rotation.y = mount.rotation;
      group.userData = { ...item, kind: "electrical", floor, electricalId: item.id };
      layer.add(group);
      let index = 0;
      const mesh = (geometry, x, y, z, material) => {
        const m = new THREE.Mesh(geometry, materials[material]);
        m.position.set(x, y, z);
        m.name = `${item.id}-${++index}`;
        m.userData = {
          kind: "electrical",
          floor,
          id: m.name,
          electricalId: item.id,
          roomId: item.roomId,
          wallId: item.wallId,
          sourcePages: item.sourcePages,
        };
        m.castShadow = m.receiveShadow = true;
        group.add(m);
        return m;
      };
      const box = (x, y, z, w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), x, y, z, mat);
      // All visible parts are 1–18 mm in front of the actual wall face.
      box(0, 0, 0.005, mount.width, mount.height, 0.008, "frame");
      item.modules.forEach((type, i) => {
        const at = (i - (item.modules.length - 1) / 2) * MODULE_PITCH;
        const x = item.orientation === "vertical" ? 0 : at;
        const y = item.orientation === "vertical" ? -at : 0;
        box(x, y, 0.011, 0.06, 0.06, 0.006, "face");
        if (type.startsWith("switch")) {
          const keys = type === "switch-2" ? 2 : type === "switch-3" ? 3 : 1;
          for (let k = 0; k < keys; k++)
            box(
              x - 0.026 + ((k + 0.5) * 0.052) / keys,
              y,
              0.015,
              0.052 / keys - 0.002,
              0.052,
              0.006,
              "key",
            );
          if (type === "switch-pass") box(x, y - 0.015, 0.0185, 0.018, 0.002, 0.001, "frame");
        } else if (["power", "power-ip44"].includes(type)) {
          const ring = mesh(
            new THREE.CylinderGeometry(0.023, 0.023, 0.002, 24),
            x,
            y,
            0.015,
            "frame",
          );
          ring.rotation.x = Math.PI / 2;
          for (const dx of [-0.009, 0.009]) {
            const hole = mesh(
              new THREE.CylinderGeometry(0.003, 0.003, 0.001, 12),
              x + dx,
              y,
              0.0165,
              "dark",
            );
            hole.rotation.x = Math.PI / 2;
          }
          if (type === "power-ip44") box(x, y + 0.026, 0.016, 0.05, 0.004, 0.004, "key");
        } else {
          box(x, y, 0.015, type === "usb" ? 0.018 : 0.028, 0.012, 0.002, "dark");
          if (type === "media") box(x, y + 0.019, 0.015, 0.025, 0.002, 0.002, "key");
        }
      });
    }
  }
}
