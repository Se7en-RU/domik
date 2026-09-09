"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildHouse, polygonArea, upperHeightAt } from "../lib/model.mjs";
import originalSpec from "../lib/house.json";
import { garageWalls, roomFloorOffset, roomHeight, stairLayout } from "../lib/layout.mjs";
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
      a: [stair.turnX, stair.z + stair.lowerWidth],
      b: [stair.entryX, stair.z + stair.lowerWidth],
      t: stair.dividerThickness,
      floor: 1,
      component: "stair",
      height: stair.parapetHeight,
    },
    {
      id: "F2-STAIR-PARAPET",
      a: [stair.entryX, stair.z],
      b: [stair.entryX, stair.z + stair.lowerWidth],
      t: 0.05,
      floor: 2,
      component: "stair",
      height: stair.parapetHeight,
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
  if (wall.component === "garage") return spec.garage.ceilingHeight;
  if (wall.component === "stair") return wall.height ?? stairLayout(spec).parapetHeight;
  if (wall.floor === 1) return wall.height ?? spec.parameters.groundHeight;
  const [x, z] = wallPoint(wall, distance);
  return upperHeightAt(
    x,
    z,
    spec.parameters,
    ["F2-W04", "F2-W05", "F2-W14", "F2-W15"].includes(wall.id) ? "south" : "main",
  );
};
const dimensionNumber = (value: number, unit: "mm" | "m") =>
  unit === "mm" ? `${Math.round(value * 1000)} мм` : `${ru(value, 2)} м`;
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
  const [layers, setLayers] = useState({
    walls: true,
    openings: true,
    heights: true,
    thickness: false,
    stairs: true,
  });
  const [selectedWall, setSelectedWall] = useState("");
  const [viewBox, setViewBox] = useState<[number, number, number, number]>([-1, -1, 15, 18]);
  const drag = useRef<{ x: number; y: number; box: [number, number, number, number] } | null>(null);
  // Stable dependencies keep the fit effect from resetting the view on every selection/pan.
  const rooms = useMemo(
    () => spec.rooms.filter((r) => floor === "all" || r.floor === Number(floor)),
    [spec.rooms, floor],
  );
  const walls = useMemo(
    () => wallSet(spec).filter((w) => floor === "all" || w.floor === Number(floor)),
    [spec, floor],
  );
  const selectedRoom = spec.rooms.find((r) => r.id === selected);
  const selectedWallData = walls.find((w) => w.id === selectedWall);
  const fit = useCallback(
    (roomId = selected) => {
      const target = spec.rooms.find((r) => r.id === roomId);
      const points = target ? target.polygon : rooms.flatMap((r) => r.polygon);
      if (!points.length) return;
      const xs = points.map((p) => p[0]),
        zs = points.map((p) => p[1]);
      const pad = target ? 1.1 : 1.5;
      setViewBox([
        Math.min(...xs) - pad,
        Math.min(...zs) - pad,
        Math.max(...xs) - Math.min(...xs) + pad * 2,
        Math.max(...zs) - Math.min(...zs) + pad * 2,
      ]);
    },
    [rooms, selected, spec.rooms],
  );
  useEffect(() => fit(), [fit, floor]);
  const zoom = (factor: number) => {
    setViewBox(([x, y, w, h]) => [
      x + (w * (1 - factor)) / 2,
      y + (h * (1 - factor)) / 2,
      w * factor,
      h * factor,
    ]);
  };
  const panStart = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, box: viewBox };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const panMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const [, , w, h] = drag.current.box;
    const scale = Math.max(w / rect.width, h / rect.height);
    const dx = (e.clientX - drag.current.x) * scale,
      dy = (e.clientY - drag.current.y) * scale;
    setViewBox([drag.current.box[0] - dx, drag.current.box[1] - dy, w, h]);
  };
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`)}\n`;
    save(
      new Blob([source], { type: "image/svg+xml" }),
      `размеры-${floor === "all" ? "дома" : `${floor}-этажа`}.svg`,
    );
  };
  const setLayer = (key: keyof typeof layers) =>
    setLayers((value) => ({ ...value, [key]: !value[key] }));
  const roomFill = (room: (typeof spec.rooms)[number]) =>
    room.id === selected ? "#9ed7e5" : room.floor === 2 ? "#e5f0f3" : "#f5f8f9";
  return (
    <div className="dimensions-view">
      <div className="dimensions-toolbar">
        <div>
          <span className="eyebrow">ОБМЕРНЫЙ РЕЖИМ</span>
          <h2>Размеры по модели</h2>
        </div>
        <div className="dimensions-actions">
          <button
            className="dimension-action"
            onClick={() => {
              onSelect("");
              fit("");
            }}
          >
            <Maximize size={16} /> Весь план
          </button>
          <button className="dimension-action" onClick={exportSvg}>
            <Download size={16} /> SVG
          </button>
          <div className="unit-switch" aria-label="Единицы">
            <button className={unit === "mm" ? "active" : ""} onClick={() => setUnit("mm")}>
              мм
            </button>
            <button className={unit === "m" ? "active" : ""} onClick={() => setUnit("m")}>
              м
            </button>
          </div>
        </div>
      </div>
      <div className="dimensions-content">
        <div className="dimensions-canvas-wrap">
          <div className="dimensions-note">
            <Ruler size={15} /> Нажмите на помещение или стену. Панорамирование — перетаскивание,
            масштаб — колесо.
          </div>
          <svg
            ref={svgRef}
            className="dimension-plan"
            viewBox={viewBox.join(" ")}
            role="img"
            aria-label="План с размерами стен и проёмов"
            onPointerDown={panStart}
            onPointerMove={panMove}
            onPointerUp={() => {
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
                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dbe7eb" strokeWidth="0.018" />
              </pattern>
            </defs>
            <rect
              x={viewBox[0] - 30}
              y={viewBox[1] - 30}
              width={viewBox[2] + 60}
              height={viewBox[3] + 60}
              fill="url(#dim-grid)"
            />
            {rooms.map((room) => {
              const centroid = room.polygon
                .reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0])
                .map((v) => v / room.polygon.length);
              return (
                <g
                  key={room.id}
                  className="dimension-room"
                  onClick={() => {
                    onSelect(room.id);
                    fit(room.id);
                  }}
                >
                  <polygon
                    points={room.polygon.map((p) => p.join(",")).join(" ")}
                    fill={roomFill(room)}
                    stroke="#7a98a5"
                    strokeWidth="0.035"
                  />
                  <text
                    x={room.label[0]}
                    y={room.label[1]}
                    className="room-dimension-label"
                    textAnchor="middle"
                  >
                    {room.name.replace(" · 1 этаж", "").replace(" · 2 этаж", "")}
                  </text>
                  {layers.heights && (
                    <text
                      x={room.label[0]}
                      y={room.label[1] + 0.28}
                      className="room-height-label"
                      textAnchor="middle"
                    >
                      H {dimensionNumber(roomHeight(room, spec), unit)}
                      {room.floor === 2
                        ? ` · низ ${dimensionNumber(Math.min(...room.polygon.map((p) => upperHeightAt(p[0], p[1], spec.parameters, room.id === "F2-ROOM" ? "south" : "main"))), unit)}`
                        : ""}
                    </text>
                  )}
                  {room.polygon.map((a, i) => {
                    const b = room.polygon[(i + 1) % room.polygon.length],
                      dx = b[0] - a[0],
                      dz = b[1] - a[1],
                      len = Math.hypot(dx, dz);
                    if (len < 0.3) return null;
                    const mx = (a[0] + b[0]) / 2,
                      mz = (a[1] + b[1]) / 2;
                    const nx = -dz / len,
                      nz = dx / len;
                    const sign = (centroid[0] - mx) * nx + (centroid[1] - mz) * nz > 0 ? -1 : 1;
                    const ox = nx * 0.17 * sign,
                      oz = nz * 0.17 * sign;
                    return (
                      <g key={`${room.id}-edge-${i}`} className="room-dim">
                        <line x1={a[0] + ox} y1={a[1] + oz} x2={b[0] + ox} y2={b[1] + oz} />
                        <text x={mx + ox} y={mz + oz - 0.04} textAnchor="middle">
                          {dimensionNumber(len, unit)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {layers.walls &&
              walls.map((wall) => {
                const len = wallLength(wall),
                  mid = wallPoint(wall, len / 2),
                  dx = wall.b[0] - wall.a[0],
                  dz = wall.b[1] - wall.a[1],
                  n = Math.hypot(dx, dz) || 1;
                const nx = -dz / n,
                  nz = dx / n;
                return (
                  <g
                    key={wall.id}
                    className={`dimension-wall ${selectedWall === wall.id ? "selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedWall === wall.id}
                    aria-label={`Стена ${wall.id}, длина ${dimensionNumber(len, unit)}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setSelectedWall(wall.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedWall(wall.id);
                      }
                    }}
                  >
                    <line
                      x1={wall.a[0]}
                      y1={wall.a[1]}
                      x2={wall.b[0]}
                      y2={wall.b[1]}
                      strokeWidth={Math.max(0.1, wall.t)}
                    />
                    <line
                      className="wall-focus-ring"
                      x1={wall.a[0]}
                      y1={wall.a[1]}
                      x2={wall.b[0]}
                      y2={wall.b[1]}
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      className="wall-axis"
                      x1={wall.a[0] + nx * 0.22}
                      y1={wall.a[1] + nz * 0.22}
                      x2={wall.b[0] + nx * 0.22}
                      y2={wall.b[1] + nz * 0.22}
                    />
                    <text x={mid[0] + nx * 0.31} y={mid[1] + nz * 0.31} textAnchor="middle">
                      {dimensionNumber(len, unit)}
                    </text>
                    {layers.thickness && (
                      <text
                        className="wall-thickness"
                        x={mid[0] - nx * 0.31}
                        y={mid[1] - nz * 0.31}
                        textAnchor="middle"
                      >
                        t {dimensionNumber(wall.t, unit)}
                      </text>
                    )}
                    {layers.openings &&
                      (wall.openings ?? []).map((opening) => {
                        const op = wallPoint(wall, opening.start),
                          oq = wallPoint(wall, opening.start + opening.width);
                        const om = wallPoint(wall, opening.start + opening.width / 2);
                        return (
                          <g key={opening.id} className="opening-dimension">
                            <line x1={op[0]} y1={op[1]} x2={oq[0]} y2={oq[1]} />
                            <text x={om[0] - nx * 0.28} y={om[1] - nz * 0.28} textAnchor="middle">
                              {dimensionNumber(opening.width, unit)}
                            </text>
                            <title>
                              {openingKind(opening.kind)} {opening.id}:{" "}
                              {dimensionNumber(opening.width, unit)} ×{" "}
                              {dimensionNumber(opening.height, unit)}; низ{" "}
                              {dimensionNumber(
                                opening.sill -
                                  (wall.component === "garage" ? spec.garage.floorOffset : 0),
                                unit,
                              )}
                            </title>
                          </g>
                        );
                      })}
                  </g>
                );
              })}
            {layers.stairs && (
              <g className="stair-dimension">
                <rect
                  x={stairLayout(spec).x}
                  y={stairLayout(spec).z}
                  width={stairLayout(spec).width}
                  height={stairLayout(spec).depth}
                />
                {Array.from({ length: stairLayout(spec).lowerTreads }, (_, i) => (
                  <line
                    key={`lo-${i}`}
                    x1={stairLayout(spec).entryX - i * stairLayout(spec).lowerGoing}
                    y1={stairLayout(spec).lowerZ}
                    x2={stairLayout(spec).entryX - i * stairLayout(spec).lowerGoing}
                    y2={stairLayout(spec).lowerZ + stairLayout(spec).lowerWidth}
                  />
                ))}
                {Array.from({ length: stairLayout(spec).upperTreads }, (_, i) => (
                  <line
                    key={`up-${i}`}
                    x1={stairLayout(spec).turnX + i * stairLayout(spec).upperGoing}
                    y1={stairLayout(spec).upperZ}
                    x2={stairLayout(spec).turnX + i * stairLayout(spec).upperGoing}
                    y2={stairLayout(spec).upperZ + stairLayout(spec).upperWidth}
                  />
                ))}
                <text
                  x={stairLayout(spec).x + stairLayout(spec).width / 2}
                  y={stairLayout(spec).z + stairLayout(spec).depth / 2}
                  textAnchor="middle"
                >
                  {stairLayout(spec).lowerTreads} + площадка + {stairLayout(spec).upperTreads}{" "}
                  ступеней
                </text>
                <text
                  x={stairLayout(spec).x + stairLayout(spec).width / 2}
                  y={stairLayout(spec).z + stairLayout(spec).depth / 2 + 0.28}
                  textAnchor="middle"
                >
                  подъём {dimensionNumber(stairLayout(spec).rise, unit)} · проступь{" "}
                  {dimensionNumber(stairLayout(spec).lowerGoing, unit)} /{" "}
                  {dimensionNumber(stairLayout(spec).upperGoing, unit)}
                </text>
              </g>
            )}
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
              ["walls", "Стены и длины"],
              ["openings", "Проёмы: ширина × высота"],
              ["heights", "Высоты помещений и скосов"],
              ["thickness", "Толщина стен"],
              ["stairs", "Лестница"],
            ] as const
          ).map(([key, label]) => (
            <label className="dimension-check" key={key}>
              <input type="checkbox" checked={layers[key]} onChange={() => setLayer(key)} />
              <span>{label}</span>
            </label>
          ))}
          <div className="dimension-legend">
            <i className="legend-wall" /> стена по оси <i className="legend-opening" /> проём
          </div>
          <div className="dimension-summary">
            <strong>{floor === "all" ? "Все этажи" : `${floor} этаж`}</strong>
            <span>
              {rooms.length} помещений · {walls.length} стен
            </span>
            <span>Единицы: {unit === "mm" ? "миллиметры" : "метры"}</span>
          </div>
          {selectedRoom && (
            <div className="dimension-selection">
              <span className="eyebrow">ВЫБРАНО ПОМЕЩЕНИЕ</span>
              <strong>{selectedRoom.name}</strong>
              <span>Площадь {ru(polygonArea(selectedRoom.polygon), 1)} м²</span>
              <button onClick={() => fit(selectedRoom.id)}>Приблизить к комнате</button>
            </div>
          )}
          {selectedWallData ? (
            <WallElevation
              wall={selectedWallData}
              spec={spec}
              unit={unit}
              onClose={() => setSelectedWall("")}
            />
          ) : (
            <div className="dimension-empty">
              <Ruler size={19} />
              <span>
                Выберите линию стены, чтобы открыть развёртку с высотой, простенками и проёмами.
              </span>
            </div>
          )}
          <p className="dimension-footnote">
            Размеры считаются по текущей геометрии. «≈» — исходное допущение модели; значения у
            проёмов показываются в чистом проёме.
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
  const len = wallLength(wall),
    startTop = wallTop(wall, spec, 0),
    endTop = wallTop(wall, spec, len),
    maxTop = Math.max(startTop, endTop, ...(wall.openings ?? []).map((o) => o.sill + o.height));
  const base = 3.25,
    width = len + 1.2,
    height = maxTop + 1.2;
  return (
    <section className="wall-elevation">
      <div className="wall-elevation-head">
        <div>
          <span className="eyebrow">РАЗВЁРТКА СТЕНЫ</span>
          <strong>{wall.id}</strong>
        </div>
        <button onClick={onClose} aria-label="Закрыть развёртку">
          <X size={16} />
        </button>
      </div>
      <svg
        viewBox={`-0.65 -0.65 ${width} ${height}`}
        role="img"
        aria-label={`Развёртка стены ${wall.id}`}
      >
        <line className="elevation-base" x1={0} y1={base} x2={len} y2={base} />
        <polygon
          className="elevation-wall"
          points={`0,${base - startTop} ${len},${base - endTop} ${len},${base} 0,${base}`}
        />
        <line className="elevation-height" x1={-0.25} y1={base} x2={-0.25} y2={base - startTop} />
        <text x={-0.31} y={base - startTop / 2} textAnchor="end">
          {dimensionNumber(startTop, unit)}
        </text>
        <line className="elevation-length" x1={0} y1={base + 0.36} x2={len} y2={base + 0.36} />
        <text x={len / 2} y={base + 0.62} textAnchor="middle">
          L {dimensionNumber(len, unit)} · t {dimensionNumber(wall.t, unit)}
        </text>
        {(wall.openings ?? []).map((o) => {
          const x = o.start,
            h = o.height,
            sill = o.sill - (wall.component === "garage" ? spec.garage.floorOffset : 0);
          return (
            <g className="elevation-opening" key={o.id}>
              <rect x={x} y={base - sill - h} width={o.width} height={h} />
              <text x={x + o.width / 2} y={base - sill - h - 0.12} textAnchor="middle">
                {openingKind(o.kind)} {dimensionNumber(o.width, unit)} × {dimensionNumber(h, unit)}
              </text>
              <text x={x + o.width / 2} y={base + 0.2} textAnchor="middle">
                низ {dimensionNumber(sill, unit)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="wall-elevation-note">
        Отметка высоты дана от пола соответствующего этажа; для гаража учитывается предварительный
        перепад −0,35 м.
      </div>
    </section>
  );
}
function Scene({
  spec,
  floor,
  view,
  split,
  ceilings,
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
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      home();
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
        o.visible = onFloor && (k === "ceiling" ? s.ceilings : k === "window" ? s.windows : true);
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
            <p>Дом и гараж · 09.09.2026</p>
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
            {view !== "dimensions" && <span className="scale-tag">Метры · без мебели</span>}
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
