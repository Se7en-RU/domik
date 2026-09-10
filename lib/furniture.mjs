import * as THREE from "three";
import { roomFloorOffset, roomHeight } from "./layout.mjs";

// Furniture is editable in house.json; local -Z is the back/headboard side.
export function buildFurniture(spec, floors, upperHeightAt) {
  const palette = {
    wood: 0xb68c61,
    fabric: 0x80978d,
    cushion: 0xd8d5c9,
    white: 0xf2eee4,
    dark: 0x35424b,
    metal: 0x626968,
    water: 0xabc6cb,
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({ color, roughness: key === "white" ? 0.35 : 0.85 }),
    ]),
  );
  for (const floor of [1, 2]) {
    const furnitureLayer = new THREE.Group();
    furnitureLayer.name = `Furniture_${floor}`;
    furnitureLayer.userData = { kind: "furniture-layer", floor };
    const equipmentLayer = new THREE.Group();
    equipmentLayer.name = `Equipment_${floor}`;
    equipmentLayer.userData = { kind: "equipment-layer", floor };
    floors[floor].add(furnitureLayer, equipmentLayer);
    for (const item of spec.furniture?.items ?? []) {
      const room = spec.rooms.find((r) => r.id === item.roomId);
      if (room?.floor !== floor) continue;
      const isEquipment =
        item.kind.startsWith("radiator-") ||
        item.kind === "air-conditioner" ||
        item.kind === "towel-warmer";
      const layerKind = isEquipment ? "equipment" : "furniture";
      let elevation = item.elevation ?? 0;
      if (item.ceilingClearance !== undefined) {
        const [w, h, d] = item.size;
        const angle = THREE.MathUtils.degToRad(item.rotation ?? 0);
        const heights = [-w / 2, w / 2].flatMap((x) =>
          [-d / 2, d / 2].map((z) => {
            const px = item.position[0] + Math.cos(angle) * x - Math.sin(angle) * z;
            const pz = item.position[1] + Math.sin(angle) * x + Math.cos(angle) * z;
            return room.floor === 2
              ? upperHeightAt(px, pz, spec.parameters, room.id === "F2-ROOM" ? "south" : "auto")
              : roomHeight(room, spec);
          }),
        );
        elevation = Math.min(...heights) - item.ceilingClearance - h;
      }
      const group = new THREE.Group();
      group.name = item.id;
      group.position.set(
        item.position[0],
        roomFloorOffset(room, spec) + elevation,
        item.position[1],
      );
      group.rotation.y = -THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.userData = {
        ...item,
        resolvedElevation: elevation,
        kind: layerKind,
        floor,
        furnitureId: item.id,
      };
      (isEquipment ? equipmentLayer : furnitureLayer).add(group);
      const [w, h, d] = item.size;
      let n = 0;
      const shape = (geo, x, y, z, material) => {
        const mesh = new THREE.Mesh(geo, materials[material]);
        mesh.position.set(x, y, z);
        mesh.name = `${item.id}-${++n}`;
        mesh.userData = {
          id: mesh.name,
          kind: layerKind,
          floor,
          roomId: room.id,
          furnitureId: item.id,
          sourcePage: item.sourcePage,
          source: item.source ?? spec.furniture.source,
        };
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      const box = (x, y, z, a, b, c, mat = "wood") =>
        shape(new THREE.BoxGeometry(a, b, c), x, y, z, mat);
      const cylinder = (x, y, z, r, height, mat = "metal") =>
        shape(new THREE.CylinderGeometry(r, r, height, 24), x, y, z, mat);
      const legs = (top, inset = 0.07) => {
        for (const x of [-w / 2 + inset, w / 2 - inset])
          for (const z of [-d / 2 + inset, d / 2 - inset])
            box(x, top / 2, z, 0.045, top, 0.045, "metal");
      };
      switch (item.kind) {
        case "tool-rack": {
          box(0, h / 2, -d / 2 + 0.025, w, h, 0.05, "wood");
          for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) box(x, h / 2, 0, 0.05, h, d, "wood");
          for (let y = 0.18; y < h; y += 0.42) box(0, y, 0, w - 0.1, 0.04, d - 0.04, "wood");
          for (let x = -w / 2 + 0.32; x < w / 2; x += 0.64)
            box(x, h * 0.55, 0.02, 0.025, h * 0.9, 0.025, "metal");
          break;
        }
        case "air-conditioner":
          box(0, h / 2, 0, w, h, d, "white");
          box(0, h * 0.2, d / 2 + 0.002, w * 0.88, h * 0.14, 0.004, "dark");
          for (let i = 0; i < 3; i++)
            box(0, h * (0.145 + i * 0.045), d / 2 + 0.005, w * 0.86, 0.007, 0.008, "white");
          box(w * 0.37, h * 0.45, d / 2 + 0.003, 0.026, 0.012, 0.006, "water");
          break;
        case "radiator-tubular": {
          const pitch = w / item.sections;
          for (let i = 0; i < item.sections; i++) {
            const x = -w / 2 + pitch * (i + 0.5);
            for (const z of [-d * 0.3, 0, d * 0.3])
              cylinder(x, h / 2, z, Math.min(0.012, pitch * 0.28), h, "white");
          }
          for (const y of [0.025, h - 0.025]) box(0, y, 0, w, 0.035, d * 0.84, "white");
          break;
        }
        case "radiator-sectional": {
          const pitch = w / item.sections;
          for (let i = 0; i < item.sections; i++) {
            const x = -w / 2 + pitch * (i + 0.5);
            box(x, h / 2, 0, pitch - 0.008, h, d, "white");
            box(x, h / 2, d / 2 + 0.002, pitch * 0.5, h - 0.06, 0.008, "white");
          }
          break;
        }
        case "towel-warmer":
          for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) cylinder(x, h / 2, 0, 0.018, h, "metal");
          for (let y = 0.16; y < h - 0.08; y += 0.18) box(0, y, 0, w - 0.08, 0.028, 0.028, "metal");
          break;
        case "radiator-panel":
          box(0, h / 2, 0, w, h, d, "white");
          for (let x = -w / 2 + 0.02; x < w / 2; x += 0.025)
            box(x, h / 2, d / 2 + 0.002, 0.009, h - 0.025, 0.006, "white");
          break;

        case "bed":
          box(0, 0.18, 0, w, 0.28, d);
          box(0, 0.4, 0.03, w - 0.08, 0.22, d - 0.12, "white");
          box(0, h / 2, -d / 2 + 0.06, w, h, 0.12, "fabric");
          box(0, 0.53, d * 0.14, w - 0.1, 0.06, d * 0.62, "fabric");
          for (const x of [-w * 0.24, w * 0.24])
            box(x, 0.56, -d * 0.31, w * 0.4, 0.12, 0.42, "cushion");
          break;
        case "sofa": {
          box(0, 0.23, 0, w, 0.3, d, "fabric");
          box(0, h / 2, -d / 2 + 0.09, w, h, 0.18, "fabric");
          for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) box(x, 0.36, 0, 0.14, 0.65, d, "fabric");
          const seats = Math.max(1, Math.round(w / 0.72));
          for (let i = 0; i < seats; i++) {
            const a = (w - 0.3) / seats;
            box(-w / 2 + 0.15 + a * (i + 0.5), 0.46, 0.08, a - 0.025, 0.16, d - 0.25, "cushion");
            box(
              -w / 2 + 0.15 + a * (i + 0.5),
              0.67,
              -d / 2 + 0.22,
              a - 0.025,
              0.27,
              0.16,
              "fabric",
            );
          }
          break;
        }
        case "crib":
          box(0, 0.32, 0, w, 0.1, d);
          box(0, 0.42, 0, w - 0.08, 0.12, d - 0.08, "white");
          for (const z of [-d / 2 + 0.025, d / 2 - 0.025]) {
            box(0, h - 0.03, z, w, 0.06, 0.05, "white");
            for (let x = -w / 2 + 0.025; x <= w / 2; x += 0.1)
              box(x, h / 2, z, 0.025, h, 0.025, "white");
          }
          for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) box(x, h / 2, 0, 0.06, h, d, "white");
          break;
        case "window-desk":
          box(0, h - 0.035, 0, w, 0.07, d, "wood");
          for (const x of [-w / 2 + 0.055, w / 2 - 0.055])
            box(x, (h - 0.07) / 2, 0, 0.09, h - 0.07, d * 0.86, "wood");
          break;
        case "desk":
        case "table":
          box(0, h - 0.035, 0, w, 0.07, d);
          legs(h - 0.07);
          if (item.kind === "desk") {
            box(0, h + 0.19, -d * 0.25, 0.5, 0.32, 0.035, "dark");
            box(0, h + 0.015, 0.04, 0.43, 0.025, 0.15, "dark");
          }
          break;
        case "roundTable":
          cylinder(0, h - 0.03, 0, w / 2, 0.06, "wood");
          cylinder(0, h / 2, 0, 0.035, h);
          cylinder(0, 0.025, 0, w * 0.28, 0.05);
          break;
        case "chair":
        case "stool": {
          const seat = item.kind === "chair" ? 0.45 : h - 0.05;
          box(0, seat, 0, w, 0.09, d, "fabric");
          legs(seat - 0.045);
          if (item.kind === "chair")
            box(0, (h + seat) / 2, -d / 2 + 0.035, w, h - seat, 0.07, "fabric");
          break;
        }
        case "lamp":
          cylinder(0, 0.025, 0, w / 2, 0.05);
          cylinder(0, h / 2, 0, 0.018, h - 0.1);
          cylinder(0, h - 0.16, 0, w / 2, 0.28, "white");
          break;
        case "shelf":
          for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) box(x, h / 2, 0, 0.04, h, d);
          for (let y = 0.05; y < h; y += 0.36) box(0, y, 0, w, 0.035, d);
          break;
        case "tv":
          box(0, 0.25, 0, w, 0.5, d);
          box(0, h - 0.36, -d * 0.2, w * 0.9, 0.7, 0.045, "dark");
          break;
        case "kitchen":
        case "wardrobe":
        case "cabinet":
        case "fridge":
        case "oven":
        case "vanity":
          box(0, h / 2, 0, w, h - 0.04, d, item.kind === "wardrobe" ? "wood" : "white");
          box(0, h - 0.015, 0, w, 0.03, d, "wood");
          for (let i = 0; i < Math.max(1, Math.round(w / 0.6)); i++) {
            const a = w / Math.max(1, Math.round(w / 0.6));
            box(-w / 2 + a * (i + 0.5), h / 2, d / 2 + 0.003, a - 0.012, h - 0.09, 0.012, "white");
            box(-w / 2 + a * (i + 1) - 0.07, h * 0.65, d / 2 + 0.017, 0.018, 0.15, 0.02, "metal");
          }
          if (item.kind === "oven") box(0, h * 0.55, d / 2 + 0.014, w * 0.82, 0.5, 0.02, "dark");
          if (item.kind === "vanity") {
            box(0, h + 0.016, 0, w * 0.72, 0.03, d * 0.7, "white");
            box(0, h + 0.035, 0.01, w * 0.55, 0.014, d * 0.5, "water");
          }
          break;
        case "sink":
          box(0, h - 0.04, 0, w, 0.06, d, "metal");
          box(0, h, 0, w * 0.8, 0.018, d * 0.72, "water");
          cylinder(0, h + 0.12, -d * 0.35, 0.018, 0.24);
          break;
        case "hob":
          box(0, h, 0, w, 0.025, d, "dark");
          for (const x of [-w * 0.25, w * 0.25])
            for (const z of [-d * 0.25, d * 0.25]) cylinder(x, h + 0.017, z, 0.085, 0.01, "metal");
          break;
        case "toilet":
          box(0, h / 2, -d * 0.38, w, h, d * 0.2, "white");
          shape(new THREE.SphereGeometry(1, 24, 16), 0, 0.31, 0.07, "white").scale.set(
            w / 2,
            0.22,
            d * 0.4,
          );
          cylinder(0, 0.18, 0.04, w * 0.28, 0.3, "white");
          shape(new THREE.CylinderGeometry(1, 1, 0.025, 32), 0, 0.465, 0.08, "cushion").scale.set(
            w * 0.46,
            1,
            d * 0.37,
          );
          break;
        case "bath":
          box(0, 0.15, 0, w, 0.3, d, "white");
          for (const x of [-w / 2 + 0.045, w / 2 - 0.045]) box(x, h / 2, 0, 0.09, h, d, "white");
          for (const z of [-d / 2 + 0.055, d / 2 - 0.055]) box(0, h / 2, z, w, h, 0.11, "white");
          box(0, 0.31, 0, w - 0.18, 0.015, d - 0.22, "water");
          break;
        case "shower":
          box(0, 0.045, 0, w, 0.09, d, "white");
          cylinder(w * 0.34, 1.05, -d * 0.4, 0.018, 1.9);
          cylinder(w * 0.28, h - 0.04, -d * 0.33, 0.12, 0.035);
          // Open tray: no invented opaque cubicle obscuring the room.
          break;
        case "laundry":
          box(0, h / 2, 0, w, h, d, "white");
          for (const y of [h * 0.25, h * 0.75]) {
            const drum = cylinder(0, y, d / 2 + 0.006, w * 0.32, 0.025, "dark");
            drum.rotation.x = Math.PI / 2;
          }
          break;
        default:
          throw new Error(`Unknown furniture kind: ${item.kind}`);
      }
    }
  }
}
