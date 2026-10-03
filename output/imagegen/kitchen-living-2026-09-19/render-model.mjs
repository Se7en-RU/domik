import fs from 'node:fs';
import * as THREE from 'three';
import {buildHouse} from '../../../lib/model.mjs';
import {rasterize} from '../../../scripts/ai/raster.mjs';

// Geometry is taken unchanged from the shared house generator.
const spec = JSON.parse(fs.readFileSync(new URL('../../../lib/house.json', import.meta.url)));
const {root} = buildHouse(spec);
root.updateMatrixWorld(true);
const views = [
  {name:'living-model',position:[4.9,1.65,1.2],target:[.8,1.4,2.2]},
  {name:'kitchen-model',position:[3.25,1.65,1.9],target:[7.8,1.4,2.1]},
];
for (const view of views) {
  const camera = new THREE.PerspectiveCamera(65, 1.5, .05, 100);
  camera.position.set(...view.position);
  camera.lookAt(...view.target);
  camera.updateMatrixWorld(true);
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const scene = new THREE.Scene();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.floor!==1 || mesh.userData.kind==='electrical') return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    // Clip triangles to the camera near plane before perspective projection.
    const positions = geometry.attributes.position, vertices=[];
    const distance = p => p.clone().sub(camera.position).dot(forward)-camera.near;
    for(let i=0;i<positions.count;i+=3) {
      const polygon=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j));
      const clipped=[];
      for(let j=0;j<3;j++) {
        const a=polygon[j], b=polygon[(j+1)%3], da=distance(a), db=distance(b);
        if(da>=0) clipped.push(a);
        if((da>=0)!==(db>=0)) clipped.push(a.clone().lerp(b,da/(da-db)));
      }
      for(let j=1;j<clipped.length-1;j++) for(const p of [clipped[0],clipped[j],clipped[j+1]]) vertices.push(p.x,p.y,p.z);
    }
    geometry.dispose();
    const clippedGeometry=new THREE.BufferGeometry();
    clippedGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const material=mesh.material.clone();
    if(mesh.userData.kind==='wall') material.color.set('#eee9df');
    if(mesh.userData.kind==='ceiling') {material.color.set('#ffffff');material.transparent=false;material.opacity=1;}
    if(mesh.userData.kind==='floor') material.color.set('#cbb99b');
    scene.add(new THREE.Mesh(clippedGeometry,material));
  });
  fs.writeFileSync(new URL(view.name+'.png',import.meta.url),rasterize(scene,camera,1536,1024));
}
fs.writeFileSync(new URL('cameras.json',import.meta.url),JSON.stringify({revision:spec.revision,views},null,2));
