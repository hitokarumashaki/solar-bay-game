// localStorage save/load for Solar Bay: money, mission progress, health, position.
// Save key v2: v2 added a fifth mission, so v1 saves (which index the old 4-mission
// list) are not carried over — a v1 save simply starts a fresh game.
export const SAVE_KEY = 'solarbay-save-v2';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
