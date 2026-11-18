// localStorage save/load for Solar Bay: money, mission progress, health, position.
// Save key v2: v2 added a fifth mission, so v1 saves (which index the old 4-mission
// list) are not carried over — a v1 save simply starts a fresh game.
// Saves also carry a version stamp (v5: 3) so a future format change can tell an
// old save from a new one instead of guessing from the mission index.
export const SAVE_KEY = 'solarbay-save-v2';
export const SAVE_VERSION = 3;

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    // A save stamped with a newer version than this build understands is not
    // carried over — it starts a fresh game instead of misreading the format.
    if (data.version && data.version > SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
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
