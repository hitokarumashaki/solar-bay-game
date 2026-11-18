// Solar Bay: boot and the one loop. The world advances in fixed 1/60 s steps; the
// renderer paints what is there. Screens: start, play, pause, end (wasted/busted).
// ?seed=N fixes the city. ?shot=cover|foot|chase|mission (with &seed=N) stages that
// scene, renders it twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { createRandom } from './random.js';
import {
  createInput,
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER_CAR, ACTION_SHOOT, ACTION_RELOAD, ACTION_HANDBRAKE, ACTION_ZOOM,
} from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createCar, placeCar, driveCar, separateCars, CAR_RADIUS } from './vehicles.js';
import { createPlayer, placePlayer, stepPlayer } from './player.js';
import { createTraffic, updateTraffic, knockPed } from './traffic.js';
import { createWanted, addWanted, createPolice, updatePolice } from './police.js';
import { createMissions, missionObjective, startMission, updateMissions, missionReward, markerPosition } from './missions.js';
import { createCombat, shoot, updateCombat, createGuard, updateGuards } from './combat.js';
import { createHud } from './hud.js';
import { readSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

// --- Scene ---
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 6, -12);

// --- World ---
const city = buildCity(scene, rng);
const player = createPlayer(scene);
const traffic = createTraffic(scene, city, rng);
const wanted = createWanted();
const police = createPolice(scene, rng);
const missions = createMissions(scene, rng);
const combat = createCombat(scene);
const audio = createAudio();
const hud = createHud(document);
const input = createInput(canvas);

// The player's own car (red, parked by the boardwalk). Other cars can be stolen.
const car = createCar(scene, 0xd23b2e, false);
car.owned = true;
placeCar(car, 2, 150, 0);
placePlayer(player, 0, 148, 0);

const guards = [];
const game = {
  scene, city, player, traffic, police, wanted, missions, hud, car,
  inCar: false, playerCar: null,
  money: 0, health: 100,
  cameraYaw: Math.PI, cameraPitch: 0.3,
  objective: '',
  ramCooldown: 0,
  camFar: false,
  spawnPoliceCar(x, z, h) {
    const pc = createCar(scene, 0x1a1c20, true);
    pc.topSpeed = 29;
    placeCar(pc, x, z, h);
    police.cars.push(pc);
    return pc;
  },
};

// QA handle: lets automated tests (and the finalist review) read live game state.
// It changes nothing about the game itself.
window.__solarBay = game;

function saveGame() {
  writeSave({
    money: game.money,
    missionIndex: missions.index,
    missionStep: missions.step,
    health: game.health,
    x: player.x, z: player.z,
    inCar: game.inCar,
  });
}

function loadSave(data) {
  game.money = data.money || 0;
  game.health = data.health || 100;
  missions.index = Math.min(data.missionIndex || 0, missions.list.length - 1);
  missions.step = data.missionStep || 0;
  missions.active = missions.index < missions.list.length;
  placePlayer(player, data.x ?? 0, data.z ?? 148, 0);
  game.inCar = false;
  game.playerCar = null;
  player.group.visible = true;
}

function spawnGuards() {
  if (guards.length > 0) return;
  // On the road by the bank vault, flanking the cash marker — not inside a building.
  for (const [x, z] of [[-4, -136], [4, -144]]) {
    guards.push(createGuard(scene, x, z));
  }
  hud.showMessage('Guards! They shoot — fight back or run!', 4);
}

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  const all = [...traffic.cars, ...traffic.parked, car];
  for (const c of all) {
    if (c === game.playerCar) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function enterCar(target) {
  game.playerCar = target;
  game.inCar = true;
  game.car = target;
  player.group.visible = false;
  if (!target.owned && !target.stolen) {
    target.stolen = true;
    addWanted(wanted, 1);
    hud.showMessage('Car stolen! The cops are onto you.', 3);
  }
  // Remove it from traffic so its AI stops driving it.
  const ti = traffic.cars.indexOf(target);
  if (ti >= 0) traffic.cars.splice(ti, 1);
  const pi = traffic.parked.indexOf(target);
  if (pi >= 0) traffic.parked.splice(pi, 1);
  audio.click();
}

function exitCar() {
  if (!game.playerCar) return;
  const c = game.playerCar;
  // Step out to the side of the car.
  const sx = c.x + Math.cos(c.heading) * 2.4;
  const sz = c.z - Math.sin(c.heading) * 2.4;
  const hit = city.collideCircle(sx, sz, 0.55);
  placePlayer(player, hit.x, hit.z, c.heading);
  player.group.visible = true;
  game.playerCar = null;
  game.inCar = false;
  // The car stays parked where it is.
  c.vx = 0;
  c.vz = 0;
  c.parked = true;
  traffic.parked.push(c);
  audio.click();
}

// Combat targets, rebuilt every frame from the live world.
function combatTargets() {
  const targets = [];
  for (const ped of traffic.peds) {
    if (ped.down > 0) continue;
    targets.push({
      x: ped.x, z: ped.z, y: 1.2, radius: 1.0, health: 30, dead: false, crime: 1,
      onHit: () => { if (knockPed(ped)) addWanted(wanted, 1); },
      onKill: () => { knockPed(ped); },
    });
  }
  for (const guard of guards) {
    if (guard.dead) continue;
    targets.push({
      x: guard.x, z: guard.z, y: 1.2, radius: 1.1, health: guard.health, dead: false, crime: 2,
      onHit: () => { guard.health -= 34; },
      onKill: () => {
        guard.dead = true;
        guard.group.visible = false;
        addWanted(wanted, 1);
      },
    });
  }
  for (const off of police.officers) {
    targets.push({
      x: off.x, z: off.z, y: 1.2, radius: 1.0, health: 60, dead: false, crime: 2,
      onHit: () => {},
      onKill: () => {
        off.group.visible = false;
        off.x = 1e6;
        addWanted(wanted, 1);
      },
    });
  }
  for (const c of traffic.cars) {
    targets.push({
      x: c.x, z: c.z, y: 0.9, radius: 2.0, health: c.health, dead: c.dead, crime: 1,
      onHit: () => { c.health -= 34; },
      onKill: () => {
        c.dead = true;
        c.stopped = 999;
        c.health = 0;
        addWanted(wanted, 1);
      },
    });
  }
  return targets;
}

function updateCamera(dt) {
  const target = game.inCar && game.playerCar ? game.playerCar : player;
  const tx = target.x;
  const tz = target.z;
  const ty = game.inCar ? 1.4 : 1.6;
  let dist;
  let pitch;
  if (game.inCar) {
    // Chase cam: ease the yaw behind the car's heading; mouse drag offsets it.
    const want = game.playerCar.heading + Math.PI;
    let diff = want - game.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    game.cameraYaw += diff * Math.min(1, dt * 2.2);
    dist = game.camFar ? 14 : 10;
    pitch = 0.3;
    const speed = Math.abs(game.playerCar.speed);
    camera.fov += ((62 + Math.min(16, speed * 0.45)) - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  } else {
    dist = game.camFar ? 11 : 7;
    pitch = game.cameraPitch;
  }
  const cp = Math.cos(pitch);
  camera.position.set(
    tx + Math.sin(game.cameraYaw) * cp * dist,
    ty + Math.sin(pitch) * dist,
    tz + Math.cos(game.cameraYaw) * cp * dist,
  );
  camera.lookAt(tx, ty, tz);
}

function stepWorld(dt, actions) {
  const mouse = input.takeMouseDelta();
  game.cameraYaw -= mouse.x * 0.004;
  game.cameraPitch = Math.max(0.12, Math.min(0.9, game.cameraPitch + mouse.y * 0.003));

  // C toggles a farther chase camera (see more of the street).
  if (actions & ACTION_ZOOM) game.camFar = !game.camFar;

  // Enter / exit car.
  if (actions & ACTION_ENTER_CAR) {
    if (game.inCar) exitCar();
    else {
      const target = nearestCar(4.5);
      if (target) enterCar(target);
    }
  }

  const move = input.move();
  if (game.inCar && game.playerCar) {
    const c = game.playerCar;
    const ctrl = {
      throttle: move.forward,
      steer: -move.strafe,
      handbrake: !!(actions & ACTION_HANDBRAKE),
    };
    const { crashed } = driveCar(c, ctrl, dt, city.collideCircle);
    if (crashed) {
      game.health = Math.max(0, game.health - 4);
      audio.thud();
      hud.showMessage('Crash!', 1);
    }
    // Hit a pedestrian?
    for (const ped of traffic.peds) {
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - c.x, ped.z - c.z) < 2.0) {
        if (knockPed(ped)) {
          addWanted(wanted, 1);
          hud.showMessage('You hit a pedestrian!', 2);
        }
      }
    }
    // Bump traffic cars and police. A police ram at speed hurts (with a cooldown so
    // one long shove does not drain the whole health bar in a second).
    for (const other of traffic.cars) {
      if (separateCars(c, other)) {
        other.stopped = 1.2;
      }
    }
    if (game.ramCooldown > 0) game.ramCooldown -= dt;
    for (const pc of police.cars) {
      if (separateCars(c, pc)) {
        const ramSpeed = Math.hypot(pc.vx - c.vx, pc.vz - c.vz);
        if (ramSpeed > 8 && game.ramCooldown <= 0) {
          game.ramCooldown = 1.5;
          game.health = Math.max(0, game.health - 3);
          audio.thud();
          hud.showMessage('Police ram!', 1);
        }
      }
    }
  } else {
    const jumped = input.down('Space') && player.grounded;
    stepPlayer(player, move, jumped, game.cameraYaw, dt, city.collideCircle);
    // Shoot on foot.
    if (actions & ACTION_SHOOT) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = camera.position.clone();
      const hit = shoot(combat, origin, dir, combatTargets(), audio, (crime) => addWanted(wanted, crime));
      if (hit) {
        audio.hit();
        hud.showHitmark();
        hud.showMessage('Hit!', 0.6);
      }
      if (combat.ammo === 0) hud.showMessage('Press R to reload', 1.5);
    }
    if (actions & ACTION_RELOAD) {
      combat.ammo = combat.magSize;
      audio.click();
    }
  }

  // Traffic, pedestrians, police, guards, missions.
  const playerPos = { x: player.x, z: player.z };
  updateTraffic(traffic, dt, city.collideCircle, game.inCar ? game.playerCar : null, playerPos, police.cars);
  const { busted, nearestPolice } = updatePolice(police, wanted, dt, city.collideCircle, player, game.inCar ? game.playerCar : null, scene);
  // Guards shoot at the player's real position — the car when driving, the player
  // on foot — not the stale spot where the player last got out.
  const guardTarget = game.inCar && game.playerCar
    ? { x: game.playerCar.x, z: game.playerCar.z }
    : playerPos;
  const guardDamage = updateGuards(guards, dt, guardTarget, combat, audio);
  if (guardDamage > 0) {
    game.health = Math.max(0, game.health - guardDamage);
    hud.showMessage('You are being shot!', 1);
  }
  updateCombat(combat, dt);
  // Missions track the car when driving, the player on foot.
  const mx = game.inCar && game.playerCar ? game.playerCar.x : player.x;
  const mz = game.inCar && game.playerCar ? game.playerCar.z : player.z;
  const ev = updateMissions(
    missions, dt, mx, mz, game.inCar, game.playerCar ? !!game.playerCar.stolen : false,
    wanted, (text) => hud.showDialogue(text, 6), spawnGuards,
  );
  if (ev === 'complete' || ev === 'all-done') {
    game.money += missionReward(missions);
    audio.chime();
    hud.showMessage(ev === 'all-done' ? 'ALL JOBS DONE — Solar Bay is yours!' : `Mission complete! +$${missionReward(missions)}`, 3.5);
    saveGame();
  }
  // Health regen (slow) and audio.
  if (game.health > 0 && game.health < 100) game.health = Math.min(100, game.health + dt * 1.5);
  const speed = game.inCar && game.playerCar ? game.playerCar.speed : 0;
  const skidding = game.inCar && (input.down('Space')) && Math.abs(speed) > 4;
  audio.update(dt, speed, move.forward !== 0, nearestPolice < 60, skidding);

  // HUD + minimap.
  game.objective = missionObjective(missions);
  hud.update(
    {
      health: game.health, money: game.money, wanted: wanted.level,
      objective: game.objective, timer: missions.timer, timerMax: missions.timerMax,
      speedKmh: Math.abs(speed) * 3.6, inCar: game.inCar, onFoot: !game.inCar,
    },
    dt,
  );
  const marker = markerPosition(missions);
  hud.drawMinimap({
    playerX: player.x, playerZ: player.z,
    playerHeading: game.inCar && game.playerCar ? game.playerCar.heading : player.heading,
    trafficCars: traffic.cars, policeCars: police.cars, marker,
  });

  updateCamera(dt);
  if (busted) return 'busted';
  if (game.health <= 0) return 'wasted';
  return null;
}

function runShot(name) {
  hud.hideOverlay();
  stageShot(name, game);
  // Position the camera for the staged scene, then render twice.
  const target = game.inCar && game.playerCar ? game.playerCar : player;
  const cp = Math.cos(game.cameraPitch);
  const dist = game.camDist || (game.inCar ? 10 : 7);
  camera.position.set(
    target.x + Math.sin(game.cameraYaw) * cp * dist,
    (game.inCar ? 1.4 : 1.6) + Math.sin(game.cameraPitch) * dist,
    target.z + Math.cos(game.cameraYaw) * cp * dist,
  );
  camera.lookAt(target.x, game.inCar ? 1.4 : 1.6, target.z);
  const marker = markerPosition(missions);
  hud.drawMinimap({
    playerX: player.x, playerZ: player.z,
    playerHeading: game.inCar && game.playerCar ? game.playerCar.heading : player.heading,
    trafficCars: traffic.cars, policeCars: police.cars, marker,
  });
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = 'start';
  let accumulator = 0;
  let last = performance.now();
  const saved = readSave();
  const startBtn = document.getElementById('start-button');
  const continueBtn = document.getElementById('continue-button');
  const resumeBtn = document.getElementById('resume-button');
  const restartBtn = document.getElementById('restart-button');
  const respawnBtn = document.getElementById('respawn-button');
  if (saved) continueBtn.style.display = 'inline-block';

  function startNew() {
    audio.ensure();
    game.money = 0;
    game.health = 100;
    missions.index = 0;
    missions.step = 0;
    missions.active = true;
    placePlayer(player, 0, 148, 0);
    game.inCar = false;
    game.playerCar = null;
    player.group.visible = true;
    wanted.level = 0;
    startMission(missions, wanted, (text) => hud.showDialogue(text, 7));
    screen = 'play';
    hud.setScreen('none');
  }

  function startContinue() {
    audio.ensure();
    loadSave(saved);
    if (missions.active) startMission(missions, wanted, (text) => hud.showDialogue(text, 7));
    screen = 'play';
    hud.setScreen('none');
  }

  function endGame(kind) {
    screen = 'end';
    const lost = Math.floor(game.money * 0.1);
    game.money -= lost;
    saveGame();
    if (kind === 'busted') hud.showEnd('BUSTED', `The Solar Bay PD caught you. You lost $${lost} in fines.`);
    else hud.showEnd('WASTED', `You did not make it. The medics took $${lost}.`);
    audio.thud();
  }

  function respawn() {
    game.health = 100;
    wanted.level = 0;
    wanted.quiet = 0;
    wanted.bustedTimer = 0;
    for (const c of police.cars) scene.remove(c.group);
    for (const o of police.officers) scene.remove(o.group);
    police.cars.length = 0;
    police.officers.length = 0;
    placePlayer(player, 0, -150, 0);
    game.inCar = false;
    game.playerCar = null;
    player.group.visible = true;
    screen = 'play';
    hud.setScreen('none');
    hud.showMessage('Back on the streets of Solar Bay.', 3);
  }

  startBtn.addEventListener('click', startNew);
  continueBtn.addEventListener('click', startContinue);
  resumeBtn.addEventListener('click', () => { screen = 'play'; hud.setScreen('none'); });
  restartBtn.addEventListener('click', () => { startNew(); });
  respawnBtn.addEventListener('click', respawn);

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (screen === 'play' && (actions & ACTION_PAUSE)) {
      screen = 'pause';
      hud.setScreen('pause');
      saveGame();
    } else if (screen === 'pause' && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = 'play';
      hud.setScreen('none');
    }
    if (screen === 'play') {
      // Edge-triggered actions (enter car, shoot, reload) fire once per frame, not
      // once per fixed step, or a single press would toggle twice in a slow frame.
      let stepActions = actions;
      while (accumulator >= STEP) {
        const result = stepWorld(STEP, stepActions);
        stepActions = 0;
        accumulator -= STEP;
        if (result === 'busted' || result === 'wasted') {
          endGame(result);
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      hud.setScreen('pause');
      saveGame();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  hud.setScreen('start');
  updateCamera(0);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
