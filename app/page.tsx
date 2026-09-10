"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildHouse, polygonArea, upperHeightAt } from "../lib/model.mjs";
import originalSpec from "../lib/house.json";
import {
  roomWallFaces,
  roomInteriorPolygon,
  placeDimensionLabels,
  pointInPolygon,
} from "../lib/dimensions.mjs";
import {
  garageWalls,
  roomFloorOffset,
  roomHeight,
  stairLayout,
  stairDividerTop,
} from "../lib/layout.mjs";
import {
  Box,
  Layers3,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Maximize,
  Download,
  Eye,
  EyeOff,
  Ruler,
  Info,
  MoveUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  Camera,
  Home as HomeIcon,
  Check,
  X,
  Settings2,
  MousePointer2,
  Square,
  Scissors,
} from "lucide-react";
type Floor = "all" | "1" | "2";
type View = "orbit" | "plan" | "front" | "dimensions";
type SceneAPI = {
  home: () => void;
  focus: (id: string) => void;
  screenshot: () => void;
  measure: () => void;
  clearMeasure: () => void;
};
const ru = (n: number, d = 2) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d });
const save = (data: Blob, name: string) => {
  const u = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
};

type DimensionWall = {
  id: string;
  a: [number, number];
  b: [number, number];
  t: number;
  floor: number;
  component?: string;
  roomId?: string;
  roomName?: string;
  number?: number;
  wallIds?: string[];
  thicknesses?: number[];
  roofZone?: string;
  height?: number;
  openings?: Array<{
    id: string;
    start: number;
    width: number;
    sill: number;
    height: number;
    kind?: string;
    note?: string;
  }>;
};
const wallLength = (w: DimensionWall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const wallPoint = (w: DimensionWall, distance: number): [number, number] => {
  const len = wallLength(w),
    t = len ? distance / len : 0;
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
};
const wallSet = (spec: typeof originalSpec): DimensionWall[] => {
  const stair = stairLayout(spec);
  const generated: DimensionWall[] = [
    ...garageWalls(spec),
    {
      id: "F1-W13-DIVIDER",
      a: [stair.turnX, stair.z + stair.lowerWidth + stair.dividerThickness / 2],
      b: [stair.entryX, stair.z + stair.lowerWidth + stair.dividerThickness / 2],
      t: stair.dividerThickness,
      floor: 1,
      component: "stair",
      height: stairDividerTop(stair, stair.entryX),
    },
  ];
  const walls: DimensionWall[] = spec.walls.map((wall) => ({
    ...wall,
    a: [wall.a[0], wall.a[1]],
    b: [wall.b[0], wall.b[1]],
  }));
  return [...walls, ...generated];
};
const wallTop = (wall: DimensionWall, spec: typeof originalSpec, distance = 0) => {
  if (wall.roomId === spec.garage.roomId || wall.component === "garage")
    return spec.garage.ceilingHeight;
  if (wall.component === "stair")
    return stairDividerTop(stairLayout(spec), wallPoint(wall, distance)[0]);
  if (wall.floor === 1) return wall.height ?? spec.parameters.groundHeight;
  const [x, z] = wallPoint(wall, distance);
  return upperHeightAt(
    x,
    z,
    spec.parameters,
    wall.roofZone ??
      (["F2-W04", "F2-W05", "F2-W14", "F2-W15"].includes(wall.id) ? "south" : "main"),
  );
};
const dimensionNumber = (value: number, unit: "mm" | "m") =>
  unit === "mm" ? `${Math.round(value * 1000)} мм` : `${ru(value, 3)} м`;
const openingKind = (kind?: string) =>
  kind === "window"
    ? "Окно"
    : kind === "passage"
      ? "Проход"
      : kind === "garage-door"
        ? "Ворота"
        : "Дверь";

function DimensionView({
  spec,
  floor,
  selected,
  onSelect,
}: {
  spec: typeof originalSpec;
  floor: Floor;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [unit, setUnit] = useState<"mm" | "m">("mm");
  const [allFloor, setAllFloor] = useState(1);
  const visibleFloor = floor === "all" ? allFloor : Number(floor);
  const [layers, setLayers] = useState({
    walls: true,
    openings: true,
    heights: true,
    thickness: false,
    stairs: true,
  });
  const [selectedWall, setSelectedWall] = useState("");
  const [viewBox, setViewBox] = useState<[number, number, number, number]>([-1, -1, 15, 18]);
  const [viewport, setViewport] = useState({ width: 800, height: 700 });
  const drag = useRef<{
    x: number;
    y: number;
    box: [number, number, number, number];
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const rooms = useMemo(
    () =>
      spec.rooms
        .filter((r) => r.floor === visibleFloor)
        .map((r) => ({ ...r, polygon: roomInteriorPolygon(r, spec) })),
    [spec, visibleFloor],
  );
  const walls = useMemo(
    () => wallSet(spec).filter((w) => w.floor === visibleFloor),
    [spec, visibleFloor],
  );
  const faces = useMemo(
    () => roomWallFaces(spec).filter((f) => f.floor === visibleFloor),
    [spec, visibleFloor],
  );
  const selectedFace = faces.find((f) => f.id === selectedWall);
  const selectedRoom = rooms.find((r) => r.id === (selectedFace?.roomId ?? selected));
  const visibleFaces = selectedRoom ? faces.filter((f) => f.roomId === selectedRoom.id) : faces;
  const unitsPerPixel = Math.max(viewBox[2] / viewport.width, viewBox[3] / viewport.height);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport((previous) => {
        const next = {
          width: Math.max(1, entry.contentRect.width),
          height: Math.max(1, entry.contentRect.height),
        };
        return previous.width === next.width && previous.height === next.height ? previous : next;
      }),
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const fit = useCallback(
    (roomId = "") => {
      const target = rooms.find((r) => r.id === roomId),
        points = target ? target.polygon : rooms.flatMap((r) => r.polygon);
      if (!points.length) return;
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]),
        pad = target ? 0.65 : 1;
      setViewBox([
        Math.min(...xs) - pad,
        Math.min(...ys) - pad,
        Math.max(...xs) - Math.min(...xs) + 2 * pad,
        Math.max(...ys) - Math.min(...ys) + 2 * pad,
      ]);
    },
    [rooms],
  );
  useEffect(() => {
    setSelectedWall("");
    fit();
  }, [fit]);
  const zoom = (factor: number) =>
    setViewBox(([x, y, w, h]) => [
      x + (w * (1 - factor)) / 2,
      y + (h * (1 - factor)) / 2,
      w * factor,
      h * factor,
    ]);
  const selectRoom = (id: string) => {
    if (suppressClick.current) return;
    setSelectedWall("");
    onSelect(id);
    fit(id);
  };
  const roomLabels = rooms.flatMap((room) => {
    const text = room.name.replace(/ · [12] этаж/, "");
    const font = Math.min(0.18, 12 * unitsPerPixel),
      width = text.length * font * 0.65;
    const box = { x: room.label[0] - width / 2, y: room.label[1] - font, w: width, h: font * 1.5 };
    if (
      ![
        [box.x, box.y],
        [box.x + box.w, box.y],
        [box.x, box.y + box.h],
        [box.x + box.w, box.y + box.h],
      ].every((p) => pointInPolygon(p, room.polygon))
    )
      return [];
    return [{ room, text, font, box }];
  });
  const candidates = visibleFaces.flatMap((face) => {
    const room = rooms.find((r) => r.id === face.roomId)!;
    const text =
      dimensionNumber(face.length, unit) +
      (layers.thickness
        ? ` · t ${face.thicknesses.map((t) => dimensionNumber(t, unit)).join(" / ")}`
        : "");
    const labels = layers.walls
      ? [
          {
            id: face.id,
            faceId: face.id,
            a: face.a,
            b: face.b,
            normal: face.normal,
            polygon: room.polygon,
            text,
            kind: "wall",
            priority: face.id === selectedWall ? 100 : 10 + face.length,
          },
        ]
      : [];
    if (layers.openings)
      for (const o of face.openings) {
        const a = wallPoint(face as DimensionWall, o.start),
          b = wallPoint(face as DimensionWall, o.start + o.width);
        labels.push({
          id: `${face.id}:${o.id}`,
          faceId: face.id,
          a,
          b,
          normal: face.normal,
          polygon: room.polygon,
          text: dimensionNumber(o.width, unit),
          kind: "opening",
          priority: 5 + o.width,
        });
      }
    return labels;
  });
  const labelObstacles = roomLabels.map((r) => ({
    ...r.box,
    h: r.box.h + (layers.heights ? 24 * unitsPerPixel : 0),
  }));
  const labels = placeDimensionLabels(candidates, labelObstacles, unitsPerPixel);
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const originals = [svg, ...svg.querySelectorAll("*")],
      copies = [clone, ...clone.querySelectorAll("*")];
    originals.forEach((node, i) => {
      const computed = getComputedStyle(node);
      for (const property of [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "font-size",
        "font-family",
        "font-weight",
        "paint-order",
        "opacity",
        "display",
        "text-anchor",
        "dominant-baseline",
      ]) {
        (copies[i] as SVGElement).style.setProperty(property, computed.getPropertyValue(property));
      }
    });
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(viewport.width));
    clone.setAttribute("height", String(viewport.height));
    save(
      new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`], {
        type: "image/svg+xml",
      }),
      `внутренние-размеры-${visibleFloor}-этаж.svg`,
    );
  };
  const stair = stairLayout(spec);
  return (
    <div className="dimensions-view">
      <div className="dimensions-toolbar">
        <div>
          <span className="eyebrow">ОБМЕРНЫЙ РЕЖИМ</span>
          <h2>Внутренние размеры</h2>
        </div>
        <div className="dimensions-actions">
          {floor === "all" && (
            <div className="unit-switch" aria-label="Этаж чертежа">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  className={allFloor === n ? "active" : ""}
                  onClick={() => setAllFloor(n)}
                >
                  {n} этаж
                </button>
              ))}
            </div>
          )}
          <button
            className="dimension-action"
            onClick={() => {
              onSelect("");
              setSelectedWall("");
              fit();
            }}
          >
            <Maximize size={16} /> Весь план
          </button>
          <button className="dimension-action" onClick={exportSvg}>
            <Download size={16} /> SVG
          </button>
          <div className="unit-switch" aria-label="Единицы">
            {(["mm", "m"] as const).map((u) => (
              <button key={u} className={unit === u ? "active" : ""} onClick={() => setUnit(u)}>
                {u === "mm" ? "мм" : "м"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="dimensions-content">
        <div className="dimensions-canvas-wrap">
          <div className="dimensions-note">
            <Ruler size={15} /> Размеры между внутренними углами. Выберите комнату или сторону
            стены.
          </div>
          <svg
            ref={svgRef}
            className="dimension-plan"
            viewBox={viewBox.join(" ")}
            role="img"
            aria-label="План внутренних размеров комнат"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, box: viewBox, moved: false };
              suppressClick.current = false;
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const d = drag.current,
                dx = e.clientX - d.x,
                dy = e.clientY - d.y;
              d.moved ||= Math.hypot(dx, dy) > 4;
              if (!d.moved) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const scale = Math.max(d.box[2] / viewport.width, d.box[3] / viewport.height);
              setViewBox([d.box[0] - dx * scale, d.box[1] - dy * scale, d.box[2], d.box[3]]);
            }}
            onPointerUp={() => {
              suppressClick.current = drag.current?.moved ?? false;
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onWheel={(e) => {
              e.preventDefault();
              zoom(e.deltaY > 0 ? 1.12 : 0.89);
            }}
          >
            <defs>
              <pattern id="dim-grid" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M1 0 L0 0 0 1" fill="none" stroke="#dbe7eb" strokeWidth=".012" />
              </pattern>
            </defs>
            <rect
              x={viewBox[0] - 30}
              y={viewBox[1] - 30}
              width={viewBox[2] + 60}
              height={viewBox[3] + 60}
              fill="url(#dim-grid)"
            />
            {rooms.map((room) => (
              <polygon
                key={room.id}
                className="dimension-room"
                data-room-id={room.id}
                points={room.polygon.map((p) => p.join(",")).join(" ")}
                fill={room.id === selectedRoom?.id ? "#d4eaf0" : "#edf3f5"}
                stroke="#a0b7c0"
                strokeWidth=".018"
                onClick={() => selectRoom(room.id)}
              />
            ))}
            {/* Structural segments form the background; no axis lengths or labels. */}
            {walls.map((w) => (
              <g key={w.id} className="structural-wall" pointerEvents="none">
                <line
                  x1={w.a[0]}
                  y1={w.a[1]}
                  x2={w.b[0]}
                  y2={w.b[1]}
                  stroke="#355c6b"
                  strokeWidth={w.t}
                />
                {layers.openings &&
                  (w.openings ?? []).map((o) => {
                    const a = wallPoint(w, o.start),
                      b = wallPoint(w, o.start + o.width);
                    return (
                      <line
                        key={o.id}
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        stroke="#d37b42"
                        strokeWidth=".12"
                      />
                    );
                  })}
              </g>
            ))}
            {layers.stairs && (
              <g className="stair-dimension" pointerEvents="none">
                <rect x={stair.x} y={stair.z} width={stair.width} height={stair.depth} />
                {Array.from({ length: stair.lowerTreads }, (_, i) => (
                  <line
                    key={`lo${i}`}
                    x1={stair.entryX - i * stair.lowerGoing}
                    x2={stair.entryX - i * stair.lowerGoing}
                    y1={stair.lowerZ}
                    y2={stair.lowerZ + stair.lowerWidth}
                  />
                ))}
                {Array.from({ length: stair.upperTreads }, (_, i) => (
                  <line
                    key={`up${i}`}
                    x1={stair.turnX + i * stair.upperGoing}
                    x2={stair.turnX + i * stair.upperGoing}
                    y1={stair.upperZ}
                    y2={stair.upperZ + stair.upperWidth}
                  />
                ))}
              </g>
            )}
            {faces.map((face) => {
              const n = face.normal,
                centerA = face.a.map((v, i) => v - (n[i] * face.t) / 2),
                centerB = face.b.map((v, i) => v - (n[i] * face.t) / 2);
              const active = selectedWall === face.id;
              return (
                <g
                  key={face.id}
                  className={`dimension-wall room-wall-face ${active ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${face.roomName}, стена ${face.number}, внутренний размер ${dimensionNumber(face.length, unit)}`}
                  data-face-id={face.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSelectedWall(face.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedWall(face.id);
                    }
                  }}
                >
                  <line
                    className="face-selection-band"
                    x1={centerA[0]}
                    y1={centerA[1]}
                    x2={centerB[0]}
                    y2={centerB[1]}
                    strokeWidth={face.t}
                    style={{ stroke: active ? "#127c9f" : "transparent" }}
                  />
                  <line
                    className="face-hit"
                    x1={face.a[0]}
                    y1={face.a[1]}
                    x2={face.b[0]}
                    y2={face.b[1]}
                    stroke="transparent"
                    strokeWidth="12"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    className="wall-focus-ring"
                    x1={face.a[0]}
                    y1={face.a[1]}
                    x2={face.b[0]}
                    y2={face.b[1]}
                    vectorEffect="non-scaling-stroke"
                  />
                  <title>
                    {face.roomName} · стена {face.number}: {dimensionNumber(face.length, unit)} по
                    внутренней грани
                  </title>
                </g>
              );
            })}
            {/* All annotations are drawn last, above wall geometry. */}
            <g className="dimension-annotations" pointerEvents="none">
              {roomLabels.map(({ room, text, font }) => (
                <g key={room.id}>
                  <text
                    x={room.label[0]}
                    y={room.label[1]}
                    textAnchor="middle"
                    fill="#315b6c"
                    fontSize={font}
                    fontWeight="650"
                  >
                    {text}
                  </text>
                  {layers.heights && room.id === selectedRoom?.id && (
                    <text
                      x={room.label[0]}
                      y={room.label[1] + font * 1.5}
                      textAnchor="middle"
                      fontSize={font * 0.8}
                      fill="#5d7c89"
                    >
                      H {dimensionNumber(roomHeight(room, spec), unit)}
                    </text>
                  )}
                </g>
              ))}
              {labels.map((label) => (
                <g
                  key={label.id}
                  data-dimension-label={label.id}
                  data-label-box={[label.box.x, label.box.y, label.box.w, label.box.h].join(",")}
                >
                  {label.kind === "wall" && (
                    <line
                      x1={label.a[0] + label.normal[0] * 10 * unitsPerPixel}
                      y1={label.a[1] + label.normal[1] * 10 * unitsPerPixel}
                      x2={label.b[0] + label.normal[0] * 10 * unitsPerPixel}
                      y2={label.b[1] + label.normal[1] * 10 * unitsPerPixel}
                      stroke="#91adb9"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <g
                    transform={`translate(${label.x} ${label.y}) rotate(${label.vertical ? -90 : 0})`}
                  >
                    <rect
                      x={-label.width / 2}
                      y={-label.height / 2}
                      width={label.width}
                      height={label.height}
                      rx={3 * unitsPerPixel}
                      fill="#fff"
                      fillOpacity=".96"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily="system-ui, sans-serif"
                      fontSize={12 * unitsPerPixel}
                      fontWeight={label.faceId === selectedWall ? 700 : 550}
                      fill={label.kind === "opening" ? "#a65e2d" : "#24576b"}
                    >
                      {label.text}
                    </text>
                  </g>
                </g>
              ))}
            </g>
          </svg>
          <div className="dimension-zoom">
            <button onClick={() => zoom(0.82)} aria-label="Увеличить">
              +
            </button>
            <button onClick={() => zoom(1.22)} aria-label="Уменьшить">
              −
            </button>
          </div>
        </div>
        <aside className="dimensions-panel">
          <span className="eyebrow">СЛОИ</span>
          {(
            [
              ["walls", "Внутренние длины"],
              ["openings", "Размеры проёмов"],
              ["heights", "Высота помещения"],
              ["thickness", "Толщина стен"],
              ["stairs", "Лестница"],
            ] as const
          ).map(([key, label]) => (
            <label className="dimension-check" key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => setLayers((v) => ({ ...v, [key]: !v[key] }))}
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="dimension-legend">
            <i className="legend-wall" /> внутренняя грань <i className="legend-opening" /> проём
          </div>
          <div className="dimension-summary">
            <strong>{visibleFloor} этаж</strong>
            <span>{rooms.length} помещений · размеры между внутренними углами</span>
          </div>
          {selectedRoom ? (
            <div className="dimension-selection">
              <span className="eyebrow">{selectedRoom.name}</span>
              <span>Площадь {ru(polygonArea(selectedRoom.polygon), 1)} м²</span>
              <button onClick={() => fit(selectedRoom.id)}>Приблизить к комнате</button>
              <div className="room-face-list" aria-label="Стены помещения">
                {faces
                  .filter((f) => f.roomId === selectedRoom.id)
                  .map((f) => (
                    <button
                      key={f.id}
                      className={selectedWall === f.id ? "active" : ""}
                      onClick={() => setSelectedWall(f.id)}
                    >
                      <span>Стена {f.number}</span>
                      <strong>{dimensionNumber(f.length, unit)}</strong>
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <p className="dimension-footnote">
              Выберите комнату: её стены и все короткие участки появятся в списке.
            </p>
          )}
          {selectedFace ? (
            <WallElevation
              wall={selectedFace as DimensionWall}
              spec={spec}
              unit={unit}
              onClose={() => setSelectedWall("")}
            />
          ) : (
            <div className="dimension-empty">
              <Ruler size={19} />
              <span>Выберите сторону стены для развёртки всей внутренней поверхности.</span>
            </div>
          )}
          <p className="dimension-footnote">
            Одна сторона комнаты — один размер, включая проёмы. Короткие подписи появляются при
            увеличении; все значения доступны в списке стен.
          </p>
        </aside>
      </div>
    </div>
  );
}

function WallElevation({
  wall,
  spec,
  unit,
  onClose,
}: {
  wall: DimensionWall;
  spec: typeof originalSpec;
  unit: "mm" | "m";
  onClose: () => void;
}) {
  const len = wallLength(wall);
  const samples = Array.from({ length: Math.ceil(len / 0.04) + 1 }, (_, i) => {
    const x = (len * i) / Math.ceil(len / 0.04);
    return [x, wallTop(wall, spec, x)];
  });
  const maxTop = Math.max(...samples.map((p) => p[1])),
    base = maxTop;
  const openings = wall.openings ?? [];
  const thicknesses = wall.thicknesses ?? [wall.t];
  return (
    <section className="wall-elevation">
      <div className="wall-elevation-head">
        <div>
          <span className="eyebrow">ВНУТРЕННЯЯ ПОВЕРХНОСТЬ</span>
          <strong>
            {wall.roomName} · стена {wall.number}
          </strong>
        </div>
        <button onClick={onClose} aria-label="Закрыть развёртку">
          <X size={16} />
        </button>
      </div>
      <div className="face-measurements">
        <strong>Длина {dimensionNumber(len, unit)}</strong>
        <span>
          Высота {dimensionNumber(Math.min(...samples.map((p) => p[1])), unit)}
          {Math.max(...samples.map((p) => p[1])) - Math.min(...samples.map((p) => p[1])) > 0.005
            ? `–${dimensionNumber(maxTop, unit)}`
            : ""}
        </span>
        {thicknesses.length > 0 && (
          <span>Толщина {thicknesses.map((t) => dimensionNumber(t, unit)).join(" / ")}</span>
        )}
      </div>
      <svg
        viewBox={`-.1 -.1 ${len + 0.2} ${maxTop + 0.2}`}
        role="img"
        aria-label={`Внутренняя развёртка: ${wall.roomName}, стена ${wall.number}`}
      >
        <polygon
          className="elevation-wall"
          points={[
            ...samples.map(([x, h]) => `${x},${base - h}`),
            `${len},${base}`,
            `0,${base}`,
          ].join(" ")}
        />
        {openings.map((o, i) => (
          <g className="elevation-opening" key={o.id}>
            <rect x={o.start} y={base - o.sill - o.height} width={o.width} height={o.height} />
            <text x={o.start + o.width / 2} y={base - o.sill - o.height / 2} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      {openings.length > 0 && (
        <div className="face-opening-list">
          {openings.map((o, i) => (
            <div key={o.id}>
              <strong>
                {i + 1}. {openingKind(o.kind)} · {dimensionNumber(o.width, unit)} ×{" "}
                {dimensionNumber(o.height, unit)}
              </strong>
              <span>
                От начала стены {dimensionNumber(o.start, unit)} · низ{" "}
                {dimensionNumber(o.sill, unit)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="wall-elevation-note">
        Длина между внутренними углами комнаты. Высоты — от её пола. Проёмы входят в общую длину.
      </p>
    </section>
  );
}

function Scene({
  spec,
  floor,
  view,
  split,
  ceilings,
  furniture,
  cut,
  labels,
  windows,
  selected,
  onSelect,
  onReady,
  onMeasure,
  onError,
}: {
  spec: typeof originalSpec;
  floor: Floor;
  view: View;
  split: boolean;
  ceilings: boolean;
  furniture: boolean;
  cut: boolean;
  labels: boolean;
  windows: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onReady: (api: SceneAPI) => void;
  onMeasure: (v: string) => void;
  onError: (s: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    state = useRef<any>(null);
  const latest = useRef({
    floor,
    view,
    split,
    ceilings,
    furniture,
    cut,
    labels,
    windows,
    selected,
    onSelect,
    onMeasure,
  });
  latest.current = {
    floor,
    view,
    split,
    ceilings,
    furniture,
    cut,
    labels,
    windows,
    selected,
    onSelect,
    onMeasure,
  };
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      onError(
        "Для 3D нужен WebGL. Включите аппаратное ускорение или откройте просмотрщик в другом браузере.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xe9eef2);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf5fbff, 0x79909f, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3.3);
    sun.position.set(-6, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -16,
      right: 16,
      top: 16,
      bottom: -16,
      near: 0.5,
      far: 60,
    });
    sun.shadow.normalBias = 0.045;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc9e4ff, 1.5);
    fill.position.set(14, 9, -8);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 150);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 2;
    controls.maxDistance = 110;
    controls.screenSpacePanning = true;
    const { root, floors } = buildHouse(spec);
    scene.add(root);
    const grid = new THREE.GridHelper(32, 32, 0xb7c5cf, 0xd1dbe1);
    const groundY = Math.min(
      -spec.parameters.slabThickness,
      spec.garage.floorOffset - spec.garage.slabThickness,
    );
    const modelBounds = new THREE.Box3().setFromObject(root);
    const modelCenter = modelBounds.getCenter(new THREE.Vector3());
    grid.position.set(modelCenter.x, groundY - 0.02, modelCenter.z);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundY - 0.03;
    ground.receiveShadow = true;
    scene.add(ground);
    const labelNodes = spec.rooms.map((r) => {
      const div = document.createElement("button");
      div.type = "button";
      div.className = "room-label";
      div.innerHTML = `<span>${r.name}</span><small>${ru(polygonArea(r.polygon))} м²</small>`;
      div.setAttribute("aria-label", `Выбрать помещение ${r.name}`);
      div.onclick = () => latest.current.onSelect(r.id);
      el.appendChild(div);
      return { r, div };
    });
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const rooms: THREE.Object3D[] = [];
    root.traverse((o: any) => {
      if (o.isMesh) {
        if (o.userData.kind === "room") rooms.push(o);
        o.material = o.material.clone();
        o.userData.baseColor = o.material.color?.clone();
      }
    });
    let measureFloor: number | null = null;
    let measureMode = false,
      points: THREE.Vector3[] = [],
      measureGroup = new THREE.Group();
    scene.add(measureGroup);
    let down = [0, 0];
    const resetMeasurement = () => {
      measureMode = false;
      measureFloor = null;
      points = [];
      el.style.cursor = "grab";
      measureGroup.traverse((o: any) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      measureGroup.clear();
      latest.current.onMeasure("");
    };
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(rooms).find((h) => {
        let par: any = h.object;
        while (par) {
          if (!par.visible) return false;
          par = par.parent;
        }
        return true;
      });
    };
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const hit = pick(e);
      if (!hit) return;
      if (!measureMode) {
        latest.current.onSelect(hit.object.userData.roomId);
        return;
      }
      if (points.length === 2) resetMeasurement();
      if (measureFloor !== null && hit.object.userData.floor !== measureFloor) {
        latest.current.onMeasure("Вторая точка должна быть на том же этаже");
        return;
      }
      measureFloor = hit.object.userData.floor;
      measureMode = true;
      points.push(hit.point.clone().add(new THREE.Vector3(0, 0.055, 0)));
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x0c749d, depthTest: false }),
      );
      dot.position.copy(points.at(-1)!);
      dot.renderOrder = 20;
      measureGroup.add(dot);
      if (points.length === 2) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0x0c749d, depthTest: false }),
        );
        line.renderOrder = 20;
        measureGroup.add(line);
        latest.current.onMeasure(ru(points[0].distanceTo(points[1]), 3) + " м");
        measureMode = false;
        el.style.cursor = "grab";
      } else latest.current.onMeasure("Укажите вторую точку на полу");
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const target = new THREE.Vector3(4.4, 2.1, 4.9);
    let desiredPos: THREE.Vector3 | null = null,
      desiredTarget: THREE.Vector3 | null = null;
    // A manual gesture takes over from floor changes, room focus and Home.
    const stopCameraTransition = () => {
      desiredPos = null;
      desiredTarget = null;
    };
    controls.addEventListener("start", stopCameraTransition);
    const boundsForRooms = (list: typeof spec.rooms) => {
      const bounds = new THREE.Box3();
      for (const r of list) {
        const base =
          (r.floor === 2
            ? spec.parameters.groundHeight +
              spec.parameters.slabThickness +
              (latest.current.floor === "all" && latest.current.split ? 4.8 : 0)
            : 0) + roomFloorOffset(r, spec);
        for (const [x, z] of r.polygon) {
          bounds.expandByPoint(new THREE.Vector3(x - 0.6, base, z - 0.6));
          bounds.expandByPoint(new THREE.Vector3(x + 0.6, base + roomHeight(r, spec), z + 0.6));
        }
      }
      return bounds;
    };
    const frameBounds = (bounds: THREE.Box3) => {
      const mode = latest.current.view;
      camera.up.set(0, mode === "plan" ? 0 : 1, mode === "plan" ? -1 : 0);
      const direction = new THREE.Vector3(
        ...((mode === "plan"
          ? [0, 1, 0.00001]
          : mode === "front"
            ? [0, 0.12, 1]
            : [14, 18, 18]) as [number, number, number]),
      ).normalize();
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const center = bounds.getCenter(new THREE.Vector3());
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
        tanH = tanV * camera.aspect;
      let distance = 3;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new THREE.Vector3(x, y, z).sub(center);
            distance = Math.max(
              distance,
              (Math.abs(point.dot(right)) * 1.12) / tanH + point.dot(direction),
              (Math.abs(point.dot(up)) * 1.12) / tanV + point.dot(direction),
            );
          }
      desiredTarget = center;
      desiredPos = center.clone().addScaledVector(direction, distance);
      controls.enableRotate = mode !== "plan";
    };
    const home = () => {
      const list = spec.rooms.filter(
        (r) => latest.current.floor === "all" || r.floor === Number(latest.current.floor),
      );
      frameBounds(boundsForRooms(list));
    };
    const focus = (id: string) => {
      const room = spec.rooms.find((r) => r.id === id);
      if (room) frameBounds(boundsForRooms([room]));
    };
    camera.position.set(20, 24, 26);
    controls.target.copy(target);
    home();
    state.current = { root, floors, camera, controls, home, resetMeasurement };
    const api = {
      home,
      focus,
      screenshot: () => {
        renderer.render(scene, camera);
        renderer.domElement.toBlob((b) => b && save(b, "house-view.png"), "image/png");
      },
      measure: () => {
        resetMeasurement();
        measureMode = true;
        el.style.cursor = "crosshair";
        latest.current.onMeasure("Укажите первую точку на полу");
      },
      clearMeasure: resetMeasurement,
    };
    onReady(api);
    let hasViewportSize = false;
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Mobile browser chrome and panels can resize the viewport mid-gesture.
      // Update the projection without resetting the user's camera position.
      if (!hasViewportSize) {
        hasViewportSize = true;
        home();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let frame = 0,
      live = true;
    function animate() {
      if (!live) return;
      frame = requestAnimationFrame(animate);
      if (desiredPos && desiredTarget) {
        camera.position.lerp(desiredPos, 0.15);
        controls.target.lerp(desiredTarget, 0.15);
        if (camera.position.distanceTo(desiredPos) < 0.01) {
          desiredPos = null;
          desiredTarget = null;
        }
      }
      controls.update();
      const s = latest.current;
      floors[1].visible = true;
      floors[2].visible = s.floor !== "1";
      floors[2].position.y =
        spec.parameters.groundHeight +
        spec.parameters.slabThickness +
        (s.floor === "all" && s.split ? 4.8 : 0);
      root.updateMatrixWorld(true);
      root.traverse((o: any) => {
        if (!o.isMesh) return;
        const k = o.userData.kind,
          base = floors[o.userData.floor].position.y;
        const onFloor =
          s.floor === "all" ||
          String(o.userData.floor) === s.floor ||
          (s.floor === "2" &&
            o.userData.floor === 1 &&
            ["stairs", "rail", "stair-wall"].includes(k));
        o.visible =
          onFloor &&
          (k === "furniture"
            ? s.furniture
            : k === "ceiling"
              ? s.ceilings
              : k === "window"
                ? s.windows
                : true);
        const mat = o.material;
        mat.clippingPlanes =
          s.cut && ["wall", "window", "stair-wall"].includes(k)
            ? [
                new THREE.Plane(
                  new THREE.Vector3(0, -1, 0),
                  (k === "stair-wall" && s.floor === "2" ? floors[2].position.y : base) + 1.15,
                ),
              ]
            : [];
        if (k === "ceiling") {
          mat.transparent = true;
          mat.opacity = 0.4;
          mat.depthWrite = false;
        }
        if (k === "room") {
          mat.color.copy(o.userData.baseColor);
          if (o.userData.roomId === s.selected) mat.color.set(0x64b9d5);
        }
      });
      renderer.render(scene, camera);
      for (const { r, div } of labelNodes) {
        const visible = s.labels && (s.floor === "all" || String(r.floor) === s.floor);
        div.style.display = visible ? "block" : "none";
        if (!visible) continue;
        const y = floors[r.floor].position.y + roomFloorOffset(r, spec) + 0.05;
        const v = new THREE.Vector3(r.label[0], y, r.label[1]).project(camera);
        div.style.left = (v.x * 0.5 + 0.5) * el.clientWidth + "px";
        div.style.top = (-v.y * 0.5 + 0.5) * el.clientHeight + "px";
        div.style.visibility = v.z > 1 || v.z < 0 ? "hidden" : "visible";
        div.classList.toggle("selected", s.selected === r.id);
      }
    }
    animate();
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      controls.removeEventListener("start", stopCameraTransition);
      controls.dispose();
      scene.traverse((o: any) => {
        o.geometry?.dispose();
        if (o.material)
          Array.isArray(o.material)
            ? o.material.forEach((m: any) => m.dispose())
            : o.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labelNodes.forEach((x) => x.div.remove());
      state.current = null;
    };
  }, [spec]);
  useEffect(() => {
    state.current?.home();
    state.current?.resetMeasurement();
  }, [floor, view, split]);
  return <div className="scene-host" ref={host} aria-label="Интерактивная 3D-модель дома" />;
}
export default function Home() {
  const [spec, setSpec] = useState(originalSpec),
    [floor, setFloor] = useState<Floor>("1"),
    [view, setView] = useState<View>("orbit"),
    [split, setSplit] = useState(true),
    [ceilings, setCeilings] = useState(false),
    [furniture, setFurniture] = useState(true),
    [cut, setCut] = useState(false),
    [labels, setLabels] = useState(true),
    [windows, setWindows] = useState(true),
    [selected, setSelected] = useState(""),
    [side, setSide] = useState(true),
    [info, setInfo] = useState(false),
    [settings, setSettings] = useState(false),
    [exporting, setExporting] = useState(false),
    [measure, setMeasure] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const api = useRef<SceneAPI | null>(null);
  const currentRoom = spec.rooms.find((r) => r.id === selected);
  const visibleRooms = spec.rooms.filter((r) => floor === "all" || r.floor === Number(floor));
  const handleSelect = useCallback((id: string) => setSelected(id), []);
  const onReady = useCallback((a: SceneAPI) => {
    api.current = a;
  }, []);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 3500);
  };
  const exportJSON = () => {
    save(
      new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" }),
      "house-model.json",
    );
    notify("Параметры модели сохранены");
  };
  const exportGLB = async () => {
    setExporting(true);
    try {
      const { root } = buildHouse(spec);
      const result = await new GLTFExporter().parseAsync(root, {
        binary: true,
        onlyVisible: false,
      });
      save(new Blob([result as ArrayBuffer], { type: "model/gltf-binary" }), "house-model.glb");
      root.traverse((o: any) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      notify("Полная модель GLB сохранена");
    } catch (e) {
      setError("Не удалось экспортировать GLB. " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    const register = (tool: any) => {
      try {
        Promise.resolve(context.registerTool(tool, { signal: life.signal })).catch(() => {});
      } catch {}
    };
    register({
      name: "read_house_model",
      description:
        "Read the editable house specification, dimensions, source page references and assumptions.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => spec,
    });
    register({
      name: "set_house_view",
      description:
        "Change the visible floor, 3D/plan/dimensions mode and ceiling/cutaway state in the house viewer.",
      inputSchema: {
        type: "object",
        properties: {
          floor: { type: "string", enum: ["all", "1", "2"] },
          view: { type: "string", enum: ["orbit", "plan", "front", "dimensions"] },
          ceilings: { type: "boolean" },
          cutWalls: { type: "boolean" },
        },
        required: ["floor"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input: any) => {
        if (
          !["all", "1", "2"].includes(input?.floor) ||
          ("view" in input && !["orbit", "plan", "front", "dimensions"].includes(input.view)) ||
          ("ceilings" in input && typeof input.ceilings !== "boolean") ||
          ("cutWalls" in input && typeof input.cutWalls !== "boolean")
        )
          throw Error("Invalid view");
        setFloor(input.floor);
        if ("view" in input) setView(input.view);
        if ("ceilings" in input) setCeilings(input.ceilings);
        if ("cutWalls" in input) setCut(input.cutWalls);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { floor: input.floor, view: input.view ?? view };
      },
    });
    return () => life.abort();
  }, [spec]);
  useEffect(() => {
    if (window.innerWidth < 760) setSide(false);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        setInfo(false);
        setSettings(false);
        api.current?.clearMeasure();
      }
      if (e.key === "1") setFloor("1");
      if (e.key === "2") setFloor("2");
      if (e.key === "0") setFloor("all");
      if (e.key.toLowerCase() === "r") api.current?.home();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const toggle = (
    value: boolean,
    fn: (v: boolean) => void,
    icon: React.ReactNode,
    label: string,
  ) => (
    <button
      className={"toggle-row " + (value ? "active" : "")}
      onClick={() => fn(!value)}
      aria-pressed={value}
    >
      {icon}
      <span>{label}</span>
      <span className="switch">
        <i />
      </span>
    </button>
  );
  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Box size={22} />
          </span>
          <div>
            <h1>
              Дом<span> / </span>3D-модель
            </h1>
            <p>Дом и мебель · 10.09.2026</p>
          </div>
        </div>
        <div className="floor-tabs" aria-label="Этаж">
          {[
            ["1", "1 этаж"],
            ["2", "2 этаж"],
            ["all", "Весь дом"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={floor === id ? "active" : ""}
              onClick={() => {
                setFloor(id as Floor);
                setSelected("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            title="Источники и допущения"
            onClick={() => setInfo(true)}
          >
            <Info size={19} />
          </button>
          <button className="export-button" onClick={exportGLB} disabled={exporting}>
            <Download size={17} />
            <span>{exporting ? "Сохранение…" : "Скачать GLB"}</span>
          </button>
        </div>
      </header>
      <div className="work-area">
        {side && view !== "dimensions" && (
          <aside className="sidebar">
            <div className="sidebar-heading">
              <div>
                <span className="eyebrow">ПЛАНИРОВКА</span>
                <h2>
                  {floor === "all" ? "Два этажа" : floor === "1" ? "Первый этаж" : "Второй этаж"}
                </h2>
              </div>
              <button className="icon-button" title="Скрыть панель" onClick={() => setSide(false)}>
                <PanelLeftClose size={18} />
              </button>
            </div>
            <div className="model-badge">
              <span />
              <span>По сканам RoomPlan</span>
            </div>
            <div className="rooms-list">
              {visibleRooms.map((r) => (
                <button
                  key={r.id}
                  className={"room-row " + (selected === r.id ? "selected" : "")}
                  onClick={() => {
                    setSelected(r.id);
                    api.current?.focus(r.id);
                  }}
                >
                  <span className="room-index">
                    {r.floor}.
                    {spec.rooms.filter((x) => x.floor === r.floor).findIndex((x) => x.id === r.id) +
                      1}
                  </span>
                  <span>
                    <strong>{r.name.replace(" · 1 этаж", "").replace(" · 2 этаж", "")}</strong>
                    <small>{r.dimensions}</small>
                  </span>
                  <b>
                    {ru(polygonArea(r.polygon), 1)}
                    <small>м²</small>
                  </b>
                </button>
              ))}
            </div>
            <div className="visibility-panel">
              <span className="eyebrow">ОТОБРАЖЕНИЕ</span>
              {toggle(furniture, setFurniture, <Box size={17} />, "Мебель и оборудование")}
              {toggle(ceilings, setCeilings, <Layers3 size={17} />, "Потолки и скосы")}
              {toggle(cut, setCut, <Scissors size={17} />, "Стены до 1,15 м")}
              {toggle(labels, setLabels, <MousePointer2 size={17} />, "Названия комнат")}
              {toggle(windows, setWindows, <Square size={17} />, "Остекление")}
              {floor === "all" && toggle(split, setSplit, <Layers3 size={17} />, "Разнести этажи")}
            </div>
            <div className="sidebar-bottom">
              <button onClick={() => setSettings(true)}>
                <Settings2 size={17} />
                Параметры высот
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setInfo(true)}>
                <Info size={17} />
                Источники и допущения
                <ChevronRight size={16} />
              </button>
            </div>
          </aside>
        )}
        <section className={`viewport ${view === "dimensions" ? "dimensions-mode" : ""}`}>
          {view === "dimensions" ? (
            <DimensionView spec={spec} floor={floor} selected={selected} onSelect={handleSelect} />
          ) : (
            <Scene
              spec={spec}
              floor={floor}
              view={view}
              split={split}
              furniture={furniture}
              ceilings={ceilings}
              cut={cut}
              labels={labels}
              windows={windows}
              selected={selected}
              onSelect={handleSelect}
              onReady={onReady}
              onMeasure={setMeasure}
              onError={setError}
            />
          )}
          <div className="viewport-top">
            {!side && (
              <button
                className="floating-icon"
                title="Показать панель"
                onClick={() => setSide(true)}
              >
                <PanelLeftOpen size={19} />
              </button>
            )}
            <div className="view-switch">
              <button className={view === "orbit" ? "active" : ""} onClick={() => setView("orbit")}>
                <Box size={15} />
                3D
              </button>
              <button
                className={view === "plan" ? "active" : ""}
                onClick={() => {
                  setView("plan");
                  setCut(true);
                  setCeilings(false);
                }}
              >
                План сверху
              </button>
              <button className={view === "front" ? "active" : ""} onClick={() => setView("front")}>
                Фасад
              </button>
              <button
                className={view === "dimensions" ? "active" : ""}
                onClick={() => {
                  setView("dimensions");
                  setMeasure("");
                }}
              >
                <Ruler size={15} /> Размеры
              </button>
            </div>
            {view !== "dimensions" && (
              <span className="scale-tag">Метры · {furniture ? "с мебелью" : "без мебели"}</span>
            )}
          </div>
          {view !== "dimensions" && (
            <div className="viewport-tools">
              <button title="Весь этаж в кадре · R" onClick={() => api.current?.home()}>
                <Maximize size={19} />
              </button>
              <button
                title="Измерить расстояние между точками на полу"
                className={measure ? "active" : ""}
                onClick={() => (measure ? api.current?.clearMeasure() : api.current?.measure())}
              >
                <Ruler size={20} />
              </button>
              <button title="Сохранить изображение" onClick={() => api.current?.screenshot()}>
                <Camera size={19} />
              </button>
            </div>
          )}
          {view !== "dimensions" && floor === "2" && !ceilings && (
            <button
              className="ceiling-hint"
              onClick={() => {
                setCeilings(true);
                setCut(false);
              }}
            >
              <Layers3 size={18} />
              <span>Показать скошенные потолки</span>
              <ArrowUpRight size={17} />
            </button>
          )}
          {view !== "dimensions" && measure && (
            <div className="measure-result">
              <Ruler size={18} />
              {measure}
              <button title="Сбросить измерение" onClick={() => api.current?.clearMeasure()}>
                <X size={16} />
              </button>
            </div>
          )}
          {view !== "dimensions" && currentRoom && (
            <div className="selection-card">
              <button
                className="close-selection"
                title="Снять выбор"
                onClick={() => setSelected("")}
              >
                <X size={16} />
              </button>
              <span className="eyebrow">
                {currentRoom.floor} ЭТАЖ · {currentRoom.id}
              </span>
              <h3>{currentRoom.name}</h3>
              <div className="room-stats">
                <span>
                  <b>{ru(polygonArea(currentRoom.polygon))}</b> м²<small>в модели</small>
                </span>
                <span>
                  <b>{ru(roomHeight(currentRoom, spec))}</b> м
                  <small>{currentRoom.floor === 1 ? "до потолка" : "в высокой части"}</small>
                </span>
              </div>
              <p>{currentRoom.dimensions}</p>
              <small className="source-ref">
                {currentRoom.sourceLabel ??
                  `Черновой план · стр. ${currentRoom.sourcePages.join(", ")}`}
              </small>
            </div>
          )}
          {view !== "dimensions" && (
            <div className="viewport-bottom">
              <span>
                <i />{" "}
                {floor === "all"
                  ? split
                    ? "Этажи разнесены для просмотра"
                    : "Общий объём"
                  : floor === "1"
                    ? "Отметка пола ±0,000"
                    : `Отметка пола +${ru(spec.parameters.groundHeight + spec.parameters.slabThickness, 3)}`}
              </span>
              <span className="mouse-hint">
                Вращение — мышь · масштаб — прокрутка · сдвиг — правая кнопка
              </span>
            </div>
          )}
          {error && (
            <div className="error-banner">
              {error}
              <button onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
        </section>
      </div>
      {toast && (
        <div className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      {(info || settings) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setInfo(false);
            setSettings(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">ОБМЕРНАЯ ОСНОВА</span>
                <h2 id="modal-title">{settings ? "Параметры высот" : "Источники и допущения"}</h2>
              </div>
              <button
                className="icon-button"
                title="Закрыть"
                onClick={() => {
                  setInfo(false);
                  setSettings(false);
                }}
              >
                <X size={22} />
              </button>
            </header>
            {settings ? (
              <>
                <p className="modal-intro">
                  Изменения сразу перестраивают модель. Скачайте JSON, чтобы сохранить новую версию
                  для дальнейшей работы.
                </p>
                {(
                  [
                    ["groundHeight", "Высота первого этажа", 3.1, 3.6],
                    ["upperHeight", "Высокая часть второго этажа", 2.75, 3.45],
                    ["slabThickness", "Толщина перекрытия", 0.12, 0.4],
                    ["leftKneeHeight", "Низкая точка слева", 1.5, 2.6],
                    ["rightKneeHeight", "Низкая точка справа", 1.5, 2.6],
                    ["southRightKneeHeight", "Скос в нижней комнате", 1.5, 2.6],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label className="parameter" key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={0.01}
                      value={spec.parameters[key]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= min && v <= max)
                          setSpec((s) => ({ ...s, parameters: { ...s.parameters, [key]: v } }));
                      }}
                    />
                    <small>м</small>
                  </label>
                ))}
                <h3 className="parameter-heading">Гараж</h3>
                {(
                  [
                    ["ceilingHeight", "Высота потолка", 2.7, 3.5],
                    ["floorOffset", "Пол относительно дома", -1, 0],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label className="parameter" key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={0.01}
                      value={spec.garage[key]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= min && v <= max)
                          setSpec((s) => ({ ...s, garage: { ...s.garage, [key]: v } }));
                      }}
                    />
                    <small>м</small>
                  </label>
                ))}
                <div className="setting-note">
                  Ворота: 5,20 × 2,70 м. Отметка пола гаража предварительная; её можно уточнить
                  здесь после обмера.
                </div>
                <div className="setting-note">
                  Лестница: {spec.staircase.lowerTreads} + площадка + {spec.staircase.upperTreads}{" "}
                  проступей. Подъёмов: {stairLayout(spec).totalRisers}, по{" "}
                  {ru(
                    ((spec.parameters.groundHeight + spec.parameters.slabThickness) /
                      stairLayout(spec).totalRisers) *
                      1000,
                    0,
                  )}{" "}
                  мм. Число проступей подтверждено владельцем; точные размеры площадки и маршей
                  требуют обмера.
                </div>
                <div className="modal-actions">
                  <button onClick={() => setSpec(originalSpec)}>
                    <RotateCcw size={16} />
                    Сбросить
                  </button>
                  <button className="primary" onClick={exportJSON}>
                    <Download size={16} />
                    Сохранить JSON
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="modal-intro">
                  Геометрия помещений — по «черновому плану». Старый проект дополняет сведения о
                  проёмах, скосах и лестнице. Это редактируемая основа для обсуждения интерьера;
                  неопределённые размеры перечислены ниже.
                </p>
                <div className="source-cards">
                  <a href="/plans/floor-1.jpg" target="_blank" rel="noreferrer">
                    <img src="/plans/floor-1.jpg" alt="Обмерный план первого этажа" />
                    <span>
                      Первый этаж
                      <ArrowUpRight size={16} />
                    </span>
                  </a>
                  <a href="/plans/floor-2.jpg" target="_blank" rel="noreferrer">
                    <img src="/plans/floor-2.jpg" alt="Обмерный план второго этажа" />
                    <span>
                      Второй этаж
                      <ArrowUpRight size={16} />
                    </span>
                  </a>
                </div>
                {spec.assumptions.map((a) => (
                  <article className="assumption" key={a.id}>
                    <h3>{a.title}</h3>
                    <p>{a.text}</p>
                  </article>
                ))}
                <div className="modal-actions">
                  <button onClick={exportJSON}>
                    <Download size={16} />
                    Параметры JSON
                  </button>
                  <button className="primary" onClick={exportGLB}>
                    <Download size={16} />
                    Модель GLB
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
