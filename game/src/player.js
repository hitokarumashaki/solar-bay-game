// The player on foot: a low-poly third-person character (torso, head, swinging limbs),
// WASD movement relative to the camera yaw, run, jump, and entering/exiting cars.
import * as THREE from 'three';

const WALK_SPEED = 4.2;
const RUN_SPEED = 7.2;

export function createPlayer(scene) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), new THREE.MeshLambertMaterial({ color: 0xd23b2e }));
  cap.position.y = 2.02;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), pants);
  legL.position.set(-0.17, 0.39, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), shirt);
  armL.position.set(-0.43, 1.2, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.43;
  g.add(armR);
  scene.add(g);
  return {
    group: g, legL, legR, armL, armR,
    x: 0, z: 0, y: 0, vy: 0, heading: 0,
    walkPhase: 0, moving: false, grounded: true,
  };
}

export function placePlayer(player, x, z, heading) {
  player.x = x;
  player.z = z;
  player.y = 0;
  player.vy = 0;
  player.heading = heading;
  player.group.position.set(x, 0, z);
  player.group.rotation.y = heading;
}

// One step on foot. `move` is { forward, strafe, run } relative to camera yaw; `jump`
// is true on the frame Space was pressed. Returns whether the player is moving.
export function stepPlayer(player, move, jump, cameraYaw, dt, collideCircle) {
  const speed = move.run ? RUN_SPEED : WALK_SPEED;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  let dx = 0;
  let dz = 0;
  if (move.forward !== 0 || move.strafe !== 0) {
    // Forward is away from the camera (camera sits behind the player).
    dx = -sin * move.forward + cos * move.strafe;
    dz = -cos * move.forward - sin * move.strafe;
    const len = Math.hypot(dx, dz);
    dx = (dx / len) * speed;
    dz = (dz / len) * speed;
  }
  const nx = player.x + dx * dt;
  const nz = player.z + dz * dt;
  const hit = collideCircle(nx, nz, 0.55);
  player.x = hit.x;
  player.z = hit.z;
  if (move.forward !== 0 || move.strafe !== 0) {
    // Turn toward the movement direction smoothly instead of snapping, so the
    // character reads as running rather than teleporting its facing.
    const target = Math.atan2(dx, dz);
    let diff = target - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, dt * 14);
  }
  if (jump && player.grounded) {
    player.vy = 8;
    player.grounded = false;
  }
  if (!player.grounded) {
    player.vy -= 22 * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.grounded = true;
    }
  }
  player.moving = move.forward !== 0 || move.strafe !== 0;
  if (player.moving) player.walkPhase += dt * (move.run ? 13 : 9);
  const swing = player.moving ? Math.sin(player.walkPhase) * 0.55 : 0;
  player.legL.rotation.x = swing;
  player.legR.rotation.x = -swing;
  player.armL.rotation.x = -swing * 0.8;
  player.armR.rotation.x = swing * 0.8;
  // Lean into a run, so sprinting reads as effort rather than a faster walk.
  const lean = player.moving && move.run ? 0.12 : 0;
  player.group.rotation.x = lean;
  player.group.position.set(player.x, player.y, player.z);
  player.group.rotation.y = player.heading;
  return player.moving;
}
