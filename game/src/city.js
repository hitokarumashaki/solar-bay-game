// Solar Bay: the city itself. A 400x400 road grid (roads every 40 units), 64 blocks of
// buildings, parks and parking lots, a beach and ocean on the south edge, palm trees and
// streetlights, one sun with shadows and a time-of-day sky. Exports the collision boxes
// (buildings) and the road network (traffic + minimap), plus setTimeOfDay.
import * as THREE from 'three';
import { pick, range, rangeInt } from './random.js';

export const CITY_HALF = 200;
export const ROAD_AT = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_HALF = 5;
export const BLOCK_CENTERS = [-140, -100, -60, -20, 20, 60, 100, 140];
export const BOUND = { minX: -188, maxX: 188, minZ: -188, maxZ: 204 };

const BUILDING_COLORS = [0xf2e3c6, 0xe8b4a0, 0x9fc8c0, 0xf7f0e0, 0xd9a441, 0x7fb3d5, 0xe07a5f, 0xffffff];

const WALL_COLORS = ['#cbb89a', '#b8a88e', '#d8cbb0', '#a89a80', '#c4b49a'];

function windowTexture(random, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = pick(random, WALL_COLORS);
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = random() < litRatio;
      g.fillStyle = lit ? (random() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#161c26';
      g.fillRect(6 + col * 20, 8 + row * 20, 13, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const parks = [];
  const parkingLots = [];
  const buildings = [];

  const sun = new THREE.DirectionalLight(0xffe0b0, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.0);
  scene.add(hemi);

  // Ground: sidewalk-grey base; roads, parks and sand are planes laid over it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads: dark asphalt strips, with a dashed centre line.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c0 });
  const dashGeo = new THREE.BoxGeometry(0.6, 0.02, 4);
  for (const z of ROAD_AT) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_HALF * 2), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, z);
    road.receiveShadow = true;
    scene.add(road);
    for (let x = -190; x < 190; x += 16) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(x, 0.04, z);
      scene.add(dash);
    }
  }
  for (const x of ROAD_AT) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 400), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    scene.add(road);
    for (let z = -190; z < 190; z += 16) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.y = Math.PI / 2;
      dash.position.set(x, 0.04, z);
      scene.add(dash);
    }
  }

  // Beach + ocean on the south edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 46),
    new THREE.MeshLambertMaterial({ color: 0xe8d5a8 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, 192);
  sand.receiveShadow = true;
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 140),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.05, 285);
  scene.add(ocean);
  // Boardwalk strip between the last road and the sand.
  const boardwalk = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 10),
    new THREE.MeshLambertMaterial({ color: 0xa08050 }),
  );
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(0, 0.03, 168);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);

  // Window materials: 3 shared textures x repeats, picked by building height.
  const winTex = [windowTexture(rng, 0.45), windowTexture(rng, 0.3), windowTexture(rng, 0.55)];
  const repeats = [[1, 1], [2, 2], [2, 4], [3, 6]];
  const winMats = [];
  for (const tex of winTex) {
    for (const [rx, ry] of repeats) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      winMats.push(new THREE.MeshLambertMaterial({ map: t }));
    }
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a28 });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0.9 });

  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 5 * s, 6), trunkMat);
    trunk.position.y = 2.5 * s;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 2.6 * s, 4), palmMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1 * s, 5.2 * s, Math.sin(a) * 1.1 * s);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function streetlight(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), poleMat);
    pole.position.y = 2.7;
    g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
    lamp.position.y = 5.5;
    g.add(lamp);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  // Blocks: buildings, parks, parking lots.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const roll = rng();
      if (roll < 0.14) {
        // Park: grass + palms.
        const grass = new THREE.Mesh(
          new THREE.PlaneGeometry(30, 30),
          new THREE.MeshLambertMaterial({ color: 0x6a9a55 }),
        );
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(bx, 0.03, bz);
        grass.receiveShadow = true;
        scene.add(grass);
        for (let i = 0; i < 4; i += 1) palm(bx + range(rng, -11, 11), bz + range(rng, -11, 11), range(rng, 0.8, 1.3));
        parks.push({ x: bx, z: bz });
        continue;
      }
      if (roll < 0.26) {
        // Parking lot: asphalt + a few parked cars (stealable) placed later by traffic.
        const lot = new THREE.Mesh(
          new THREE.PlaneGeometry(30, 30),
          new THREE.MeshLambertMaterial({ color: 0x55595f }),
        );
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(bx, 0.03, bz);
        lot.receiveShadow = true;
        scene.add(lot);
        parkingLots.push({ x: bx, z: bz });
        continue;
      }
      const w = range(rng, 14, 24);
      const d = range(rng, 14, 24);
      const h = range(rng, 9, 42);
      const color = pick(rng, BUILDING_COLORS);
      const winMat = winMats[rangeInt(rng, 0, winMats.length - 1)];
      const mats = [winMat, winMat, roofMat, roofMat, winMat, winMat];
      const mesh = new THREE.Mesh(boxGeo, mats);
      mesh.scale.set(w, h, d);
      mesh.position.set(bx, h / 2, bz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      // A tinted top box so flat roofs read as separate floors.
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.55, 1.2, d * 0.55),
        new THREE.MeshLambertMaterial({ color }),
      );
      cap.position.set(bx, h + 0.6, bz);
      cap.castShadow = true;
      scene.add(cap);
      colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      buildings.push({ x: bx, z: bz, w, d, h });
    }
  }

  // Palms along the boardwalk + streetlights at every other intersection.
  for (let x = -180; x <= 180; x += 30) palm(x, 172, 1.1);
  for (const x of ROAD_AT) {
    for (const z of ROAD_AT) {
      if ((x + z) % 80 === 0) streetlight(x + 6.5, z + 6.5);
    }
  }
  // Beach umbrellas.
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xff5a3c });
  const umbMat2 = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
  for (let i = 0; i < 6; i += 1) {
    const x = -150 + i * 60 + range(rng, -8, 8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), poleMat);
    pole.position.set(x, 1.2, 188);
    scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 8), i % 2 ? umbMat : umbMat2);
    top.position.set(x, 2.7, 188);
    top.castShadow = true;
    scene.add(top);
  }

  // Push a circle (x, z, radius) out of every building box; clamp to the playable bounds.
  // Returns { x, z, hit }.
  function collideCircle(x, z, r) {
    let hit = false;
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration axis.
          const pl = x - (c.minX - r);
          const pr = c.maxX + r - x;
          const pt = z - (c.minZ - r);
          const pb = c.maxZ + r - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - r;
          else if (m === pr) x = c.maxX + r;
          else if (m === pt) z = c.minZ - r;
          else z = c.maxZ + r;
        }
      }
    }
    if (x < BOUND.minX) { x = BOUND.minX; hit = true; }
    if (x > BOUND.maxX) { x = BOUND.maxX; hit = true; }
    if (z < BOUND.minZ) { z = BOUND.minZ; hit = true; }
    if (z > BOUND.maxZ) { z = BOUND.maxZ; hit = true; }
    return { x, z, hit };
  }

  // Time of day: 0 dawn, 0.5 noon, 0.75 golden hour, 0.95 sunset. Static per scene.
  const SKY = [
    { t: 0.0, sun: [-160, 40, 60], color: 0xff9a5c, sky: 0xe8a06a, fog: 0xd89a72, sunI: 0.9, hemiI: 0.5 },
    { t: 0.5, sun: [60, 220, 80], color: 0xfff2d8, sky: 0x87b5e0, fog: 0x9fc3e0, sunI: 1.35, hemiI: 0.85 },
    { t: 0.75, sun: [-170, 70, 90], color: 0xffb36b, sky: 0xf7b06a, fog: 0xe8a868, sunI: 1.15, hemiI: 0.7 },
    { t: 0.95, sun: [-200, 26, 70], color: 0xff7a3c, sky: 0xd96a6a, fog: 0xc97a6a, sunI: 0.9, hemiI: 0.55 },
  ];
  function setTimeOfDay(t) {
    let a = SKY[0];
    let b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i += 1) {
      if (t >= SKY[i].t && t <= SKY[i + 1].t) { a = SKY[i]; b = SKY[i + 1]; break; }
    }
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    const lerp = (u, v) => u + (v - u) * f;
    sun.position.set(lerp(a.sun[0], b.sun[0]), lerp(a.sun[1], b.sun[1]), lerp(a.sun[2], b.sun[2]));
    sun.color.setHex(a.color).lerp(new THREE.Color(b.color), f);
    sun.intensity = lerp(a.sunI, b.sunI);
    hemi.intensity = lerp(a.hemiI, b.hemiI);
    scene.background = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), f);
    scene.fog = new THREE.Fog(new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), f), 120, 520);
  }
  setTimeOfDay(0.75);

  return { colliders, parks, parkingLots, buildings, collideCircle, setTimeOfDay, sun };
}
