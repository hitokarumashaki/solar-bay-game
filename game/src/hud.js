// HUD: the DOM overlay (health, money, wanted stars, objective, speed, messages,
// dialogue, start/pause/wasted screens) and the canvas minimap (north-up: roads, beach,
// player arrow, traffic, police, mission marker).
import { ROAD_AT } from './city.js';

const MAP_SIZE = 180;
const MAP_SCALE = MAP_SIZE / 420;

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const healthFill = el('health-fill');
  const money = el('money');
  const stars = el('stars');
  const objective = el('objective');
  const objectiveTimer = el('objective-timer');
  const speed = el('speed');
  const message = el('message');
  const dialogue = el('dialogue');
  const crosshair = el('crosshair');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const startScreen = el('start-screen');
  const pauseScreen = el('pause-screen');
  const endScreen = el('end-screen');
  const endTitle = el('end-title');
  const endText = el('end-text');
  let messageTimer = 0;
  let dialogueTimer = 0;

  function showMessage(text, seconds) {
    message.textContent = text;
    message.style.opacity = '1';
    messageTimer = seconds || 2.6;
  }

  function showDialogue(text, seconds) {
    dialogue.textContent = text;
    dialogue.style.opacity = '1';
    dialogueTimer = seconds || 6;
  }

  function setScreen(name) {
    startScreen.style.display = name === 'start' ? 'flex' : 'none';
    pauseScreen.style.display = name === 'pause' ? 'flex' : 'none';
    endScreen.style.display = name === 'end' ? 'flex' : 'none';
  }

  function showEnd(title, text) {
    endTitle.textContent = title;
    endText.textContent = text;
    setScreen('end');
  }

  function hideOverlay() {
    startScreen.style.display = 'none';
    pauseScreen.style.display = 'none';
    endScreen.style.display = 'none';
    message.style.opacity = '0';
    dialogue.style.opacity = '0';
  }

  function update(state, dt) {
    healthFill.style.width = `${Math.max(0, Math.min(100, state.health))}%`;
    healthFill.style.background = state.health > 50 ? '#3ecf6a' : state.health > 25 ? '#e8b73c' : '#e03a2e';
    money.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
    let starHtml = '';
    for (let i = 0; i < 5; i += 1) starHtml += `<span class="${i < state.wanted ? 'on' : ''}">★</span>`;
    stars.innerHTML = starHtml;
    objective.textContent = state.objective;
    objectiveTimer.textContent = state.timerMax > 0 ? `${Math.max(0, Math.ceil(state.timerMax - state.timer))}s` : '';
    speed.textContent = state.inCar ? `${Math.round(Math.abs(state.speedKmh))} km/h` : '';
    speed.style.display = state.inCar ? 'block' : 'none';
    crosshair.style.display = state.onFoot ? 'block' : 'none';
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) message.style.opacity = '0';
    }
    if (dialogueTimer > 0) {
      dialogueTimer -= dt;
      if (dialogueTimer <= 0) dialogue.style.opacity = '0';
    }
  }

  function mapXY(x, z) {
    return [(x + 210) * MAP_SCALE, (z + 210) * MAP_SCALE];
  }

  function drawMinimap(world) {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Ocean + sand (south edge).
    const [, sandY] = mapXY(0, 170);
    const [, oceanY] = mapXY(0, 205);
    ctx.fillStyle = '#e8d5a8';
    ctx.fillRect(0, sandY, MAP_SIZE, oceanY - sandY);
    ctx.fillStyle = '#2a7fa8';
    ctx.fillRect(0, oceanY, MAP_SIZE, MAP_SIZE - oceanY);
    // Blocks.
    ctx.fillStyle = '#3a3f46';
    for (let bx = -140; bx <= 140; bx += 40) {
      for (let bz = -140; bz <= 140; bz += 40) {
        const [x, y] = mapXY(bx - 15, bz - 15);
        ctx.fillRect(x, y, 30 * MAP_SCALE, 30 * MAP_SCALE);
      }
    }
    // Roads.
    ctx.strokeStyle = '#8a8f98';
    ctx.lineWidth = 2;
    for (const r of ROAD_AT) {
      const [x0] = mapXY(-200, 0);
      const [x1] = mapXY(200, 0);
      const [, y] = mapXY(0, r);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      const [x] = mapXY(r, 0);
      const [, y0] = mapXY(0, -200);
      const [, y1] = mapXY(0, 200);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    // Mission marker: pulsing yellow diamond.
    if (world.marker) {
      const [mx, my] = mapXY(world.marker.x, world.marker.z);
      const pulse = 4 + Math.sin(performance.now() / 250) * 1.5;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic: small amber dots.
    ctx.fillStyle = '#e8b73c';
    for (const car of world.trafficCars) {
      const [x, y] = mapXY(car.x, car.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police: flashing red/blue dots.
    const policeOn = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = policeOn ? '#ff2a1a' : '#2a5aff';
    for (const car of world.policeCars) {
      const [x, y] = mapXY(car.x, car.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: white arrow.
    const [px, py] = mapXY(world.playerX, world.playerZ);
    const h = world.playerHeading;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + Math.sin(h) * 7, py + Math.cos(h) * 7);
    ctx.lineTo(px + Math.sin(h + 2.6) * 6, py + Math.cos(h + 2.6) * 6);
    ctx.lineTo(px + Math.sin(h - 2.6) * 6, py + Math.cos(h - 2.6) * 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  return { update, drawMinimap, showMessage, showDialogue, setScreen, showEnd, hideOverlay };
}
