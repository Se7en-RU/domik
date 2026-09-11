import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { roomInteriorPolygon, roomWallFaces } from "../../lib/dimensions.mjs";
import { roomFloorOffset, roomHeight } from "../../lib/layout.mjs";
import { polygonArea, upperHeightAt } from "../../lib/model.mjs";

export const round = (n) => Math.round(n * 1e6) / 1e6;
export const mm = (n) => `${Math.round(n * 1000)} мм`;
export const sourceHash = (spec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex");
export function generatorHash() {
  const hash = createHash("sha256");
  for (const file of [
    "../../lib/model.mjs",
    "../../lib/layout.mjs",
    "../../lib/dimensions.mjs",
    "../../lib/furniture.mjs",
    "../../lib/electrical.mjs",
    "../export-ai.mjs",
    "./data.mjs",
    "./drawings.mjs",
    "./pages.mjs",
    "./views.mjs",
    "./raster.mjs",
  ]) {
    hash.update(file).update(readFileSync(new URL(file, import.meta.url)));
  }
  return hash.digest("hex");
}
export function heightAt(room, spec, x, z) {
  return room.floor === 2
    ? upperHeightAt(x, z, spec.parameters, room.id === "F2-ROOM" ? "south" : "main")
    : roomHeight(room, spec);
}
export function roomPacket(spec, room, root) {
  const polygon = roomInteriorPolygon(room, spec);
  const faces = roomWallFaces(spec)
    .filter((f) => f.roomId === room.id)
    .map((face) => {
      const profile = Array.from({ length: 101 }, (_, i) => {
        const t = i / 100;
        return [
          round(face.length * t),
          round(
            heightAt(
              room,
              spec,
              face.a[0] + (face.b[0] - face.a[0]) * t,
              face.a[1] + (face.b[1] - face.a[1]) * t,
            ),
          ),
        ];
      });
      return { ...face, profile };
    });
  const furniture = (spec.furniture?.items ?? [])
    .filter((f) => f.roomId === room.id)
    .map((item) => {
      const object = root.getObjectByName(item.id);
      if (!object) throw new Error(`Missing furniture ${item.id}`);
      return {
        ...item,
        position: [object.position.x, object.position.z].map(round),
        resolvedElevation: round(object.userData.resolvedElevation),
        sizeStatus:
          "Часть размеров условная; см. sourcePage/sourceNote и furnitureNotes. Это не обмер изделия.",
      };
    });
  return {
    schemaVersion: "1.0",
    sourceRevision: spec.revision,
    sourceSha256: sourceHash(spec),
    room: { ...room, polygon },
    units: "metres",
    axisConvention: spec.axisConvention,
    area: round(polygonArea(polygon)),
    floorElevation: round(
      (room.floor === 2 ? spec.parameters.groundHeight + spec.parameters.slabThickness : 0) +
        roomFloorOffset(room, spec),
    ),
    maximumHeight: roomHeight(room, spec),
    faces,
    furniture,
    furnitureRevision: spec.furniture?.revision,
    furnitureNotes: spec.furniture?.notes,
    assumptions: spec.assumptions,
    sources: spec.sources,
    notes: [
      "План — внутренний контур. Номер стены соответствует развёртке; a→b задаёт направление отсчёта проёмов.",
      "Проёмы faces.openings: start от a внутренней грани, sill от пола комнаты. Не путать с осевыми start в исходной модели.",
      "Мебель: position=[X,Z] — центр, size=[ширина,высота,глубина], rotation — градусы по часовой стрелке на плане, resolvedElevation — низ от пола комнаты.",
      "Профили высот дискретизированы по внутренней грани стены (100 интервалов); точная геометрия — buildHouse/GLB. Скосы предварительные.",
      "3D-виды — ортографические схемы из модели. Потолок и ближние стены скрыты только для обзора. Цвета условные.",
      "Граница комнаты без номера стены — открытое сопряжение, а не новая перегородка. Дверные полотна и направления открывания не заданы.",
      ...(room.id === "F1-STORE" || room.id === "F1-STAIR"
        ? [
            "Над лестницей/под лестницей есть переменная геометрия маршей; maximumHeight — высота этажа, не свободная высота каждой точки. Используйте GLB для проверки просветов.",
          ]
        : []),
    ],
  };
}
