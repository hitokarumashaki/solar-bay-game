// Wanted system + police. Crimes raise the wanted level (0-5 stars); it decays when the
// player lays low. Police cars spawn on nearby roads and ram-chase the player; when the
// player is on foot, officers get out and chase — if one holds contact for ~2 s the player
// is BUSTED. Wanted stars and the nearest police distance drive the HUD and the siren.
import * as THREE from 'three';
import { createCar, placeCar, driveCar, separateCars } from './vehicles.js';
import { pick, range } from './random.js';

export function createWanted() {
  return { level: 0, quiet: 0, bustedTimer: 0 };
}

export function addWanted(wanted, amount) {
  wanted.level = Math.min(5, wanted.level + amount);
  wanted.quiet = 0;
}

export function createPolice(scene, rng) {
  return { cars: [], officers: [], rng, spawnTimer: 0 };
}

// An officer on foot: same low-poly figure, dark uniform, chases the player.
function officerModel(scene) {
  const g = new THREE.Group();
  const uni = new THREE.MeshLambertMaterial({ color: 0x1c2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), uni);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.y = 1.74;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0x101828 }));
  cap.position.y = 1.98;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.76, 0.24), uni);
  legL.position.set(-0.16, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  scene.add(g);
  return { group: g, legL, legR, x: 0, z: 0, heading: 0, phase: 0 };
}

export function updatePolice(police, wanted, dt, collideCircle, player, playerCar, scene) {
  const px = playerCar ? playerCar.x : player.x;
  const pz = playerCar ? playerCar.z : player.z;
  // Decay: lay low with no police near and no new crime for a while.
  let nearest = Infinity;
  for (const car of police.cars) nearest = Math.min(nearest, Math.hypot(car.x - px, car.z - pz));
  for (const off of police.officers) nearest = Math.min(nearest, Math.hypot(off.x - px, off.z - pz));
  if (wanted.level > 0) {
    wanted.quiet += dt;
    if (wanted.quiet > 22 && nearest > 45) {
      wanted.level -= 1;
      wanted.quiet = 0;
    }
  }
  // Spawn police cars up to the wanted level.
  const wantCars = wanted.level;
  police.spawnTimer -= dt;
  if (police.cars.length < wantCars && police.spawnTimer <= 0) {
    police.spawnTimer = 1.2;
    const car = createCar(scene, 0x1a1c20, true);
    const angle = range(police.rng, 0, Math.PI * 2);
    const sx = px + Math.sin(angle) * 70;
    const sz = pz + Math.cos(angle) * 70;
    const hit = collideCircle(sx, sz, 2);
    placeCar(car, hit.x, hit.z, Math.atan2(px - hit.x, pz - hit.z));
    police.cars.push(car);
  }
  // Chase: steer straight at the player, full throttle; ram by separation.
  for (const car of police.cars) {
    const dx = px - car.x;
    const dz = pz - car.z;
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    driveCar(car, { throttle: 1, steer, handbrake: false }, dt, collideCircle);
    if (playerCar) separateCars(car, playerCar);
    // On foot: an officer bails out when the police car gets close.
    if (!playerCar && Math.hypot(dx, dz) < 7 && police.officers.length < wanted.level) {
      const off = officerModel(scene);
      off.x = car.x + 2;
      off.z = car.z + 2;
      police.officers.push(off);
    }
  }
  // Officers chase on foot; holding contact ~2 s busts the player.
  let busted = false;
  for (const off of police.officers) {
    const dx = player.x - off.x;
    const dz = player.z - off.z;
    const d = Math.hypot(dx, dz);
    const speed = 6.4;
    if (d > 0.5) {
      off.x += (dx / d) * speed * dt;
      off.z += (dz / d) * speed * dt;
    }
    off.heading = Math.atan2(dx, dz);
    off.phase += dt * 11;
    off.legL.rotation.x = Math.sin(off.phase) * 0.55;
    off.legR.rotation.x = -Math.sin(off.phase) * 0.55;
    off.group.position.set(off.x, 0, off.z);
    off.group.rotation.y = off.heading;
    if (d < 1.4) {
      wanted.bustedTimer += dt;
      if (wanted.bustedTimer > 2) busted = true;
    }
  }
  if (nearest > 3) wanted.bustedTimer = Math.max(0, wanted.bustedTimer - dt);
  // Despawn police that fell far behind when the heat is off.
  if (wanted.level === 0) {
    for (const car of police.cars) scene.remove(car.group);
    for (const off of police.officers) scene.remove(off.group);
    police.cars.length = 0;
    police.officers.length = 0;
  }
  return { busted, nearestPolice: nearest };
}
