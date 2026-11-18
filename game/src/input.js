// Keyboard + mouse input. Keys are read by name (KeyW, Space, KeyE, KeyF, KeyR,
// ShiftLeft, Escape). Mouse drag orbits the camera; click (on foot) fires the pistol.
// Actions are edge-triggered: takeActions() returns what was pressed since last call.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_SHOOT = 8;
export const ACTION_RELOAD = 16;
export const ACTION_HANDBRAKE = 32;
export const ACTION_ZOOM = 64;
export const ACTION_MUTE = 128;

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    pressed.add('Mouse');
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  function down(code) {
    return keys.has(code);
  }

  // WASD + arrows, as -1/0/1 on each axis (forward, strafe). Forward is camera-relative.
  function move() {
    let f = 0;
    let s = 0;
    if (down('KeyW') || down('ArrowUp')) f += 1;
    if (down('KeyS') || down('ArrowDown')) f -= 1;
    if (down('KeyD') || down('ArrowRight')) s += 1;
    if (down('KeyA') || down('ArrowLeft')) s -= 1;
    return { forward: f, strafe: s, run: down('ShiftLeft') || down('ShiftRight') };
  }

  function takeMouseDelta() {
    const d = { x: mouseDX, y: mouseDY };
    mouseDX = 0;
    mouseDY = 0;
    return d;
  }

  function takeActions() {
    let actions = 0;
    if (pressed.has('Enter') || pressed.has('Space') || pressed.has('Mouse')) actions |= ACTION_CONFIRM;
    if (pressed.has('Escape') || pressed.has('KeyP')) actions |= ACTION_PAUSE;
    if (pressed.has('KeyE')) actions |= ACTION_ENTER_CAR;
    if (pressed.has('KeyF') || pressed.has('Mouse')) actions |= ACTION_SHOOT;
    if (pressed.has('KeyR')) actions |= ACTION_RELOAD;
    if (pressed.has('KeyC')) actions |= ACTION_ZOOM;
    if (pressed.has('KeyM')) actions |= ACTION_MUTE;
    if (down('Space')) actions |= ACTION_HANDBRAKE;
    pressed.clear();
    return actions;
  }

  return { down, move, takeMouseDelta, takeActions };
}
