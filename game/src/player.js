// Rico Vega on foot: camera-relative WASD movement, run with Shift, a walk cycle
// from swinging limbs, and collision against the city's buildings.
import { PLAYER } from './config.js';
import { makePersonMesh } from './render.js';

export function createPlayer(scene) {
  const parts = makePersonMesh(0x3d7bd9, 0xc98d64);
  scene.add(parts.group);
  const state = {
    x: 0, z: 0, heading: 0,
    vx: 0, vz: 0,
    health: PLAYER.health,
    moving: false,
    walkPhase: 0,
  };

  function place(x, z, heading) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    state.vx = 0;
    state.vz = 0;
    parts.group.position.set(x, 0, z);
    parts.group.rotation.y = heading;
  }

  function step(dt, move, camYaw, running, city) {
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Camera-relative movement: W walks away from the camera, D strafes right.
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = -fz;
    const rz = fx;
    let tx = fx * -move.y + rx * move.x;
    let tz = fz * -move.y + rz * move.x;
    const len = Math.hypot(tx, tz);
    if (len > 1) {
      tx /= len;
      tz /= len;
    }
    const tvx = tx * speed;
    const tvz = tz * speed;
    const k = Math.min(1, dt * 10);
    state.vx += (tvx - state.vx) * k;
    state.vz += (tvz - state.vz) * k;
    const fixed = city.collide(state.x + state.vx * dt, state.z + state.vz * dt, PLAYER.radius);
    state.x = fixed.x;
    state.z = fixed.z;

    state.moving = Math.hypot(state.vx, state.vz) > 0.5;
    if (state.moving) {
      const targetHeading = Math.atan2(state.vx, state.vz);
      let dh = targetHeading - state.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      state.heading += dh * Math.min(1, dt * 12);
      state.walkPhase += dt * Math.hypot(state.vx, state.vz) * 1.5;
    }
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.55 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.7;
    parts.armR.rotation.x = swing * 0.7;
    parts.group.position.set(state.x, 0, state.z);
    parts.group.rotation.y = state.heading;
  }

  function hurt(amount) {
    state.health = Math.max(0, state.health - amount);
    return state.health;
  }

  function heal(amount) {
    state.health = Math.min(PLAYER.health, state.health + amount);
  }

  return { state, parts, place, step, hurt, heal };
}
