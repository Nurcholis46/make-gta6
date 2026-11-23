// Save and best-score storage in localStorage (this browser only). A save holds
// the cash, the mission reached, the player's spot and the best score; loading
// it puts the player back on the street where they left off.
import { SAVE_KEY } from './config.js';

export function saveGame(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: there is then nothing to clear.
  }
}
