export type Point = [number, number];
export interface FaceOpening {
  id: string;
  start: number;
  width: number;
  height: number;
  sill: number;
  kind?: string;
}
export interface RoomWallFace {
  id: string;
  roomId: string;
  roomName: string;
  number: number;
  floor: number;
  a: Point;
  b: Point;
  normal: Point;
  length: number;
  component: string;
  t: number;
  thicknesses: number[];
  wallIds: string[];
  openings: FaceOpening[];
  roofZone: string;
}
export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DimensionLabel {
  id: string;
  faceId: string;
  a: Point;
  b: Point;
  normal: Point;
  polygon: number[][];
  text: string;
  kind: string;
  priority?: number;
}
export interface PlacedDimensionLabel extends DimensionLabel {
  x: number;
  y: number;
  vertical: boolean;
  box: LabelBox;
  width: number;
  height: number;
}
export function roomWallFaces(spec: unknown): RoomWallFace[];
export function pointInPolygon(
  point: readonly number[],
  polygon: readonly (readonly number[])[],
): boolean;
export function placeDimensionLabels(
  candidates: DimensionLabel[],
  obstacles: LabelBox[],
  unitsPerPixel: number,
): PlacedDimensionLabel[];

export function roomInteriorPolygon(
  room: { polygon: number[][]; id: string },
  spec: unknown,
): number[][];
