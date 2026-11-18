// Missions + story. You are Rico Vega, a driver in Solar Bay; Marina Sol, a fixer,
// calls the jobs. Six missions, each a chain of steps (go to a marker, pick up, deliver,
// lose the cops, grab and escape). A glowing beam + floating diamond + ground ring marks
// the target; completing a mission pays out and advances the story.
import * as THREE from 'three';
import { addWanted } from './police.js';

const MISSIONS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    giver: 'Marina Sol',
    briefing: 'Rico, welcome to Solar Bay. Every driver needs wheels. Take any car on the street — press E next to one — and bring it to the boardwalk marker.',
    steps: [
      { type: 'steal', text: 'Steal a car (press E next to one)', x: 0, z: 0 },
      { type: 'goto', text: 'Drive to the boardwalk marker', x: 0, z: 168 },
    ],
    reward: 200,
    done: 'Clean. You drive like you mean it. I have real work for you now.',
  },
  {
    id: 'delivery',
    title: 'Sunset Delivery',
    giver: 'Marina Sol',
    briefing: 'A package is waiting at the docks, south-west corner. Pick it up and get it to the Coral Hotel before the sun is gone — 90 seconds.',
    steps: [
      { type: 'pickup', text: 'Pick up the package at the docks', x: -160, z: 160 },
      { type: 'deliver', text: 'Deliver to the Coral Hotel (90 s)', x: 160, z: -120, time: 90 },
    ],
    reward: 350,
    done: 'On time. The client is happy, and happy clients pay twice.',
  },
  {
    id: 'getaway',
    title: 'Hot Getaway',
    giver: 'Marina Sol',
    briefing: 'The briefcase is at the plaza. Grab it — the cops will not like it. Lose them, then get to the safehouse on the east side.',
    steps: [
      { type: 'pickup', text: 'Grab the briefcase at the plaza', x: 0, z: 0 },
      { type: 'escape', text: 'Lose the cops, then reach the safehouse', x: 160, z: 0, heat: 2 },
    ],
    reward: 500,
    done: 'You vanished like smoke. The Bay is yours, Rico.',
  },
  {
    id: 'drops',
    title: 'Three Drops',
    giver: 'Marina Sol',
    briefing: 'Three packages, three corners of the Bay. Pick them all up, then bring them to the safehouse. No rush — but do not get caught holding them.',
    steps: [
      { type: 'pickup', text: 'Pick up the first drop (north-west)', x: -160, z: -160 },
      { type: 'pickup', text: 'Pick up the second drop (north-east)', x: 160, z: -160 },
      { type: 'pickup', text: 'Pick up the third drop (south-east)', x: 160, z: 160 },
      { type: 'deliver', text: 'Deliver all three to the safehouse', x: 160, z: 0 },
    ],
    reward: 650,
    done: 'Three drops, one driver, zero questions. You are the Bay\'s best courier now.',
  },
  {
    id: 'bayjob',
    title: 'The Bay Job',
    giver: 'Marina Sol',
    briefing: 'One last job. The Bay Bank vault, north plaza. Two guards inside — they shoot. Grab the cash on foot and run for the safehouse.',
    steps: [
      { type: 'goto', text: 'Drive to the Bay Bank, north plaza', x: 0, z: -160 },
      { type: 'grab', text: 'Grab the cash on foot — watch the guards', x: 0, z: -140 },
      { type: 'escape', text: 'Escape to the safehouse with the cash', x: 160, z: 0, heat: 3 },
    ],
    reward: 800,
    done: 'Eight hundred thousand? No — eight hundred. But the legend is priceless. Solar Bay is yours now.',
  },
  {
    id: 'midnight',
    title: 'Midnight Run',
    giver: 'Marina Sol',
    briefing: 'One more job, Rico — the biggest yet. The ledger is at the east docks. Grab it, shake the heat, then get it to the Coral Hotel before midnight runs out — two minutes.',
    steps: [
      { type: 'pickup', text: 'Grab the ledger at the east docks', x: 160, z: 160 },
      { type: 'escape', text: 'Lose the cops, then reach the north plaza', x: 0, z: -160, heat: 2 },
      { type: 'deliver', text: 'Deliver the ledger to the Coral Hotel (120 s)', x: 160, z: -120, time: 120 },
    ],
    reward: 900,
    done: 'The ledger is ours. You are not just the Bay\'s best driver, Rico — you are its legend.',
  },
];

export function createMissions(scene, rng) {
  // Marker: a glowing beam + a spinning diamond + a ground ring, placed at the
  // current target. The ring marks the target on the road itself, so it reads
  // from far away even when the beam is behind a building.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.45, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 12, 1, true), beamMat);
  beam.position.y = 20;
  scene.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.3),
    new THREE.MeshBasicMaterial({ color: 0xffd23c }),
  );
  diamond.position.y = 6;
  scene.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 4.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  scene.add(ring);
  return {
    scene, list: MISSIONS,
    index: 0, step: 0,
    beam, diamond, ring,
    timer: 0, timerMax: 0,
    packageHeld: false,
    active: true,
    message: '',
  };
}

function current(missions) {
  return missions.list[missions.index];
}

export function missionObjective(missions) {
  if (!missions.active) return 'All jobs done — Solar Bay is yours. Free roam.';
  const m = current(missions);
  const s = m.steps[missions.step];
  return `${m.title}: ${s.text}`;
}

export function startMission(missions, wanted, onMessage) {
  const m = current(missions);
  missions.step = 0;
  missions.timer = 0;
  missions.timerMax = 0;
  missions.packageHeld = false;
  onMessage(`${m.giver}: ${m.briefing}`);
  placeMarker(missions);
  return m;
}

function placeMarker(missions) {
  if (!missions.active) {
    missions.beam.visible = false;
    missions.diamond.visible = false;
    missions.ring.visible = false;
    return;
  }
  const s = current(missions).steps[missions.step];
  missions.beam.visible = true;
  missions.diamond.visible = true;
  missions.ring.visible = true;
  missions.beam.position.x = s.x;
  missions.beam.position.z = s.z;
  missions.diamond.position.x = s.x;
  missions.diamond.position.z = s.z;
  missions.ring.position.x = s.x;
  missions.ring.position.z = s.z;
}

// Advance the mission chain. Called every frame with the player's position and state.
// Returns an event: null, 'step', 'complete', 'failed', or 'all-done'.
export function updateMissions(missions, dt, px, pz, inCar, stoleCar, wanted, onMessage, spawnGuards) {
  if (!missions.active) return null;
  const m = current(missions);
  const s = m.steps[missions.step];
  missions.diamond.rotation.y += dt * 2;
  missions.diamond.position.y = 6 + Math.sin(performance.now() / 350) * 0.5;
  if (missions.timerMax > 0) {
    missions.timer += dt;
    if (missions.timer > missions.timerMax) {
      onMessage('Too slow — the job fell through. Try again from the marker.');
      missions.timer = 0;
      missions.timerMax = 0;
      missions.step = 0;
      placeMarker(missions);
      return 'failed';
    }
  }
  const d = Math.hypot(px - s.x, pz - s.z);
  const reach = inCar ? 7 : 4.5;
  if (s.type === 'steal') {
    // Any car counts: the starter car is parked on the street, and taking a
    // traffic car is the same step (and raises wanted, via enterCar).
    if (inCar) {
      missions.step += 1;
      placeMarker(missions);
      onMessage('Got wheels. Now drive to the boardwalk.');
      return 'step';
    }
    return null;
  }
  if (d > reach) return null;
  // Reached the marker.
  if (s.type === 'pickup') {
    missions.packageHeld = true;
    onMessage('Package secured.');
  }
  if (s.type === 'deliver' || s.type === 'goto' || s.type === 'pickup') {
    missions.step += 1;
    if (s.type === 'deliver') missions.timerMax = 0;
    if (missions.step >= m.steps.length) return completeMission(missions, wanted, onMessage);
    const next = m.steps[missions.step];
    if (next.type === 'deliver' && next.time) {
      missions.timer = 0;
      missions.timerMax = next.time;
    }
    if (next.heat) addWanted(wanted, next.heat);
    if (next.type === 'grab' && spawnGuards) spawnGuards();
    placeMarker(missions);
    return 'step';
  }
  if (s.type === 'grab') {
    missions.packageHeld = true;
    onMessage('Cash grabbed! Run for the safehouse!');
    missions.step += 1;
    const next = m.steps[missions.step];
    if (next.heat) addWanted(wanted, next.heat);
    placeMarker(missions);
    return 'step';
  }
  if (s.type === 'escape') {
    // Escape counts only once the heat is down, or the player is at the safehouse with no cops near.
    if (wanted.level === 0) {
      missions.step += 1;
      if (missions.step >= m.steps.length) return completeMission(missions, wanted, onMessage);
      placeMarker(missions);
      return 'step';
    }
    return null;
  }
  return null;
}

function completeMission(missions, wanted, onMessage) {
  const m = current(missions);
  onMessage(`${m.title} complete — +$${m.reward}. ${m.done}`);
  missions.index += 1;
  missions.packageHeld = false;
  missions.timerMax = 0;
  if (missions.index >= missions.list.length) {
    missions.active = false;
    missions.beam.visible = false;
    missions.diamond.visible = false;
    missions.ring.visible = false;
    return 'all-done';
  }
  startMission(missions, wanted, onMessage);
  return 'complete';
}

export function missionReward(missions) {
  // Reward of the mission that just finished (index already advanced).
  return missions.list[Math.max(0, missions.index - 1)].reward;
}

export function markerPosition(missions) {
  if (!missions.active) return null;
  const s = current(missions).steps[missions.step];
  return { x: s.x, z: s.z };
}
