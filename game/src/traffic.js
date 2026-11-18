// Traffic and pedestrians. Traffic cars walk the road graph: each drives to the next
// intersection, then picks straight/left/right, staying on the right side of the road.
// Pedestrians walk the sidewalk edge around a block; they flee from nearby cars and fall
// (then get up) when hit. Parked cars sit in parking lots and can be stolen.
import * as THREE from 'three';
import { ROAD_AT } from './city.js';
import { CAR_COLORS, createCar, placeCar, syncCar, CAR_RADIUS } from './vehicles.js';
import { pick, range, rangeInt, shuffle } from './random.js';

const TRAFFIC_COUNT = 10;
const PED_COUNT = 16;
const PARKED_COUNT = 8;

function pedModel(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a06a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.66, 0.32), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
  head.position.y = 1.68;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pants);
  legL.position.set(-0.15, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  return { group: g, legL, legR };
}

export function createTraffic(scene, city, rng) {
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const car = createCar(scene, pick(rng, CAR_COLORS), false);
    const road = pick(rng, ROAD_AT);
    const alongX = rng() < 0.5;
    const coord = range(rng, -160, 160);
    if (alongX) placeCar(car, coord, road, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    else placeCar(car, road, coord, rng() < 0.5 ? 0 : Math.PI);
    car.cruise = range(rng, 8, 12);
    car.stopped = 0;
    cars.push(car);
  }
  const parked = [];
  // Shuffle the lots so a different set of blocks gets parked cars each seed.
  const lots = shuffle(rng, city.parkingLots.slice());
  for (const lot of lots.slice(0, PARKED_COUNT)) {
    const car = createCar(scene, pick(rng, CAR_COLORS), false);
    placeCar(car, lot.x + range(rng, -8, 8), lot.z + range(rng, -8, 8), range(rng, 0, Math.PI * 2));
    car.parked = true;
    parked.push(car);
  }
  const peds = [];
  const pedColors = [0xe8b73c, 0x7fb3d5, 0xe07a5f, 0x9b7fd0, 0x5a9e4a, 0xd27a2e];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const { group, legL, legR } = pedModel(pick(rng, pedColors));
    scene.add(group);
    const bx = pick(rng, [-140, -100, -60, -20, 20, 60, 100, 140]);
    const bz = pick(rng, [-140, -100, -60, -20, 20, 60, 100, 140]);
    peds.push({
      group, legL, legR,
      bx, bz,
      edge: rangeInt(rng, 0, 3), // 0 north, 1 east, 2 south, 3 west side of the block
      along: range(rng, -15, 15),
      dir: rng() < 0.5 ? 1 : -1,
      speed: range(rng, 1.2, 1.9),
      phase: range(rng, 0, 6),
      flee: 0, down: 0, downTimer: 0,
      x: bx, z: bz, heading: 0,
    });
  }
  return { cars, parked, peds };
}

// Steer a traffic car toward its next intersection on the road graph.
function trafficSteer(car, dt) {
  // Current road: the nearest road line; target is the next intersection along it.
  const onX = Math.abs(car.z - nearestRoad(car.z)) < Math.abs(car.x - nearestRoad(car.x));
  let targetX;
  let targetZ;
  if (onX) {
    const roadZ = nearestRoad(car.z);
    const dir = Math.sin(car.heading) >= 0 ? 1 : -1;
    targetX = car.x + dir * 30;
    targetZ = roadZ;
  } else {
    const roadX = nearestRoad(car.x);
    const dir = Math.cos(car.heading) >= 0 ? 1 : -1;
    targetX = roadX;
    targetZ = car.z + dir * 30;
  }
  // At an intersection, sometimes turn onto the crossing road.
  const nearInt = Math.abs(car.x - nearestRoad(car.x)) < 6 && Math.abs(car.z - nearestRoad(car.z)) < 6;
  if (nearInt && Math.random() < 0.02) {
    car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  return { throttle: car.stopped > 0 ? 0 : 0.55, steer, handbrake: false };
}

function nearestRoad(v) {
  let best = ROAD_AT[0];
  for (const r of ROAD_AT) if (Math.abs(v - r) < Math.abs(v - best)) best = r;
  return best;
}

export function updateTraffic(traffic, dt, collideCircle, playerCar, playerPos, policeCars) {
  for (const car of traffic.cars) {
    if (car.stopped > 0) {
      car.stopped -= dt;
      car.vx = 0;
      car.vz = 0;
      syncCar(car);
      continue;
    }
    // Brake if the player's car is right ahead.
    let brake = false;
    if (playerCar) {
      const dx = playerCar.x - car.x;
      const dz = playerCar.z - car.z;
      const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
      if (ahead > 0 && ahead < 9 && side < 2.5) brake = true;
    }
    // Yield to a police car ahead: pull over so the chase can get through.
    if (!brake && policeCars) {
      for (const pc of policeCars) {
        const dx = pc.x - car.x;
        const dz = pc.z - car.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 12 && side < 3) { brake = true; break; }
      }
    }
    const ctrl = trafficSteer(car, dt);
    if (brake) ctrl.throttle = -0.6;
    // Drive with the same arcade model, capped at cruise speed.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const fwd = car.vx * fx + car.vz * fz;
    car.vx += fx * ctrl.throttle * 15 * dt;
    car.vz += fz * ctrl.throttle * 15 * dt;
    const drag = 0.4;
    car.vx *= Math.max(0, 1 - drag * dt);
    car.vz *= Math.max(0, 1 - drag * dt);
    const grip = 8.5;
    const latX = car.vx - fx * fwd;
    const latZ = car.vz - fz * fwd;
    car.vx = fx * fwd + latX * Math.max(0, 1 - grip * dt);
    car.vz = fz * fwd + latZ * Math.max(0, 1 - grip * dt);
    car.steer += (ctrl.steer * 0.5 - car.steer) * Math.min(1, dt * 6);
    car.heading += car.steer * (fwd / 2.9) * dt;
    const sp = Math.hypot(car.vx, car.vz);
    if (sp > car.cruise) {
      car.vx *= car.cruise / sp;
      car.vz *= car.cruise / sp;
    }
    const hit = collideCircle(car.x + car.vx * dt, car.z + car.vz * dt, CAR_RADIUS);
    car.x = hit.x;
    car.z = hit.z;
    car.speed = fwd;
    syncCar(car);
  }
  for (const ped of traffic.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      ped.group.rotation.x = -Math.PI / 2;
      if (ped.down <= 0) {
        ped.group.rotation.x = 0;
        ped.flee = 2;
      }
      continue;
    }
    // Flee from a nearby car (player, traffic or police) or from the player on foot.
    let threat = null;
    if (playerPos) {
      const d = Math.hypot(playerPos.x - ped.x, playerPos.z - ped.z);
      if (d < 5) threat = playerPos;
    }
    if (!threat && policeCars) {
      for (const pc of policeCars) {
        if (Math.hypot(pc.x - ped.x, pc.z - ped.z) < 8) { threat = pc; break; }
      }
    }
    if (threat) ped.flee = 1.5;
    let speed = ped.speed;
    let heading = ped.heading;
    if (ped.flee > 0) {
      ped.flee -= dt;
      speed = 4.2;
      heading = Math.atan2(ped.x - (threat ? threat.x : ped.x), ped.z - (threat ? threat.z : ped.z));
    } else {
      // Walk the block perimeter: edge 0/2 are z sides, 1/3 are x sides.
      const off = 16.5;
      if (ped.edge === 0) { ped.z = ped.bz - off; ped.x += ped.dir * speed * dt; heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2; if (Math.abs(ped.x - ped.bx) > 15) { ped.edge = ped.dir > 0 ? 1 : 3; ped.along = 0; } }
      else if (ped.edge === 2) { ped.z = ped.bz + off; ped.x += ped.dir * speed * dt; heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2; if (Math.abs(ped.x - ped.bx) > 15) { ped.edge = ped.dir > 0 ? 1 : 3; } }
      else if (ped.edge === 1) { ped.x = ped.bx + off; ped.z += ped.dir * speed * dt; heading = ped.dir > 0 ? 0 : Math.PI; if (Math.abs(ped.z - ped.bz) > 15) { ped.edge = ped.dir > 0 ? 2 : 0; } }
      else { ped.x = ped.bx - off; ped.z += ped.dir * speed * dt; heading = ped.dir > 0 ? 0 : Math.PI; if (Math.abs(ped.z - ped.bz) > 15) { ped.edge = ped.dir > 0 ? 2 : 0; } }
    }
    if (ped.flee > 0) {
      ped.x += Math.sin(heading) * speed * dt;
      ped.z += Math.cos(heading) * speed * dt;
    }
    ped.heading = heading;
    ped.phase += dt * (speed > 3 ? 13 : 8);
    const swing = Math.sin(ped.phase) * 0.5;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = heading;
  }
}

// Knock a pedestrian down (car hit or bullet). Returns true if it was a fresh hit.
export function knockPed(ped) {
  if (ped.down > 0) return false;
  ped.down = 3;
  ped.group.rotation.x = -Math.PI / 2;
  return true;
}
