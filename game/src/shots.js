// Screenshot scenes (?shot=<name>&seed=1). Each stages a complete, deterministic scene
// — player, cars, police, wanted level, time of day — then the caller renders it twice
// and sets window.__shotReady. No physics tick runs after staging: the shot is frozen.
import { placeCar } from './vehicles.js';
import { placePlayer } from './player.js';

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'mission'];

export function stageShot(name, game) {
  const { city, player, traffic, police, wanted, missions, hud, car } = game;
  // Reset the world to a known state.
  wanted.level = 0;
  wanted.quiet = 0;
  wanted.bustedTimer = 0;
  for (const c of police.cars) game.scene.remove(c.group);
  for (const o of police.officers) game.scene.remove(o.group);
  police.cars.length = 0;
  police.officers.length = 0;
  missions.active = true;
  missions.index = 0;
  missions.step = 0;
  missions.timerMax = 0;
  missions.timer = 0;

  if (name === 'cover') {
    // Driving down the main avenue at golden hour: traffic, HUD, minimap, mission marker.
    city.setTimeOfDay(0.75);
    placeCar(car, 0, 60, 0);
    placePlayer(player, 0, 60, 0);
    game.inCar = true;
    game.playerCar = car;
    player.group.visible = false;
    game.cameraYaw = Math.PI;
    game.cameraPitch = 0.32;
    // A few traffic cars on the avenue ahead (south, toward the boardwalk), so the
    // street feels alive.
    const ahead = [[-2.5, 90, 0], [2.5, 120, 0], [-2.5, 150, 0]];
    for (let i = 0; i < ahead.length && i < traffic.cars.length; i += 1) {
      placeCar(traffic.cars[i], ahead[i][0], ahead[i][1], ahead[i][2]);
    }
    missions.index = 0;
    missions.step = 1;
    missions.beam.position.set(0, 20, 168);
    missions.diamond.position.set(0, 6, 168);
    missions.beam.visible = true;
    missions.diamond.visible = true;
    game.money = 1250;
    game.health = 100;
    game.objective = 'First Wheels: Drive to the boardwalk marker';
  } else if (name === 'foot') {
    // On foot next to a parked car, mission marker ahead, a pedestrian nearby.
    city.setTimeOfDay(0.5);
    placePlayer(player, -8, 158, Math.PI / 2);
    player.group.visible = true;
    const parked = traffic.parked[0];
    if (parked) placeCar(parked, -4, 160, Math.PI / 2);
    // A pedestrian crossing right by the player, so the street feels lived-in.
    const ped = traffic.peds[0];
    if (ped) {
      ped.x = -2;
      ped.z = 152;
      ped.group.position.set(ped.x, 0, ped.z);
    }
    game.inCar = false;
    game.playerCar = null;
    game.cameraYaw = -Math.PI / 2;
    game.cameraPitch = 0.25;
    missions.index = 0;
    missions.step = 0;
    missions.beam.position.set(0, 20, 168);
    missions.diamond.position.set(0, 6, 168);
    missions.beam.visible = true;
    missions.diamond.visible = true;
    game.money = 350;
    game.health = 100;
    game.objective = 'First Wheels: Steal a car (press E next to one)';
  } else if (name === 'chase') {
    // Police chase: wanted 3, three police cars behind, sirens on.
    city.setTimeOfDay(0.7);
    placeCar(car, 0, 40, 0);
    placePlayer(player, 0, 40, 0);
    game.inCar = true;
    game.playerCar = car;
    player.group.visible = false;
    game.cameraYaw = Math.PI;
    game.cameraPitch = 0.3;
    wanted.level = 3;
    const spots = [[-7, 34, 0.2], [7, 36, -0.2], [-6, 38, 0]];
    for (const [x, z, h] of spots) {
      const pc = game.spawnPoliceCar(x, z, h);
      pc.sirenPhase = x;
    }
    game.camDist = 14;
    missions.index = 2;
    missions.step = 1;
    missions.beam.position.set(160, 20, 0);
    missions.diamond.position.set(160, 6, 0);
    missions.beam.visible = true;
    missions.diamond.visible = true;
    game.money = 2100;
    game.health = 82;
    game.objective = 'Hot Getaway: Lose the cops, then reach the safehouse';
  } else {
    // The Bay Job escape at sunset: driving the getaway car east along the z=0 road
    // straight toward the safehouse marker (160, 0), so the beam is dead ahead and
    // unobstructed; wanted stars up from the bank job.
    city.setTimeOfDay(0.95);
    placeCar(car, 100, 0, Math.PI / 2);
    placePlayer(player, 100, 0, Math.PI / 2);
    game.inCar = true;
    game.playerCar = car;
    player.group.visible = false;
    game.cameraYaw = (Math.PI * 3) / 2;
    game.cameraPitch = 0.3;
    game.camDist = 11;
    wanted.level = 2;
    missions.index = 4;
    missions.step = 2;
    missions.beam.position.set(160, 20, 0);
    missions.diamond.position.set(160, 6, 0);
    missions.beam.visible = true;
    missions.diamond.visible = true;
    game.money = 3400;
    game.health = 100;
    game.objective = 'The Bay Job: Escape to the safehouse with the cash';
  }
  // Refresh the HUD once for the staged state.
  hud.update(
    {
      health: game.health, money: game.money, wanted: wanted.level,
      objective: game.objective, timer: 0, timerMax: 0,
      speedKmh: game.inCar ? 62 : 0, inCar: game.inCar, onFoot: !game.inCar,
    },
    0,
  );
  return name;
}
