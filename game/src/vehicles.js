// Cars: a box-built car model (body, cabin, wheels, lights) and arcade driving physics.
// Velocity-vector model: engine force along the heading, lateral grip bleeds off sideways
// slide (handbrake lowers grip, so the car drifts). Circle-vs-building collision.
import * as THREE from 'three';

export const CAR_COLORS = [0xd23b2e, 0x2e6fd2, 0xe8b73c, 0x3aa655, 0xe8e4da, 0x22242a, 0x7a4fd0, 0xd27a2e];
export const CAR_RADIUS = 1.7;

export function createCarModel(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0x1a1c20 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : 0x222831 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), cabinMat);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  // Windows: a slightly inset dark box so the cabin reads as glass + roof.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.3, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x9fd8e8 }),
  );
  glass.position.set(0, 1.18, -0.25);
  g.add(glass);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.9), bodyMat);
  roof.position.set(0, 1.42, -0.25);
  g.add(roof);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    g.add(wheel);
    wheels.push(wheel);
  }
  // Headlights + taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.8 });
  for (const hx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    lamp.position.set(hx, 0.62, 2.12);
    g.add(lamp);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2a1a, emissive: 0xaa1000, emissiveIntensity: 0.7 });
  for (const hx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat);
    lamp.position.set(hx, 0.62, -2.12);
    g.add(lamp);
  }
  let lightBar = null;
  if (police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.6 }),
    );
    red.position.x = -0.35;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x0022ff, emissiveIntensity: 1.6 }),
    );
    blue.position.x = 0.35;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.52, -0.25);
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    g.add(lightBar);
  }
  return { group: g, wheels, lightBar };
}

// A drivable car: position, heading, velocity vector, steering. `driver` is 'player',
// 'traffic' or 'police'; traffic/police cars are driven by their AI instead of input.
export function createCar(scene, color, police) {
  const { group, wheels, lightBar } = createCarModel(color, police);
  scene.add(group);
  const car = {
    group, wheels, lightBar, police: !!police,
    x: 0, z: 0, heading: 0,
    vx: 0, vz: 0,
    steer: 0,
    speed: 0,
    health: 100,
    dead: false,
    sirenPhase: 0,
  };
  return car;
}

export function placeCar(car, x, z, heading) {
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.vx = 0;
  car.vz = 0;
  car.speed = 0;
  syncCar(car);
}

export function syncCar(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  // Wheels spin with speed; front wheels yaw with steering.
  const spin = car.speed * 0.06;
  for (let i = 0; i < car.wheels.length; i += 1) {
    car.wheels[i].rotation.x += spin;
    if (i < 2) car.wheels[i].rotation.y = car.steer * 0.9;
  }
  if (car.lightBar) {
    car.sirenPhase += 0.25;
    const on = Math.sin(car.sirenPhase) > 0;
    car.lightBar.userData.red.material.emissiveIntensity = on ? 2.2 : 0.25;
    car.lightBar.userData.blue.material.emissiveIntensity = on ? 0.25 : 2.2;
  }
}

// Arcade drive step. `ctrl` is { throttle -1..1, steer -1..1, handbrake }.
export function driveCar(car, ctrl, dt, collideCircle) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const forwardSpeed = car.vx * fx + car.vz * fz;
  const accel = ctrl.throttle >= 0 ? 15 : 22;
  car.vx += fx * ctrl.throttle * accel * dt;
  car.vz += fz * ctrl.throttle * accel * dt;
  // Drag + rolling resistance.
  const drag = 0.35 + (ctrl.throttle === 0 ? 0.9 : 0);
  car.vx *= Math.max(0, 1 - drag * dt);
  car.vz *= Math.max(0, 1 - drag * dt);
  // Grip: bleed off the sideways component (low grip = drift while handbraking).
  const grip = ctrl.handbrake ? 2.2 : 8.5;
  const latX = car.vx - fx * forwardSpeed;
  const latZ = car.vz - fz * forwardSpeed;
  const bleed = Math.max(0, 1 - grip * dt);
  car.vx = fx * forwardSpeed + latX * bleed;
  car.vz = fz * forwardSpeed + latZ * bleed;
  // Steering: less at speed, reversed when reversing.
  const steerTarget = ctrl.steer * 0.62 * (1 / (1 + Math.abs(forwardSpeed) * 0.045));
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 9);
  const turn = car.steer * (forwardSpeed / 2.9);
  car.heading += turn * dt;
  // Cap speed.
  const sp = Math.hypot(car.vx, car.vz);
  const maxSp = 30;
  if (sp > maxSp) {
    car.vx *= maxSp / sp;
    car.vz *= maxSp / sp;
  }
  const nx = car.x + car.vx * dt;
  const nz = car.z + car.vz * dt;
  const hit = collideCircle(nx, nz, CAR_RADIUS);
  const crashed = hit.hit && sp > 6;
  if (hit.hit) {
    // Kill the velocity component that ran into the wall.
    const dx = hit.x - car.x;
    const dz = hit.z - car.z;
    const moved = Math.hypot(dx, dz);
    if (moved > 0.001) {
      const nx2 = dx / moved;
      const nz2 = dz / moved;
      const into = car.vx * nx2 + car.vz * nz2;
      if (into > 0) {
        car.vx -= nx2 * into * 1.4;
        car.vz -= nz2 * into * 1.4;
      }
    }
  }
  car.x = hit.x;
  car.z = hit.z;
  car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  syncCar(car);
  return { crashed };
}

// Push two cars apart (circle-circle) so traffic and police do not overlap the player.
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = CAR_RADIUS * 2 - 0.4;
  if (d > 0.001 && d < min) {
    const push = (min - d) / 2;
    const nx = dx / d;
    const nz = dz / d;
    a.x -= nx * push;
    a.z -= nz * push;
    b.x += nx * push;
    b.z += nz * push;
    syncCar(a);
    syncCar(b);
    return true;
  }
  return false;
}
