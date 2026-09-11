import * as THREE from "three";
import { rasterize } from "./raster.mjs";
import { svgPage } from "./drawings.mjs";

// Clip original wall triangles at the room's internal corners. Never reconstruct walls from a plan.
function clippedGeometry(mesh, face) {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  source.applyMatrix4(mesh.matrixWorld);
  if (!face) return source;
  const ux = (face.b[0] - face.a[0]) / face.length,
    uz = (face.b[1] - face.a[1]) / face.length;
  const along = (p) => (p.x - face.a[0]) * ux + (p.z - face.a[1]) * uz;
  const positions = source.attributes.position,
    vertices = [];
  for (let i = 0; i < positions.count; i += 3) {
    let polygon = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(positions, i + j));
    for (const distance of [(p) => along(p), (p) => face.length - along(p)]) {
      const output = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % polygon.length],
          da = distance(a),
          db = distance(b);
        if (da >= -1e-8) output.push(a);
        if (da >= 0 !== db >= 0) output.push(a.clone().lerp(b, da / (da - db)));
      }
      polygon = output;
    }
    for (let j = 1; j < polygon.length - 1; j++)
      for (const p of [polygon[0], polygon[j], polygon[j + 1]]) vertices.push(p.x, p.y, p.z);
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
export function roomScene(root, packet, direction) {
  const scene = new THREE.Scene();
  root.updateMatrixWorld(true);
  const faces = packet.faces.filter(
    (f) => f.normal[0] * direction[0] + f.normal[1] * direction[1] >= -1e-6,
  );
  const add = (mesh, face) => {
    const geometry = clippedGeometry(mesh, face);
    if (!geometry.attributes.position.count) {
      geometry.dispose();
      return;
    }
    scene.add(new THREE.Mesh(geometry, mesh.material));
  };
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const d = mesh.userData;
    if (d.floor !== packet.room.floor) return;
    if (d.kind === "ceiling" || d.kind === "slab" || d.kind === "electrical") return;
    if (d.roomId === packet.room.id) {
      add(mesh);
      return;
    }
    if (d.kind === "wall") {
      for (const f of faces.filter((f) => f.wallIds.includes(d.wallId))) add(mesh, f);
    }
    if (d.kind === "window") {
      const f = faces.find((f) =>
        f.openings.some((o) => mesh.name === o.id || mesh.name.startsWith(o.id + "-")),
      );
      if (f) add(mesh, f);
    }
    if (packet.room.id === "F1-STAIR" && (d.kind === "stairs" || d.wallId === "F1-W13")) add(mesh);
  });
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const light = new THREE.DirectionalLight(0xffffff, 1.8);
  light.position.set(-4, 12, 8);
  scene.add(light);
  return scene;
}
export function viewSvg(root, packet, index) {
  let scene;
  try {
    const direction = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ][index];
    scene = roomScene(root, packet, direction);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
    const box = new THREE.Box3().setFromObject(scene),
      center = box.getCenter(new THREE.Vector3());
    camera.position
      .copy(center)
      .add(new THREE.Vector3(direction[0], 1.1, direction[1]).normalize().multiplyScalar(35));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const corners = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          corners.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const horizontal = Math.max(...corners.map((p) => Math.abs(p.x))),
      vertical = Math.max(...corners.map((p) => Math.abs(p.y)));
    const half = Math.max(vertical, horizontal / (1200 / 850)) * 1.12;
    camera.left = (-half * 1200) / 850;
    camera.right = -camera.left;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    const raster = rasterize(scene, camera, 1600, 1134).toString("base64");
    return svgPage(
      1200,
      960,
      `<text x="35" y="40" font-size="25">${packet.room.id} · 3D ${index + 1} · X${direction[0] > 0 ? "+" : "−"} Z${direction[1] > 0 ? "+" : "−"}</text><image x="0" y="55" width="1200" height="850" href="data:image/png;base64,${raster}"/><text x="35" y="925" font-size="18">Потолок и ближние стены скрыты для обзора. Геометрия и мебель — из модели.</text>`,
    );
  } finally {
    scene?.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}
