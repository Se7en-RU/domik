import * as THREE from "three";
import { zlibSync } from "fflate";

// A small orthographic z-buffer renderer: unlike SVG painter sorting, it handles
// intersecting wall/furniture triangles without drawing back faces over the front.
export function rasterize(scene, camera, width, height) {
  const pixels = new Uint8Array(width * height * 4).fill(255),
    depth = new Float64Array(width * height).fill(Infinity);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 248;
    pixels[i + 1] = 250;
    pixels[i + 2] = 252;
  }
  const meshes = scene.children
    .filter((m) => m.isMesh)
    .sort((a, b) => Number(a.material.transparent) - Number(b.material.transparent));
  const towardCamera = camera.position
    .clone()
    .sub(camera.getWorldDirection(new THREE.Vector3()).add(camera.position))
    .normalize();
  const light = new THREE.Vector3(-0.4, 1, 0.7).normalize();
  for (const mesh of meshes) {
    const positions = mesh.geometry.attributes.position,
      material = mesh.material;
    const base = material.color.clone().convertLinearToSRGB();
    for (let i = 0; i < positions.count; i += 3) {
      const world = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(positions, i + j));
      const normal = new THREE.Vector3()
        .subVectors(world[1], world[0])
        .cross(new THREE.Vector3().subVectors(world[2], world[0]))
        .normalize();
      if (normal.dot(towardCamera) < 0) normal.negate();
      const intensity = 0.57 + 0.43 * Math.max(0, normal.dot(light));
      const color = [base.r, base.g, base.b].map((c) => Math.round(c * intensity * 255));
      const vertices = world
        .map((p) => p.project(camera))
        .map((p) => [((p.x + 1) * width) / 2, ((1 - p.y) * height) / 2, p.z]);
      const [a, b, c] = vertices;
      const edge = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      const area = edge(a, b, c[0], c[1]);
      if (Math.abs(area) < 1e-10) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
        maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
        maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const u = edge(b, c, x + 0.5, y + 0.5) / area,
            v = edge(c, a, x + 0.5, y + 0.5) / area,
            w = 1 - u - v;
          if (u < 0 || v < 0 || w < 0) continue;
          const z = u * a[2] + v * b[2] + w * c[2],
            index = y * width + x;
          if (z < -1 || z > 1 || z >= depth[index]) continue;
          const alpha = material.transparent ? material.opacity : 1;
          for (let ch = 0; ch < 3; ch++)
            pixels[index * 4 + ch] = Math.round(
              color[ch] * alpha + pixels[index * 4 + ch] * (1 - alpha),
            );
          if (material.depthWrite !== false) depth[index] = z;
        }
    }
  }
  return encodePng(width, height, pixels);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const chunk = (name, data) => {
  const type = Buffer.from(name),
    payload = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  payload.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
};
export function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    scanlines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", Buffer.from(zlibSync(scanlines))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
