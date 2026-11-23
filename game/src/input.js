// Keyboard and mouse state, read once a frame. Keys are tracked by their physical
// code so WASD and the arrows both drive, and the camera is dragged with the mouse
// (no pointer lock: it also works when the game is staged for a screenshot).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;

// Space is the handbrake while driving, so it is deliberately not a confirm key:
// a handbrake held at the moment the game ends must not restart it by accident.
const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let dragX = 0;
  let dragY = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let shootQueued = false;
  let focused = true;

  function codeOf(event) {
    return event.code || event.key;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(codeOf(event));
    const action = KEY_ACTIONS[codeOf(event)];
    if (action) actions |= action;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(codeOf(event))) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(codeOf(event)));
  window.addEventListener('blur', () => {
    keys.clear();
    focused = false;
  });
  window.addEventListener('focus', () => {
    focused = true;
  });

  // A press is a shot only when it is a quick click, not a camera drag: a drag
  // that moved more than a few pixels never fires the pistol.
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      downX = event.clientX;
      downY = event.clientY;
      downAt = performance.now();
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    if (mouseDown && Math.hypot(event.clientX - downX, event.clientY - downY) < 6 && performance.now() - downAt < 400) {
      shootQueued = true;
    }
    mouseDown = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!mouseDown) return;
    dragX += event.movementX || 0;
    dragY += event.movementY || 0;
  });

  function held(...codes) {
    return codes.some((code) => keys.has(code));
  }

  function direction() {
    let x = 0;
    let y = 0;
    if (held('KeyA', 'ArrowLeft')) x -= 1;
    if (held('KeyD', 'ArrowRight')) x += 1;
    if (held('KeyW', 'ArrowUp')) y -= 1;
    if (held('KeyS', 'ArrowDown')) y += 1;
    return { x, y };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  function takeDrag() {
    const taken = { x: dragX, y: dragY };
    dragX = 0;
    dragY = 0;
    return taken;
  }

  function takeShoot() {
    const taken = shootQueued;
    shootQueued = false;
    return taken;
  }

  function isRunning() {
    return held('ShiftLeft', 'ShiftRight');
  }

  function isHandbrake() {
    return held('Space');
  }

  function isMutedToggle() {
    if (keys.has('KeyM')) {
      keys.delete('KeyM');
      return true;
    }
    return false;
  }

  return { direction, takeActions, takeDrag, takeShoot, isRunning, isHandbrake, isMutedToggle, isFocused: () => focused };
}
