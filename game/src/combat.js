// Combat: a hitscan pistol (on foot), with muzzle flash, a tracer, ammo and reload.
// Targets are registered by the world (peds, guards, officers, cars) as { object3D,
// position, radius, health, onHit, onKill }. Shooting a civilian or a cop raises wanted.
import * as THREE from 'three';

export function createCombat(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
  // A thicker tracer, so a shot reads clearly even in bright daylight.
  const tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  const tracer = new THREE.Mesh(tracerGeo, tracerMat);
  tracer.visible = false;
  scene.add(tracer);
  const flash = new THREE.PointLight(0xffc860, 0, 14);
  scene.add(flash);
  return {
    scene, tracer, flash,
    ammo: 15, magSize: 15,
    cooldown: 0, flashTimer: 0, tracerTimer: 0,
  };
}

// Fire one shot from `origin` along `dir`. `targets` is the registered target list.
// Returns the hit target (or null).
export function shoot(combat, origin, dir, targets, audio, onCrime) {
  if (combat.cooldown > 0 || combat.ammo <= 0) return null;
  combat.cooldown = 0.28;
  combat.ammo -= 1;
  audio.gunshot();
  combat.flash.position.copy(origin).addScaledVector(dir, 1.2);
  combat.flash.intensity = 26;
  combat.flashTimer = 0.06;
  const ray = new THREE.Raycaster(origin, dir, 0.1, 80);
  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    if (t.dead) continue;
    const to = new THREE.Vector3(t.x - origin.x, (t.y || 1.2) - origin.y, t.z - origin.z);
    const along = to.dot(dir);
    if (along < 0.5 || along > 80) continue;
    const perp = to.clone().addScaledVector(dir, -along).length();
    if (perp < (t.radius || 1.2) && along < bestDist) {
      best = t;
      bestDist = along;
    }
  }
  const end = origin.clone().addScaledVector(dir, best ? bestDist : 60);
  combat.tracer.position.copy(origin).add(end).multiplyScalar(0.5);
  combat.tracer.lookAt(end);
  combat.tracer.scale.set(1, 1, origin.distanceTo(end));
  combat.tracer.visible = true;
  combat.tracerTimer = 0.12;
  if (best) {
    best.health -= 34;
    if (best.onHit) best.onHit(best);
    if (best.health <= 0 && !best.dead) {
      best.dead = true;
      if (best.onKill) best.onKill(best);
    } else if (best.crime) {
      onCrime(best.crime);
    }
  }
  return best;
}

export function updateCombat(combat, dt) {
  if (combat.cooldown > 0) combat.cooldown -= dt;
  if (combat.flashTimer > 0) {
    combat.flashTimer -= dt;
    if (combat.flashTimer <= 0) combat.flash.intensity = 0;
  }
  if (combat.tracerTimer > 0) {
    combat.tracerTimer -= dt;
    if (combat.tracerTimer <= 0) combat.tracer.visible = false;
  }
}

// A guard: an armed NPC that stands its ground and shoots at the player.
export function createGuard(scene, x, z) {
  const g = new THREE.Group();
  const armor = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), armor);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.78;
  g.add(head);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x222831 }));
  vest.position.y = 1.25;
  g.add(vest);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), armor);
  legL.position.set(-0.17, 0.39, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  g.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x111214 }));
  gun.position.set(0.3, 1.25, 0.4);
  g.add(gun);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    group: g, x, z, y: 1.2, radius: 1.1, health: 100, dead: false,
    fireTimer: 1, crime: 2,
  };
}

// Guards fire at the player when close. Returns damage dealt this frame (0 or more).
export function updateGuards(guards, dt, playerPos, combat, audio) {
  let damage = 0;
  for (const guard of guards) {
    if (guard.dead) continue;
    const dx = playerPos.x - guard.x;
    const dz = playerPos.z - guard.z;
    const d = Math.hypot(dx, dz);
    guard.group.rotation.y = Math.atan2(dx, dz);
    if (d < 32) {
      guard.fireTimer -= dt;
      if (guard.fireTimer <= 0) {
        guard.fireTimer = 0.9 + Math.random() * 0.7;
        // Inaccurate: roughly half the shots land.
        if (Math.random() < 0.55) {
          damage += 7;
          audio.thud();
        }
        const from = new THREE.Vector3(guard.x, 1.4, guard.z);
        const dir = new THREE.Vector3(playerPos.x - guard.x, 0, playerPos.z - guard.z).normalize();
        combat.tracer.position.copy(from).add(new THREE.Vector3(playerPos.x, 1.2, playerPos.z)).multiplyScalar(0.5);
        combat.tracer.lookAt(new THREE.Vector3(playerPos.x, 1.2, playerPos.z));
        combat.tracer.scale.set(1, 1, from.distanceTo(new THREE.Vector3(playerPos.x, 1.2, playerPos.z)));
        combat.tracer.visible = true;
        combat.tracerTimer = 0.09;
        combat.flash.position.copy(from);
        combat.flash.intensity = 18;
        combat.flashTimer = 0.05;
      }
    }
  }
  return damage;
}
